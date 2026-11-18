"""Prepare the visible boat list from the existing TracTrac and entry snapshots."""
import json
from pathlib import Path
import re
from race_times import official_start, official_finish

ROOT = Path(__file__).resolve().parents[1]
OFFICIAL_COURSE_LENGTHS_NM = {'groensund': 232.0, 'boegestroemmen': 216.0}


def build():
    source = json.loads((ROOT / 'data/tractrac/combined_tracks.json').read_text(encoding='utf-8'))
    entries = json.loads((ROOT / 'data/boat-dimensions/manage2sail-entries.json').read_text(encoding='utf-8'))
    by_number = {}
    for entry in entries:
        by_number.setdefault(str(entry.get('BowNumber')), []).append(entry)
    details = {}
    for boat_id in source['tracks']:
        competitor = source['competitors'][boat_id]
        matches = by_number.get(str(competitor.get('uniqueId')), [])
        boat_type = str(matches[0].get('BoatType') or '').strip() if len(matches) == 1 else ''
        if boat_type in ('0', '-', '–'):
            boat_type = ''
        # TracTrac's long name contains the boat type followed by its handicap.
        boat_type = boat_type or re.sub(r'\s*\([\d.,]+\)\s*$', '', competitor.get('name', ''))
        if boat_type.strip() in ('0', '-', '–'):
            boat_type = ''
        handicap = float(competitor['handicapDistance'])
        if not 0 < handicap < 10000:
            raise ValueError(f'Invalid ToD handicap for {boat_id}')
        race = source['races'][competitor['source_course']]
        race_class = race['classes'][competitor['classId']]
        details[boat_id] = {'skipper': competitor.get('description', '').strip(), 'boatType': boat_type.strip(),
                            'raceClassId': competitor['classId'], 'raceClassName': race_class['Name'],
                            'handicapSecondsPerNm': handicap, 'raceStartTime': official_start(race, competitor),
                            'raceFinishTime': official_finish(competitor),
                            'courseLengthNm': OFFICIAL_COURSE_LENGTHS_NM[competitor['source_course']]}
    import gzip
    target=ROOT/'data/events/sjaelland-rundt-2026/native.json.gz'
    native=json.loads(gzip.decompress(target.read_bytes()))
    for boat in native['boats']:
        boat['details']=details[boat['id']]
    target.write_bytes(gzip.compress(json.dumps(native,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
    print(f'Prepared skipper names and boat types for {len(details)} boats')


if __name__ == '__main__':
    build()
