"""Cache detailed OpenStreetMap coastlines for the offline presentation map."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import requests
from shapely.geometry import LineString, box, mapping

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/geography/osm-coastline.json'
OUT = ROOT / 'data/coastline-osm.geojson'
ENDPOINT = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
QUERY = '[out:json][timeout:180];way["natural"="coastline"](53.8,9.3,57.2,14.2);out geom;'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Use an already downloaded Overpass JSON response')
    args = parser.parse_args()
    if args.source:
        raw = args.source.read_bytes()
    elif RAW.exists():
        raw = RAW.read_bytes()
    else:
        response = requests.get(ENDPOINT, params={'data': QUERY}, timeout=(15, 210),
                                headers={'User-Agent': 'SR2026-Presentation/1.0 (coastline extract)'})
        response.raise_for_status()
        raw = response.content
    data = json.loads(raw)
    if data.get('remark'):
        raise ValueError('Overpass returned an incomplete response: ' + data['remark'])
    display_bbox=json.loads((ROOT/'data/geography/map-bounds.json').read_text())['bbox']
    bounds=box(*display_bbox)
    features = []
    for way in data['elements']:
        if way.get('type') != 'way' or way.get('tags', {}).get('natural') != 'coastline':
            continue
        coordinates = [[p['lon'], p['lat']] for p in way.get('geometry', [])]
        if len(coordinates) < 2:
            continue
        clipped=LineString(coordinates).intersection(bounds)
        parts=[clipped] if clipped.geom_type=='LineString' else list(clipped.geoms) if clipped.geom_type=='MultiLineString' else []
        for index,line in enumerate(parts):
            if line.is_empty:continue
            features.append({'type':'Feature','id':f"{way['id']}/{index}",
                             'properties':{'osm_way_id':way['id']},'geometry':mapping(line)})
    if not features:
        raise ValueError('No coastline geometry returned')
    count = sum(len(f['geometry']['coordinates']) for f in features)
    metadata = {'source': 'OpenStreetMap natural=coastline', 'attribution': '© OpenStreetMap contributors',
                'copyright_url': 'https://www.openstreetmap.org/copyright', 'license': 'ODbL-1.0',
                'license_url': 'https://opendatacommons.org/licenses/odbl/1-0/',
                'downloaded_at': datetime.now(timezone.utc).isoformat(),
                'source_timestamp': data.get('osm3s', {}).get('timestamp_osm_base'),
                'endpoint': ENDPOINT, 'query': QUERY, 'query_bbox': display_bbox, 'source_query_bbox': [9.3, 53.8, 14.2, 57.2], 'clipped_to_display_bounds': True,
                'ways': len(features), 'points': count, 'simplified': False}
    RAW.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_bytes(raw)
    OUT.write_text(json.dumps({'type': 'FeatureCollection', 'metadata': metadata, 'features': features},
                             ensure_ascii=False, separators=(',', ':')))
    print(f'Detailed coast ready: {len(features)} ways, {count:,} points, clipped to display bounds')

if __name__ == '__main__':
    main()
