"""Generate browser metadata and a reviewable inventory from the collected dimensions."""
import csv
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/boat-dimensions'
report = json.loads((DATA / 'websejler-matches.json').read_text())
sourced = {}
for boat in report['boats']:
    if not boat['status'].startswith('matched'):
        continue
    m = boat['measurement']
    assert 1 <= m['lengthM'] <= 40 and .5 <= m['beamM'] < m['lengthM']
    sourced[boat['trackName'].lower()] = {
        'lengthM': m['lengthM'], 'beamM': m['beamM'], 'source': m['source'],
        'measurementBasis': 'certificate' if boat['status'] == 'matched' else 'type',
        'estimated': boat['status'] != 'matched',
        'boatType': m.get('boatType') or boat['entry'].get('BoatType'),
        'sailNumber': boat['entry'].get('SailNumber'),
        'measurementFields': m['measurementFields'],
    }
catalog_file=ROOT/'viewer/events/catalog.json'
catalog=json.loads(catalog_file.read_text(encoding='utf-8'))
event=next(e for e in catalog['events'] if e['id']=='sjaelland-rundt-2026')
event['boatStyle']['dimensions']=sourced
catalog_file.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
node = """
const fs=require('node:fs'),vm=require('node:vm');
const catalog=JSON.parse(fs.readFileSync('viewer/events/catalog.json','utf8'));
const c=vm.createContext({window:{SR_EVENT:catalog.events.find(e=>e.id==='sjaelland-rundt-2026')}});
for(const f of ['viewer/boat-icons.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
const report=JSON.parse(fs.readFileSync('data/boat-dimensions/websejler-matches.json','utf8'));
console.log(JSON.stringify(report.boats.map(b=>({trackName:b.trackName,metadata:c.boatMetadata(b.trackName)}))));
"""
resolved = json.loads(subprocess.check_output(['node', '-e', node], cwd=ROOT))
by_name = {b['trackName']: b for b in resolved}
assert len(by_name) == len(report['boats']) == 106
for boat in report['boats']:
    row = by_name[boat['trackName']]
    row.update(boatType=boat['entry'].get('BoatType'), sailNumber=boat['entry'].get('SailNumber'),
               lookupStatus=boat['status'])
output = {'updatedAt': report['fetchedAt'], 'boats': resolved}
(DATA / 'resolved.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
with (DATA / 'dimensions.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['boat', 'boat_type', 'sail_number', 'length_m', 'beam_m', 'hull', 'basis', 'source', 'lookup_status'])
    for row in resolved:
        m = row['metadata']
        writer.writerow([row['trackName'], row['boatType'], row['sailNumber'], m['lengthM'], m['beamM'],
                         m['hull'], m.get('measurementBasis', 'default'), m.get('source', ''), row['lookupStatus']])
missing = [b for b in resolved if b['metadata'].get('measurementBasis') is None]
print(f'Generated metadata for {len(resolved)-len(missing)}/{len(resolved)} boats. {len(sourced)} web records.')
print('Still default:', ', '.join(b['trackName'] for b in missing))
