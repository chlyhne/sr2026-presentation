"""Cache OpenSeaMap traffic-separation geometry for the presentation map."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import requests
from prepare_military import decimal_degrees
from shapely.geometry import Polygon, Point, mapping, shape
from shapely.ops import unary_union, substring

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
    aggregates=[];excluded=Counter()
    for item in source['elements']:
        tags=item.get('tags',{});kind=tags.get('seamark:type')
        if kind not in TYPES:
            excluded[kind or 'untagged']+=1
        elif item['type']=='relation' and tags.get('type')=='traffic separation scheme':
            aggregates.append(item)
    # Explicit outer edges, in perimeter order. Open ends are joined across
    # the scheme entrances; central zones, lane arrows and dividers are omitted.
    ways={item['id']:item for item in source['elements'] if item['type']=='way'}
    def edge(ref):
        points=[[p['lon'],p['lat']] for p in ways[abs(ref)]['geometry']]
        if points[0]==points[-1]:points=points[:-1]
        return points if ref>0 else points[::-1]
    schemes=[
        ('kiel', 'Kiel', [[126869127,126869128]]),
        ('gedser', 'Syd for Gedser', [[126610444,-126610445]]),
        ('kadetrinne', 'Kadetrenden', [[126610446,126610447]]),
        ('ruegen', 'Nord for Rügen', [[178758314,178758315]]),
        ('bornholm', 'Bornholmsgat', [[179062059],
            [179062062,-179062066], [179062072,179062075]]),
        ('falsterbo', 'Falsterborev', [[178774276,178774274,1058108246]]),
        ('middelgrund', 'Lilla Middelgrund', [[775394335,-775394336]]),
    ]
    features=[]
    for key,name,rings in schemes:
        polygons=[]
        for refs in rings:
            points=[point for ref in refs for point in edge(ref)]
            polygon=Polygon(points)
            if not polygon.is_valid:
                raise ValueError(f'Invalid outer boundary for {name}: {refs}')
            polygons.append(polygon)
        area=unary_union(polygons)
        if area.geom_type not in {'Polygon','MultiPolygon'} or not area.is_valid:
            raise ValueError(f'Invalid combined traffic area: {name}')
        features.append({'type':'Feature','id':'tss/'+key,
                         'properties':{'kind':'restricted_area','name':name,
                                       'source_ways':sorted({abs(ref) for ring in rings for ref in ring})},
                         'geometry':mapping(area)})
    if not features:
        raise ValueError('No traffic separation geometry returned')
    for key in ('storebaelt','oresund','helsingor'):
        override=json.loads((ROOT/f'data/geography/{key}-tss-coordinates.json').read_text(encoding='utf-8'))
        points=[[decimal_degrees(p['longitude'][0],p['longitude'][1],180),
                 decimal_degrees(p['latitude'][0],p['latitude'][1],90)] for p in override['points']]
        ring=points+[points[0]]
        if override.get('close_along_coast'):
            # Join the last and first source points along the actual shoreline.
            land=json.loads((ROOT/'data/land-osm.geojson').read_text(encoding='utf-8'))
            start,end=Point(points[-1]),Point(points[0])
            shores=[shape(f['geometry']).exterior for f in land['features']]
            shore=min(shores,key=lambda line:line.distance(start)+line.distance(end))
            a,b=shore.project(start),shore.project(end)
            direct=list(substring(shore,a,b).coords)
            if abs(b-a)<=shore.length/2:
                coast=direct
            elif a>b:
                coast=list(substring(shore,a,shore.length).coords)+list(substring(shore,0,b).coords)[1:]
            else:
                coast=list(substring(shore,a,0).coords)+list(substring(shore,shore.length,b).coords)[1:]
            ring=points+[list(p) for p in coast]+[points[0]]
        if not Polygon(ring).is_valid:
            raise ValueError(f'Invalid user traffic polygon: {key}')
        features=[f for f in features if f['id'] not in override['replaces']]
        features.append({'type':'Feature','id':f'user/{key}-tss',
                         'properties':{'kind':'restricted_area','name':override['name'],
                                       'source':override['source'],'source_date':override['source_date'],
                                       'source_coordinates':override['points'],'replaces':override['replaces'],
                                       'closed_along_coast':override.get('close_along_coast',False)},
                         'geometry':{'type':'Polygon','coordinates':[ring]}})
    limits=json.loads((ROOT/'data/geography/traffic-display-limits.json').read_text(encoding='utf-8'))
    south=decimal_degrees(*limits['south_latitude'],90)
    east=decimal_degrees(*limits['east_longitude'],180)
    omitted=[]
    retained=[]
    for feature in features:
        west,bottom,right,north=shape(feature['geometry']).bounds
        if north<south or west>east:
            omitted.append(feature['id'])
        else:
            retained.append(feature)
    features=retained
    metadata={'source':'OpenSeaMap / OpenStreetMap seamarks','attribution':'© OpenStreetMap contributors',
              'copyright_url':'https://www.openstreetmap.org/copyright','license':'ODbL-1.0',
              'license_url':'https://opendatacommons.org/licenses/odbl/1-0/',
              'downloaded_at':datetime.now(timezone.utc).isoformat(),'snapshot':SNAPSHOT,
              'server_base_timestamp':source.get('osm3s',{}).get('timestamp_osm_base'),
              'endpoint':ENDPOINT,'query':QUERY,'query_bbox':[9.3,53.8,14.2,57.2],
              'counts':dict(Counter(f['properties']['kind'] for f in features)),
              'display_limits':limits,'omitted_outside_display_limits':omitted,
              'aggregates_represented_by_outer_area':[r['id'] for r in aggregates],
              'excluded_context_types':dict(excluded),'simplified':False,
              'presentation':'outer boundaries with whole-area hatching',
              'omitted_scheme':'Hatter Barn: replaced by user/hatter-barn military polygon'}
    RAW.parent.mkdir(parents=True,exist_ok=True);RAW.write_bytes(raw)
    OUT.write_text(json.dumps({'type':'FeatureCollection','metadata':metadata,'features':features},
                             ensure_ascii=False,separators=(',',':')))
    print('TSS ready:',len(features),'features;',metadata['counts'])

if __name__=='__main__':
    main()
