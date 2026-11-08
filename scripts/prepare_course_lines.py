"""Build exact start/finish line coordinates from the cached TracTrac sources."""
from datetime import datetime, timezone
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'data/tractrac'
races = json.loads((DIR / 'races.json').read_text())['races']
sources = {course: json.loads((DIR / f'race_{course}.json').read_text())
           for course in ('groensund', 'boegestroemmen')}
controls = {course: json.loads((DIR / f'controls_{course}.json').read_text())
            for course in sources}
race = sources['groensund']
mercutio = next(c for c in race['competitors'].values() if c.get('nameShort') == 'Mercutio')
entry = next(r for r in races if r['name'] == 'SR Grønsund')
start_class = next(c for c in entry['classes_list'] if c['id'] == mercutio['classId'])
start_time = datetime.strptime(start_class['starttime'], '%Y-%m-%d %H:%M:%S UTC').replace(tzinfo=timezone.utc)
start_ms = int(start_time.timestamp() * 1000)


def extract(course, name):
    item = next(m for m in sources[course]['mapItems'] if m['name'] == name)
    if not item['hasTwoPoints'] or len(item['positionedItems']) != 2:
        raise ValueError(f'{course}: {name} is not a two-point line')
    coordinates, endpoints = [], []
    for point in item['positionedItems']:
        if point['isStatic']:
            position = point['positions'][0]
            coordinate = [position['x'], position['y']]
            source_time = None
        else:
            positions = [p for uid, p, *_ in controls[course]['positions']
                         if uid == point['uuid'] and p['timestamp'] <= start_ms]
            if not positions:
                raise ValueError(f'No source position for {point["name"]} before start')
            position = max(positions, key=lambda p: p['timestamp'])
            coordinate = [position['longitude'], position['latitude']]
            source_time = datetime.fromtimestamp(position['timestamp'] / 1000, timezone.utc).isoformat()
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in coordinate):
            raise ValueError('Invalid source coordinate')
        coordinates.append(coordinate)
        endpoints.append({'id': point['uuid'], 'name': point['name'], 'is_static': point['isStatic'],
                          'source_position_utc': source_time, 'coordinates': coordinate})
    return coordinates, endpoints, item['uuid']


features = []
for name, kind, label in [('Start', 'start', 'Start'), ('Finish', 'finish', 'Mål')]:
    coordinates, endpoints, item_id = extract('groensund', name)
    other, other_endpoints, other_id = extract('boegestroemmen', name)
    if coordinates != other or endpoints != other_endpoints or item_id != other_id:
        raise ValueError('The two replays disagree; do not silently combine their lines')
    properties = {'kind': kind, 'name': label, 'source_name': name, 'map_item_id': item_id,
                  'source': 'TracTrac event 3539, SR Grønsund and SR Bøgestrømmen',
                  'endpoints': endpoints}
    if kind == 'start':
        properties.update(reference_boat='Mercutio', reference_class=start_class['name'],
                          reference_utc=start_time.isoformat(),
                          position_selection='latest source position at or before Mercutio class start; fixed snapshot')
    features.append({'type': 'Feature', 'id': f'tractrac/{kind}', 'properties': properties,
                     'geometry': {'type': 'LineString', 'coordinates': coordinates}})
output = {'type': 'FeatureCollection', 'metadata': {
    'source': 'TracTrac event 3539',
    'event_url': 'https://www.tractrac.com/event-page/event_20260610_SjllandRun/3539',
    'source_courses': list(sources), 'duplicate_course_lines_combined': True,
    'source_coordinates_preserved': True,
    'control_replay_sources': [c['source'] for c in controls.values()],
}, 'features': features}
(ROOT / 'data/course-lines.geojson').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
for feature in features:
    print(feature['properties']['name'], feature['geometry']['coordinates'])
