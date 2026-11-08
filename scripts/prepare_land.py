"""Build land polygons from the viewer's detailed, directed OSM coastlines."""
import json
from math import hypot
from pathlib import Path
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import polygonize, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'data/coastline-osm.geojson').read_text())
bounds = box(*source['metadata']['query_bbox'])
lines = []
for feature in source['features']:
    geometry = shape(feature['geometry']).intersection(bounds)
    if geometry.geom_type == 'LineString':
        lines.append(geometry)
    elif geometry.geom_type == 'MultiLineString':
        lines.extend(geometry.geoms)

polygons = list(polygonize(unary_union([*lines, bounds.boundary])))
tree = STRtree(polygons)
land, sea = set(), set()
# OSM coastline direction puts land on the left and sea on the right.
# Sample both sides of each directed source line; do not close open ways with chords.
for line in lines:
    points = list(line.coords)
    for index in [len(points) // 2 - 1, 0, len(points) - 2]:
        a, b = points[index:index + 2]
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = hypot(dx, dy)
        if not length:
            continue
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        epsilon = min(length / 100, 1e-7)
        for sign, target in [(1, land), (-1, sea)]:
            sample = Point(mid[0] - sign * dy / length * epsilon,
                           mid[1] + sign * dx / length * epsilon)
            for candidate in tree.query(sample):
                if polygons[candidate].contains(sample):
                    target.add(int(candidate))
if land & sea or len(land | sea) != len(polygons):
    raise ValueError('Coastline topology did not produce unambiguous land/sea polygons')
for name, position, expected in [
    ('Sjælland', (12, 55.5), True), ('Fyn', (10.4, 55.3), True),
    ('Sverige', (13.2, 55.8), True), ('Øresund', (12.8, 55.8), False),
    ('Storebælt', (11, 55.6), False), ('København hav', (12.7, 55.7), False),
]:
    if any(polygons[i].covers(Point(position)) for i in land) != expected:
        raise ValueError(f'Land/sea reference failed: {name}')
output = {'type': 'FeatureCollection', 'metadata': {
    **source['metadata'], 'source': 'Land polygons from local OSM coastline',
    'method': 'polygonize clipped coastline and regional boundary; classify by directed land-left/sea-right samples',
    'direction_reference': 'https://wiki.openstreetmap.org/wiki/Tag:natural%3Dcoastline',
    'land_polygons': len(land), 'sea_faces': len(sea), 'simplified': False,
}, 'features': [{'type': 'Feature', 'properties': {}, 'geometry': mapping(polygons[i])}
                for i in sorted(land)]}
(ROOT / 'data/land-osm.geojson').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')))
print(f'Land ready: {len(land)} polygons, no ambiguous faces, reference land/sea checks passed')
