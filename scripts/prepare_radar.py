"""Download DMI observed radar composites and reproject to the viewer image extent."""
import concurrent.futures as cf
from datetime import datetime,timezone
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
COLOUR_SCHEME='red-violet-v1'
COLOURS=np.array([[244,67,54,255],[233,50,96,255],[214,36,135,255],[187,32,170,255],[152,35,197,255],[118,36,214,255],[84,22,168,255]],dtype=np.uint8)

def get(url,params=None):
 for attempt in range(3):
  try:
   r=requests.get(url,params=params,timeout=45);r.raise_for_status();return r
  except requests.RequestException:
   if attempt==2:raise
   time.sleep(2*(attempt+1))

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
 with h5py.File(raw) as f:
  values=f['dataset1/data1/data'][:];what=f['what'].attrs;where=f['where'].attrs
  assert f['dataset1/data1'].attrs['quantity'].decode()=='DBZH'
  transformer=Transformer.from_crs('EPSG:4326',where['projdef'].decode(),always_xy=True)
  x,y=transformer.transform(lon,lat)
  left,top=transformer.transform(float(where['UL_lon'][0]),float(where['UL_lat'][0]))
  # DMI UL/UR/LL coordinates are pixel centres: spans equal (size-1)*500 m.
  ix=np.rint((x-left)/float(where['xscale'])).astype(int)
  iy=np.rint((top-y)/float(where['yscale'])).astype(int)
  valid=(ix>=0)&(ix<values.shape[1])&(iy>=0)&(iy<values.shape[0])
  sampled=values[np.clip(iy,0,values.shape[0]-1),np.clip(ix,0,values.shape[1]-1)]
  nodata=(~valid)|(sampled==what['nodata'])
  undetect=sampled==what['undetect']
  dbz=sampled.astype(float)*float(what['gain'])+float(what['offset'])
  rgba=np.zeros((HEIGHT,WIDTH,4),dtype=np.uint8)
  detected=(~nodata)&(~undetect)&(dbz>=0)
  rgba[detected]=COLOURS[np.searchsorted([10,20,30,40,50,60],dbz[detected],side='right')]
  rgba[nodata]=[130,140,150,80]
  Image.fromarray(rgba).save(png)
  observed=datetime.strptime(what['date'].decode()+what['time'].decode(),'%Y%m%d%H%M%S').replace(tzinfo=timezone.utc)
  info=dict(time=t,observed_time=observed.isoformat(),file='radar/'+png.name,colour_scheme=COLOUR_SCHEME,source_id=item['id'],source_pixel_size_m=int(where['xscale']),
   source_quantity='DBZH',gain=float(what['gain']),offset=float(what['offset']),nodata=int(what['nodata']),undetect=float(what['undetect']),
   coloured_pixels=int(detected.sum()),missing_pixels=int(nodata.sum()))
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
  width=WIDTH,height=HEIGHT,source_pixel_size_m=500,interval_seconds=600,colour_thresholds_dbz=[0,10,20,30,40,50,60],
  colour_scheme=COLOUR_SCHEME,colours_rgba=COLOURS.tolist(),missing_times=missing,failures=failures,frames=records)
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
 print('Ready:',len(records),'radar frames;',len(missing),'missing;',len(failures),'failures',flush=True)
