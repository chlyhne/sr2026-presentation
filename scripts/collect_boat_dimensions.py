"""Match tracked boats to Manage2Sail and public WebSejler LOA/Bmax measurements.

Requires requests and beautifulsoup4. HTTP responses are cached outside the repo.
Only unique name + sail number matches, or name + type without a usable sail
number, are accepted. Existing manual dimensions remain authoritative in the viewer.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import threading
import time
import unicodedata

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path('/tmp/sr2026-websejler-cache')
CACHE.mkdir(exist_ok=True)
LOCAL = threading.local()


def norm(value):
    text = unicodedata.normalize('NFKD', value or '').casefold()
    return ''.join(c for c in text if c.isalnum() and not unicodedata.combining(c))


def sail(value):
    digits = re.findall(r'\d+', value or '')
    return str(int(''.join(digits))) if digits else ''


def html(url, data=None):
    key = hashlib.sha256((url + json.dumps(data, sort_keys=True)).encode()).hexdigest()
    path = CACHE / (key + '.html')
    if path.exists():
        return path.read_text()
    if not hasattr(LOCAL, 'session'):
        LOCAL.session = requests.Session()
        LOCAL.session.headers['User-Agent'] = 'Mozilla/5.0'
    time.sleep(.05)
    response = LOCAL.session.post(url, data=data, timeout=30) if data is not None else LOCAL.session.get(url, timeout=30)
    response.raise_for_status()
    response.encoding = 'utf-8'
    path.write_text(response.text)
    return response.text


def search(name='', number='', country=''):
    data = {'BaadNavn': name, 'BaadtypeNavn': '', 'KlubId': '', 'CertNr': '',
            'Sejlnummer': number, 'BaadStatus': '', 'Nation': country, 'baade': 'Start søgning'}
    soup = BeautifulSoup(html('https://websejler.dk/da/baade', data), 'html.parser')
    rows = []
    for tr in soup.select('tr[data-baadid]'):
        cells = [c.get_text(' ', strip=True) for c in tr.find_all('td', recursive=False)]
        if len(cells) >= 6:
            rows.append({'certificate': tr['data-baadid'], 'boatType': cells[2],
                         'sailNumber': cells[3], 'name': cells[4]})
    return rows


def certificate(row):
    url = 'https://websejler.dk/da/certifikat/' + row['certificate']
    soup = BeautifulSoup(html(url), 'html.parser')
    values = {}
    for label in soup.select('th'):
        if label.get_text(strip=True) in ('LOA', 'Bmax'):
            value = label.find_next_sibling('td').get_text(strip=True)
            try:
                values[label.get_text(strip=True)] = float(value.replace(',', '.'))
            except ValueError:
                pass
    if set(values) != {'LOA', 'Bmax'}:
        return None
    if not (1 <= values['LOA'] <= 40 and .5 <= values['Bmax'] < values['LOA']):
        return None
    return {'lengthM': values['LOA'], 'beamM': values['Bmax'], 'source': url,
            'measurementFields': ['LOA', 'Bmax'], **row}


def type_measurement(boat_type):
    aliases={'dehler343':'DEHLER 34/343','ridas31racer':'RIDAS 31','banholm35':'BANDHOLM 35'}
    boat_type=aliases.get(norm(boat_type),boat_type)
    if not boat_type or not re.search(r'\d', boat_type):
        return None, []
    queries = [boat_type]
    # Search the model's numeric stem to tolerate spacing around the number.
    stem = re.search(r'[A-Za-zÀ-ÿ]+[ -]*\d+(?:[.,]\d+)?', boat_type)
    if stem:
        queries.append(re.sub(r'([A-Za-zÀ-ÿ])(?=\d)', r'\1 ', stem.group()).strip())
    candidates = {}
    for query in dict.fromkeys(queries):
        soup = BeautifulSoup(html('https://websejler.dk/da/baadtyper', {
            'BaadtypeNavn': query, 'BaadStatus': '', 'KlasseStatus': '', 'Entypeklasset': ''}), 'html.parser')
        for tr in soup.select('tr[onclick]'):
            match = re.search(r'/baadtype/(\d+)', tr.get('onclick', ''))
            cells = tr.find_all('td', recursive=False)
            if match and cells:
                candidates[match[1]] = {'typeId': match[1], 'boatType': next((cell.get_text(' ', strip=True) for cell in cells if cell.get_text(strip=True)), '')}
        exact = [r for r in candidates.values() if norm(r['boatType']) == norm(boat_type)]
        if len(exact) == 1:
            row = exact[0]
            url = 'https://websejler.dk/da/baadtype/' + row['typeId']
            soup = BeautifulSoup(html(url), 'html.parser')
            values = {}
            for title in soup.select('tr.titleRow'):
                following = title.find_next_sibling('tr')
                if following is None:
                    continue
                labels = title.find_all('td', recursive=False)
                cells = following.find_all('td', recursive=False)
                for label, cell in zip(labels, cells):
                    key = label.get_text(strip=True)
                    if key in ('LOA', 'Bmax'):
                        try:
                            values[key] = float(cell.get_text(strip=True).replace(',', '.'))
                        except ValueError:
                            pass
            if set(values) == {'LOA', 'Bmax'} and 1 <= values['LOA'] <= 40 and .5 <= values['Bmax'] < values['LOA']:
                return {'lengthM': values['LOA'], 'beamM': values['Bmax'], 'source': url,
                        'measurementFields': ['LOA', 'Bmax'], 'estimated': True, **row}, list(candidates.values())
    return None, list(candidates.values())


def resolve(item):
    tracked, entry = item
    result = {'trackId': tracked['source_course'] + ':' + tracked['source_id'], 'trackName': tracked['nameShort'],
              'bowNumber': tracked['uniqueId'], 'entry': entry}
    try:
        name = entry.get('BoatName') or tracked['nameShort']
        number = sail(entry.get('SailNumber'))
        candidates = search(name=name, number=number)
        names = {norm(name), norm(tracked['nameShort'])}
        exact = [r for r in candidates if norm(r['name']) in names]
        matched = [r for r in exact if number and sail(r['sailNumber']) == number]
        method = 'name-and-sail-number'
        if not matched and number:
            country = entry.get('SailNumberCountry') or ''
            country = country if country in ('DEN', 'SWE', 'NOR', 'GER', 'FIN', 'GBR') else ''
            candidates += search(number=number, country=country)
            exact = [r for r in candidates if norm(r['name']) in names]
            matched = [r for r in exact if sail(r['sailNumber']) == number]
        if not number:
            matched = [r for r in exact if norm(r['boatType']) == norm(entry.get('BoatType')) and norm(r['boatType'])]
            method = 'name-and-type-without-sail-number'
        if not matched and number:
            aliases={'ridas31racer':'RIDAS 31','dehler343':'DEHLER 34/343'}
            expected_type=norm(aliases.get(norm(entry.get('BoatType')),entry.get('BoatType')))
            matched=[r for r in candidates if not norm(r['name']) and sail(r['sailNumber'])==number and expected_type and norm(r['boatType'])==expected_type]
            if matched:
                method='sail-number-and-type-with-unnamed-certificate'
        matched = list({r['certificate']: r for r in matched}.values())
        if len(matched) > 1 and entry.get('BoatType'):
            typed = [r for r in matched if norm(r['boatType']) == norm(entry['BoatType'])]
            if len(typed) == 1:
                matched = typed
        result['candidates'] = list({r['certificate']: r for r in candidates}.values())
        if len(matched)==1 and entry.get('BoatType'):
            aliases={'ridas31racer':'RIDAS 31','dehler343':'DEHLER 34/343'}
            a,b=norm(aliases.get(norm(entry['BoatType']),entry['BoatType'])),norm(matched[0]['boatType'])
            if a not in b and b not in a:
                result['typeConflict']=matched[0]
                matched=[]
        if len(matched) == 1:
            measurement = certificate(matched[0])
            if measurement:
                result.update(status='matched', matchMethod=method, measurement=measurement)
            else:
                result.update(status='missing-measurements')
        elif len(matched) > 1:
            result.update(status='ambiguous')
        else:
            result.update(status='not-matched')
        if result['status'] != 'matched':
            measurement, types = type_measurement(entry.get('BoatType'))
            result['typeCandidates'] = types
            if measurement:
                result.update(status='matched-type', matchMethod='exact-boat-type', measurement=measurement)
    except (requests.RequestException, ValueError, AttributeError) as error:
        result.update(status='error', error=str(error))
    print(result['trackName'] + ': ' + result['status'], flush=True)
    return result


def refresh_entries():
    event='3a4bd78c-acfb-474f-b47d-160705d3b0aa'
    response=requests.get('https://www.manage2sail.com/da-dk/event/'+event,timeout=30)
    response.raise_for_status()
    match=re.search(r'window\.boostrapedResourceData\s*=\s*(\{[\s\S]*?\})\s*;\s*</script>',response.text,re.I)
    if not match:
        raise ValueError('Manage2Sail bootstrap data not found')
    bootstrap=json.loads(match.group(1));entries=[]
    for regatta in bootstrap['Regatta']:
        url=f'https://www.manage2sail.com/api/event/{event}/regattaentry?regattaId={regatta["Id"]}'
        response=requests.get(url,timeout=30);response.raise_for_status();data=response.json()
        if len(data.get('Pages',[]))>1:
            raise ValueError('Multiple entry pages found; inspect pagination before collecting')
        fields=['RegattaId','EntryId','SailNumber','SailNumberCountry','BoatName','BoatType','BowNumber']
        entries.extend({**{key:entry.get(key) for key in fields},'source':url} for entry in data.get('Entries',[]))
    (ROOT/'data/boat-dimensions/manage2sail-entries.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, default=2)
    parser.add_argument('--refresh-entries',action='store_true')
    args = parser.parse_args()
    if args.refresh_entries:
        refresh_entries()
    entries = json.loads((ROOT / 'data/boat-dimensions/manage2sail-entries.json').read_text())
    by_bow = {}
    for entry in entries:
        assert entry['BowNumber'] not in by_bow, 'Duplicate Manage2Sail bow number'
        by_bow[entry['BowNumber']] = entry
    tracked = json.loads((ROOT / 'data/tractrac/combined_tracks.json').read_text())['competitors'].values()
    items = [(b, by_bow[b['uniqueId']]) for b in tracked]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(resolve, items))
    fallbacks=json.loads((ROOT/'data/boat-dimensions/sailboatdata-models.json').read_text())
    for result in results:
        if result['status'].startswith('matched'):
            continue
        for model in fallbacks['models']:
            if norm(result['entry'].get('BoatType')) not in {norm(t) for t in model['entryTypes']}:
                continue
            if model.get('trackNames') and result['trackName'] not in model['trackNames']:
                continue
            result.update(status='matched-sailboatdata-type',matchMethod='reviewed-boat-type',measurement={k:v for k,v in model.items() if k not in ['entryTypes','trackNames']})
            break
    results.sort(key=lambda x: x['trackName'].casefold())
    report = {'fetchedAt': datetime.now(timezone.utc).isoformat(),
              'eventId': '3a4bd78c-acfb-474f-b47d-160705d3b0aa',
              'measurementFields': {'lengthM': 'LOA', 'beamM': 'Bmax'}, 'boats': results}
    output = ROOT / 'data/boat-dimensions/websejler-matches.json'
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    matched = sum(r['status'].startswith('matched') for r in results)
    print(f'Matched {matched}/{len(results)} boats. Report: {output}')


if __name__ == '__main__':
    main()
