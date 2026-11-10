"""Prepare an offline, time-synchronised radar/wind/track explorer."""
import json, time
from pathlib import Path
import requests
import math
from race_times import viewer_time_window, validate_track_boundaries
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'viewer'; OUT.mkdir(exist_ok=True)

def get(url, params):
    for attempt in range(4):
        try:
            r=requests.get(url,params=params,timeout=60)
            if r.status_code==429 and attempt<3:
                print('Weather API rate limit; retrying in 60 seconds',flush=True)
                time.sleep(60)
                continue
            r.raise_for_status();return r
        except requests.RequestException:
            if attempt==3:raise
            time.sleep(2*(attempt+1))

def wind(model='era5'):
    cache=ROOT/f'data/weather/{model}_grid_gusts.json'
    if cache.exists():return json.loads(cache.read_text(encoding='utf-8'))
    points=[(54+i*.25,9.5+j*.25) for i in range(13) for j in range(19)]
    checkpoint=cache.with_suffix('.partial.json')
    result=json.loads(checkpoint.read_text(encoding='utf-8')) if checkpoint.exists() else []
    for offset in range(len(result),len(points),40):
        batch=points[offset:offset+40]
        url='https://archive-api.open-meteo.com/v1/archive' if model in ('era5','ecmwf_ifs') else 'https://historical-forecast-api.open-meteo.com/v1/forecast'
        r=get(url,dict(latitude=','.join(str(p[0]) for p in batch),longitude=','.join(str(p[1]) for p in batch),start_date='2026-06-11',end_date='2026-06-13',hourly='wind_speed_10m,wind_direction_10m,wind_gusts_10m',models=model,wind_speed_unit='ms',timezone='UTC',timeformat='unixtime',cell_selection='nearest',elevation=','.join(['nan']*len(batch))))
        data=r.json();result.extend(data if isinstance(data,list) else [data])
        checkpoint.write_text(json.dumps(result),encoding='utf-8')
    assert len(result)==len(points)
    assert all(len(p['hourly']['time'])==72 and all(v is not None for v in p['hourly']['wind_speed_10m']) for p in result)
    cache.write_text(json.dumps(result),encoding='utf-8');return result

def main():
    coast_source=json.loads((ROOT/'data/coastline-osm.geojson').read_text(encoding='utf-8'))
    coast_metadata=coast_source['metadata']
    if (coast_metadata.get('source')!='OpenStreetMap natural=coastline'
            or coast_metadata.get('license')!='ODbL-1.0'
            or not coast_metadata.get('attribution')):
        raise ValueError('Detailed OSM coastline requires OpenStreetMap source, ODbL-1.0 license and attribution metadata')
    layers={key:json.loads((ROOT/'data'/filename).read_text(encoding='utf-8'))
            for key,filename in (
                ('traffic_separation','traffic-separation.geojson'),
                ('military_areas','military-areas.geojson'),
                ('route_t','route-t.geojson'),
                ('land','land-osm.geojson'),
                ('course_lines','course-lines.geojson'))}
    wind_models={model:wind(model) for model in ('era5','ecmwf_ifs','dmi_harmonie_arome_europe')}
    radar=json.loads((OUT/'radar/manifest.json').read_text(encoding='utf-8'))
    print('Wind ready:',len(wind_models['era5']),'grid points, 3 models with gusts',flush=True)
    source=json.loads((ROOT/'data/tractrac/combined_tracks.json').read_text(encoding='utf-8'))
    validate_track_boundaries(source)
    start,end=viewer_time_window(source)
    boats=[]
    speed_sources={course:json.loads((ROOT/f'data/tractrac/speeds_{course}.json').read_text(encoding='utf-8'))
                   for course in ('groensund','boegestroemmen')}
    speed_count=0
    for key,points in source['tracks'].items():
        c=source['competitors'][key]
        selected=[[lon,lat,ms/1000] for lon,lat,ms in points]
        raw=speed_sources[c['source_course']]['tracks'][c['source_id']]
        lookup={tuple(p[:3]):p[3] for p in raw}
        speeds=[]
        for p in points:
            if tuple(p) not in lookup:raise ValueError(f'Speed record does not match source position: {key}: {p}')
            value=lookup[tuple(p)]
            # TracTrac formatSpeed uses km/h internally and divides by 1.852 for kts.
            speeds.append(value/1.852 if isinstance(value,(int,float)) and math.isfinite(value) and value>=0 else None)
        speed_count+=sum(v is not None for v in speeds)
        boats.append({'id':key,'name':c.get('nameShort',key),'course':c['source_course'],'points':selected,'speeds':speeds})
    coast=[]
    for f in coast_source['features']:
        g=f['geometry'];lines=[g['coordinates']] if g['type']=='LineString' else g['coordinates']
        coast.extend(lines)
    data={'start':start,'end':end,'boats':boats,'wind_models':wind_models,'radar':radar,'coast':coast,
          'coast_metadata':coast_metadata,
          'track_speed_metadata':{'source':'TracTrac MTB position.speed','source_unit':'km/h','unit':'knots',
            'conversion':'speed_raw / 1.852','finite_difference':False,'matched_positions':sum(len(b['points']) for b in boats),
            'valid_speeds':speed_count,'missing_speeds':sum(len(b['points']) for b in boats)-speed_count,
            'unit_reference':'https://live.tractrac.com/viewer/app.CuZgOaCm.js, formatSpeed/Kts'}}
    data.update(layers)
    (OUT/'data.js').write_text('window.DATA='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
    print('Ready:',len(radar['frames']),'radar frames;',len(boats),'boats',flush=True)


if __name__=='__main__':
    main()
