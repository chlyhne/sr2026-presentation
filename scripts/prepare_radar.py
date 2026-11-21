"""Download DMI observed radar composites and reproject to the viewer image extent."""
import concurrent.futures as cf
from datetime import datetime,timezone
from functools import lru_cache
import json,time
from pathlib import Path
import h5py,numpy as np,requests
from PIL import Image
from pyproj import Transformer
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data/radar';OUT=ROOT/'viewer/radar'
RAW.mkdir(exist_ok=True);OUT.mkdir(exist_ok=True)
START=1781164800;END=1781316000
WIDTH=1000;HEIGHT=1180
lon,lat=np.meshgrid(9.5+(np.arange(WIDTH)+.5)*4.5/WIDTH,57-(np.arange(HEIGHT)+.5)*3/HEIGHT)
COLOUR_SCHEME='dmi-radar-legend-v1'
# The 16 swatches of "Radar og lyn" at https://www.dmi.dk/radar, light to heavy.
COLOURS=np.array([
 [158,242,233,255], [125,238,226,255], [22,225,204,255], [109,191,242,255],
 [61,171,238,255], [0,143,233,255], [255,217,0,255], [255,178,0,255],
 [255,142,82,255], [255,181,181,255], [255,124,124,255], [255,82,82,255],
 [230,57,57,255], [204,31,31,255], [128,0,0,255], [92,0,51,255],
],dtype=np.uint8)
# The legend gives qualitative labels. Use DMI's documented 20/35/45 dBZ
# guidance for light/moderate/heavy when assigning the reflectivity bands.
COLOUR_THRESHOLDS_DBZ=(0,8,14,20,24,28,32,35,38,40,43,45,48,51,55,60)

def colour_metadata():
 return dict(colour_scheme=COLOUR_SCHEME,colour_thresholds_dbz=list(COLOUR_THRESHOLDS_DBZ),colours_rgba=COLOURS.tolist())

def get(url,params=None):
 for attempt in range(3):
  try:
   r=requests.get(url,params=params,timeout=45);r.raise_for_status();return r
  except requests.RequestException:
   if attempt==2:raise
   time.sleep(2*(attempt+1))

def scalar(attrs, key):
 return np.asarray(attrs[key]).item()

@lru_cache(maxsize=4)
def grid_indices(projection,ul_lon,ul_lat,xscale,yscale,shape,source):
 transformer=Transformer.from_crs('EPSG:4326',projection,always_xy=True)
 x,y=transformer.transform(lon,lat)
 left,top=transformer.transform(ul_lon,ul_lat)
 # DMI's upper-left coordinate marks the first pixel centre. OPERA uses a corner.
 if source=='DMI':
  ix=np.rint((x-left)/xscale).astype(int)
  iy=np.rint((top-y)/yscale).astype(int)
 elif source=='OPERA':
  ix=np.floor((x-left)/xscale).astype(int)
  iy=np.floor((top-y)/yscale).astype(int)
 else:
  raise ValueError('Unknown radar source: '+source)
 valid=(ix>=0)&(ix<shape[1])&(iy>=0)&(iy<shape[0])
 return np.clip(ix,0,shape[1]-1),np.clip(iy,0,shape[0]-1),valid

def prepare_frame(raw,png,t,source_id,source,file):
 with h5py.File(raw) as f:
  group=f['dataset1/data1'];values=group['data'];where=f['where'].attrs
  if source=='DMI':
   what=f['what'].attrs
   quantity=scalar(group.attrs,'quantity')
  elif source=='OPERA':
   what=group['what'].attrs
   quantity=scalar(what,'quantity')
  else:
   raise ValueError('Unknown radar source: '+source)
  if quantity!=b'DBZH':raise ValueError(f'{source_id} is not a DBZH composite')
  ix,iy,valid=grid_indices(scalar(where,'projdef').decode(),float(scalar(where,'UL_lon')),float(scalar(where,'UL_lat')),
    float(scalar(where,'xscale')),float(scalar(where,'yscale')),values.shape,source)
  left,right=int(ix.min()),int(ix.max())+1
  top,bottom=int(iy.min()),int(iy.max())+1
  sampled=values[top:bottom,left:right][iy-top,ix-left]
  nodata=(~valid)|(sampled==scalar(what,'nodata'))
  undetect=sampled==scalar(what,'undetect')
  gain,offset=float(scalar(what,'gain')),float(scalar(what,'offset'))
  dbz=sampled*gain+offset
  rgba=np.zeros((HEIGHT,WIDTH,4),dtype=np.uint8)
  detected=(~nodata)&(~undetect)&(dbz>=COLOUR_THRESHOLDS_DBZ[0])
  rgba[detected]=COLOURS[np.searchsorted(COLOUR_THRESHOLDS_DBZ[1:],dbz[detected],side='right')]
  rgba[nodata]=[130,140,150,80]
  temp=png.with_suffix('.png.tmp')
  Image.fromarray(rgba).save(temp,format='PNG')
  temp.replace(png)
  observed=datetime.strptime(scalar(f['what'].attrs,'date').decode()+scalar(f['what'].attrs,'time').decode(),'%Y%m%d%H%M%S').replace(tzinfo=timezone.utc)
  return dict(time=t,observed_time=observed.isoformat(),file=file,colour_scheme=COLOUR_SCHEME,source_id=source_id,
   source_pixel_size_m=int(scalar(where,'xscale')),source_quantity='DBZH',gain=gain,offset=offset,
   nodata=scalar(what,'nodata'),undetect=scalar(what,'undetect'),coloured_pixels=int(detected.sum()),missing_pixels=int(nodata.sum()))

def frame(item):
 t=int(datetime.fromisoformat(item['properties']['datetime'].replace('Z','+00:00')).timestamp())
 png=OUT/f'{t}.png';meta=OUT/f'{t}.json'
 if png.exists() and meta.exists():
  cached=json.loads(meta.read_text())
  if cached.get('colour_scheme')==COLOUR_SCHEME:return cached
 raw=RAW/item['id']
 if not raw.exists():
  asset=item.get('assets',item.get('asset'))['data']
  raw.write_bytes(get(asset['href']).content)
 info=prepare_frame(raw,png,t,item['id'],'DMI','radar/'+png.name)
 meta.write_text(json.dumps(info,indent=2));return info

if __name__=='__main__':
 catalog=RAW/'catalog.json'
 if not catalog.exists():
  r=get('https://opendataapi.dmi.dk/v1/radardata/collections/composite/items',dict(datetime='2026-06-11T08:00:00Z/2026-06-13T02:00:00Z',limit=2000))
  catalog.write_text(r.text)
 items=json.loads(catalog.read_text())['features']
 items=[item for item in items if item['properties']['scanType']=='fullRange' and int(datetime.fromisoformat(item['properties']['datetime'].replace('Z','+00:00')).timestamp())%600==0]
 assert len({item['id'] for item in items})==len(items)
 records=[];failures=[]
 with cf.ThreadPoolExecutor(max_workers=4) as pool:
  futures={pool.submit(frame,item):item for item in items}
  for n,f in enumerate(cf.as_completed(futures),1):
   try:records.append(f.result())
   except Exception as e:failures.append(dict(source_id=futures[f]['id'],error=str(e)))
   if n%25==0:print('Radar:',n,'/',len(items),flush=True)
 records.sort(key=lambda x:x['time'])
 missing=sorted(set(range(START,END+1,600))-{r['time'] for r in records})
 manifest=dict(source='DMI radar composite fullRange',quantity='DBZH',unit='dBZ',projection='EPSG:4326',bbox=[9.5,54,14,57],
  width=WIDTH,height=HEIGHT,source_pixel_size_m=500,interval_seconds=600,
  **colour_metadata(),missing_times=missing,failures=failures,frames=records)
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
 print('Ready:',len(records),'radar frames;',len(missing),'missing;',len(failures),'failures',flush=True)
