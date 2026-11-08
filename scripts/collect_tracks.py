"""Decode downloaded race metadata using the existing Silverrudder scraper."""
import argparse
import importlib.util
import json
import math
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scraper', type=Path, required=True)
    parser.add_argument('--worker', type=Path, required=True)
    parser.add_argument('--data-dir', type=Path, default=Path('data/tractrac'))
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('tractrac_scraper', args.scraper)
    scraper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(scraper)
    original_run = subprocess.run
    def run_with_diagnostics(*positional, **keywords):
        result = original_run(*positional, **keywords)
        if result.stderr:
            print(result.stderr, flush=True)
        return result
    scraper.subprocess.run = run_with_diagnostics
    patched = args.data_dir / 'worker_node.mjs'
    worker_source = args.worker.read_text()
    try:
        worker_source = scraper.patch_worker_for_node(worker_source)
    except RuntimeError:
        # The published worker now uses different minified variable names.
        anchor = "var tt=Object['freeze']({'__proto__':null});"
        options = "{'method':'GET','cache':'no-cache'}"
        if worker_source.count(anchor) != 1 or worker_source.count(options) != 1:
            raise RuntimeError('Worker structure changed; inspect before patching')
        worker_source = 'import { parentPort } from "worker_threads";\n' + worker_source
        worker_source = worker_source.replace(anchor, "var tt=Object['freeze']({'__proto__':null,parentPort});")
        worker_source = worker_source.replace(options, "{'method':'GET','cache':'no-cache','headers':{'Referer':'https://live.tractrac.com/viewer/index.html','Origin':'https://live.tractrac.com'}}")
    patched.write_text(worker_source)
    merged = {'schema_version': 1, 'timestamp_unit': 'milliseconds since Unix epoch (UTC)',
              'point_columns': ['longitude', 'latitude', 'timestamp'], 'races': {},
              'competitors': {}, 'tracks': {}}
    for course in ('groensund', 'boegestroemmen'):
        race = json.loads((args.data_dir / f'race_{course}.json').read_text())
        target = args.data_dir / f'tracks_{course}.json'
        if not target.exists() or json.loads(target.read_text()).get('reason') not in ('stored-end', 'connection-stopped'):
            print(f'Decoding {race["raceName"]}', flush=True)
            scraper.extract_tracks_with_node(
                patched.resolve(), scraper.normalize_url(race['parameters']['stored-uri']['all']),
                scraper.parse_iso_to_epoch_ms(race['raceTrackingStartTime']), target.resolve(), 240)
        payload = json.loads(target.read_text())
        if payload['reason'] not in ('stored-end', 'connection-stopped'):
            raise RuntimeError(f'Incomplete extraction: {course}: {payload["reason"]}')
        if not payload['tracks']:
            raise RuntimeError(f'No positions: {course}')
        merged['races'][course] = race
        for uid, competitor in race['competitors'].items():
            key = f'{course}:{uid}'
            merged['competitors'][key] = {**competitor, 'source_course': course, 'source_id': uid}
        for uid, points in payload['tracks'].items():
            key = f'{course}:{uid}'
            # Keep source identity even for track objects absent from the competitor list.
            merged['competitors'].setdefault(key, {'source_course': course, 'source_id': uid})
            for lon, lat, ts in points:
                if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lon, lat, ts)):
                    raise ValueError(f'Invalid position in {key}')
                if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                    raise ValueError(f'Invalid coordinates in {key}')
            merged['tracks'][key] = sorted(set(map(tuple, points)), key=lambda p: (p[2], p[0], p[1]))
        print(f'{course}: {len(payload["tracks"])} tracks, {payload["stats"]["points"]} points', flush=True)
    target = args.data_dir / 'combined_tracks.json'
    target.write_text(json.dumps(merged, ensure_ascii=False, separators=(',', ':')))
    print(f'Saved {target}: {len(merged["tracks"])} tracks, '
          f'{sum(map(len, merged["tracks"].values()))} unique positions', flush=True)


if __name__ == '__main__':
    main()
