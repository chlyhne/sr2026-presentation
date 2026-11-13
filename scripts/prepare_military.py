"""Convert the user's combined Hatter Barn area coordinates to local GeoJSON."""
import argparse
from decimal import Decimal
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/geography/hatter-barn-coordinates.json'
OUT = ROOT / 'data/military-areas.geojson'


def decimal_degrees(degrees, minutes, maximum):
    degrees, minutes = Decimal(str(degrees)), Decimal(str(minutes))
    # The supplied 10° 60.000′ E normalises to 11° 00.000′ E.
    if not (0 <= minutes <= 60 and 0 <= degrees <= maximum):
        raise ValueError('Coordinate outside degree/minute bounds')
    value = degrees + minutes / 60
    if value > maximum:
        raise ValueError('Coordinate outside geographic bounds')
    return float(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=RAW,
                        help='JSON containing latitude/longitude degrees and decimal minutes')
    args = parser.parse_args()
    source = json.loads(args.source.read_text(encoding='utf-8'))
    points = [[decimal_degrees(p['longitude'][0], p['longitude'][1], 180),
               decimal_degrees(p['latitude'][0], p['latitude'][1], 90)]
              for p in source['points']]
    if len(points) < 3 or len(set(map(tuple, points))) != len(points):
        raise ValueError('At least three distinct, ordered corners required')
    feature = {
        'type': 'Feature', 'id': 'user/hatter-barn',
        'properties': {'name': source['name'], 'kind': 'firing_area'},
        'geometry': {'type': 'Polygon', 'coordinates': [points + [points[0]]]},
    }
    metadata = {
        'source': source['source'], 'source_date': source['source_date'],
        'coordinate_format': 'degrees and decimal minutes, N/E',
        'source_coordinate_count': len(points),
        'source_coordinates': source['points'],
        'simplified': False, 'activation_times_included': False,
    }
    OUT.write_text(json.dumps({'type': 'FeatureCollection', 'metadata': metadata,
                               'features': [feature]}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('Firing area ready:', source['name'], len(points), 'corners + ring closure')


if __name__ == '__main__':
    main()
