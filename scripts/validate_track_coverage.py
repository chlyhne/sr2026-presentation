"""Audit full replay coverage against official class starts and finish records."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from race_times import validate_track_boundaries, viewer_time_window


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=Path('data/tractrac'))
    parser.add_argument('--previous', type=Path)
    parser.add_argument('--refetched-utc')
    args = parser.parse_args()
    source = json.loads((args.data_dir / 'combined_tracks.json').read_text())
    rows = validate_track_boundaries(source)
    utc = lambda t: datetime.fromtimestamp(t, timezone.utc).isoformat()
    start, end = viewer_time_window(source)
    report = {'validated_utc': utc(datetime.now(timezone.utc).timestamp()),
              'timestamp_unit': 'seconds since Unix epoch (UTC)',
              'tracks': len(rows), 'positions': sum(row['points'] for row in rows),
              'all_official_starts_covered': True, 'registered_finishes': sum(row['finish'] is not None for row in rows),
              'all_registered_finishes_covered': True, 'common_start_utc': utc(max(row['start'] for row in rows)),
              'viewer_start_utc': utc(start), 'viewer_end_utc': utc(end),
              'sources': {course: race['parameters']['stored-uri']['all'] for course, race in source['races'].items()},
              'boats': rows}
    if args.refetched_utc:
        report['refetched_utc'] = args.refetched_utc
    if args.previous:
        previous = json.loads(args.previous.read_text())
        report['same_positions_as_previous_download'] = source['tracks'] == previous['tracks']
    (args.data_dir / 'coverage.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key not in ('boats', 'sources')}, indent=2))


if __name__ == '__main__':
    main()
