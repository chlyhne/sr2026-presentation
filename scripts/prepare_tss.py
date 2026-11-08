"""Cache OpenSeaMap traffic-separation geometry for the presentation map."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data/geography/osm-tss.json'
OUT=ROOT/'data/traffic-separation.geojson'
ENDPOINT='https://maps.mail.ru/osm/tools/overpass/api/interpreter'
SNAPSHOT='2026-06-13T02:00:00Z'
QUERY=f'[out:json][timeout:120][date:"{SNAPSHOT}"];nwr["seamark:type"~"^(separation_.*|inshore_traffic_zone|precautionary_area)$"](53.8,9.3,57.2,14.2);out geom;'
TYPES={'separation_zone','separation_line','separation_boundary','separation_lane','separation_roundabout','separation_crossing'}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,help='Use an existing Overpass JSON response')
    args=parser.parse_args()
    if args.source:
        raw=args.source.read_bytes()
    elif RAW.exists():
        raw=RAW.read_bytes()
    else:
        response=requests.get(ENDPOINT,params={'data':QUERY},timeout=(15,150),
                              headers={'User-Agent':'SR2026-Presentation/1.0 (traffic separation extract)'})
        response.raise_for_status();raw=response.content
    source=json.loads(raw)
    if source.get('remark'):
        raise ValueError('Incomplete Overpass response: '+source['remark'])
    features=[];aggregates=[];excluded=Counter()
    for item in source['elements']:
        tags=item.get('tags',{});kind=tags.get('seamark:type')
        if kind not in TYPES:
            excluded[kind or 'untagged']+=1
            continue
        if item['type']=='relation' and tags.get('type')=='traffic separation scheme':
            aggregates.append(item)
            continue
        if item['type']!='way':
            raise ValueError(f'Unsupported TSS geometry: {item["type"]}/{item["id"]}')
        points=[[p['lon'],p['lat']] for p in item.get('geometry',[])]
        if len(points)<2:
            raise ValueError(f'Missing TSS geometry: way/{item["id"]}')
        closed=bool(item.get('nodes')) and item['nodes'][0]==item['nodes'][-1]
        area=kind in {'separation_zone','separation_roundabout','separation_crossing'}
        if area and (not closed or len(points)<4):
            raise ValueError(f'Unclosed TSS area: way/{item["id"]}')
        features.append({'type':'Feature','id':f'way/{item["id"]}',
                         'properties':{'kind':kind,'name':tags.get('seamark:name',tags.get('name','')),
                                       'osm_id':item['id'],'tags':tags},
                         'geometry':{'type':'Polygon' if area else 'LineString',
                                     'coordinates':[points] if area else points}})
    ids={f['properties']['osm_id'] for f in features}
    for relation in aggregates:
        if not all(m['type']=='way' and m['ref'] in ids for m in relation.get('members',[])):
            raise ValueError('TSS aggregate contains geometry absent from the extract')
    if not features:
        raise ValueError('No traffic separation geometry returned')
    metadata={'source':'OpenSeaMap / OpenStreetMap seamarks','attribution':'© OpenStreetMap contributors',
              'copyright_url':'https://www.openstreetmap.org/copyright','license':'ODbL-1.0',
              'license_url':'https://opendatacommons.org/licenses/odbl/1-0/',
              'downloaded_at':datetime.now(timezone.utc).isoformat(),'snapshot':SNAPSHOT,
              'server_base_timestamp':source.get('osm3s',{}).get('timestamp_osm_base'),
              'endpoint':ENDPOINT,'query':QUERY,'query_bbox':[9.3,53.8,14.2,57.2],
              'counts':dict(Counter(f['properties']['kind'] for f in features)),
              'aggregates_represented_by_members':[r['id'] for r in aggregates],
              'excluded_context_types':dict(excluded),'simplified':False}
    RAW.parent.mkdir(parents=True,exist_ok=True);RAW.write_bytes(raw)
    OUT.write_text(json.dumps({'type':'FeatureCollection','metadata':metadata,'features':features},
                             ensure_ascii=False,separators=(',',':')))
    print('TSS ready:',len(features),'features;',metadata['counts'])

if __name__=='__main__':
    main()
