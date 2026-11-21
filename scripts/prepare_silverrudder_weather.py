"""Prepare Silverrudder weather assets without rebuilding track profiles."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import io
import json
import math
from pathlib import Path
import re
import tempfile
from urllib.parse import quote
from xml.etree import ElementTree

from event_config import ROOT, load_catalog
from prepare_radar import COLOUR_SCHEME, HEIGHT, WIDTH, get, prepare_frame
from prepare_viewer import wind

INTERVAL = 600
WIND_MODEL = 'dmi_harmonie_arome_europe'
WIND_VARIABLES = ('wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m')
OPERA = 'https://s3.waw3-1.cloudferro.com/openradar-archive'
DMI = 'https://opendataapi.dmi.dk/v1/radardata/collections/composite/items'


def utc(seconds):
    return datetime.fromtimestamp(seconds, timezone.utc)


def times(event, interval):
    return range(math.floor(event['start'] / interval) * interval,
                 math.floor(event['end'] / interval) * interval + 1, interval)


def dmi_catalog(expected):
    interval = f'{utc(expected[0]).isoformat()}/{utc(expected[-1]).isoformat()}'
    items = get(DMI, dict(datetime=interval, scanType='fullRange', limit=1000)).json()['features']
    result = {}
    for item in items:
        t = int(datetime.fromisoformat(item['properties']['datetime']).timestamp())
        if t in expected:
            result[t] = (item['id'], (item.get('assets') or item['asset'])['data']['href'])
    return result


def opera_catalog(expected):
    result = {}
    for day in sorted({utc(t).strftime('%Y/%m/%d') for t in expected}):
        xml = ElementTree.fromstring(get(OPERA, {
            'list-type': 2, 'prefix': day + '/OPERA/COMP/', 'max-keys': 1000
        }).content)
        if xml.findtext('.//{*}IsTruncated') != 'false':
            raise ValueError(f'Incomplete OPERA catalog for {day}')
        for item in xml.findall('.//{*}Key'):
            match = re.search(r'(OPERA@(\d{8}T\d{4})@0@DBZH\.h5)$', item.text)
            if not match:
                continue
            t = int(datetime.strptime(match[2], '%Y%m%dT%H%M').replace(tzinfo=timezone.utc).timestamp())
            if t in expected:
                result[t] = (match[1], OPERA + '/' + quote(item.text, safe='/@'))
    return result


def wind_points(event, cache):
    expected = list(times(event, 3600))
    points = wind(WIND_MODEL, utc(expected[0]).date().isoformat(),
                  utc(expected[-1]).date().isoformat(), cache / 'wind.json')
    ready = []
    for point in points:
        hourly = point['hourly']
        first = hourly['time'].index(expected[0])
        end = first + len(expected)
        series = {key: hourly[key][first:end] for key in ('time', *WIND_VARIABLES)}
        if series['time'] != expected or any(
            value is None or not math.isfinite(value) for key in WIND_VARIABLES for value in series[key]
        ):
            raise ValueError(f'Incomplete wind sample at {point["latitude"]}, {point["longitude"]}')
        ready.append(dict(latitude=point['latitude'], longitude=point['longitude'], hourly=series))
    if len(ready) != 247:
        raise ValueError(f'Expected 247 wind samples for {event["id"]}')
    return ready


def prepare(event, source, cache, workers):
    event_id = event['id']
    path = f'weather/{event_id}'
    out = ROOT / 'viewer' / path
    (out / 'radar').mkdir(parents=True, exist_ok=True)
    cache = cache / event_id
    cache.mkdir(parents=True, exist_ok=True)
    expected = times(event, INTERVAL)
    catalog = {'DMI': dmi_catalog, 'OPERA': opera_catalog}[source](expected)
    if set(catalog) != set(expected):
        missing = sorted(set(expected) - catalog.keys())
        raise ValueError(f'{event_id}: {len(missing)} missing {source} radar frames, first at {utc(missing[0])}')
    points = wind_points(event, cache)

    def frame(t):
        source_id, url = catalog[t]
        png = out / 'radar' / f'{t}.png'
        receipt = cache / f'{t}.json'
        if png.is_file() and receipt.is_file():
            info = json.loads(receipt.read_text())
            if info['source_id'] == source_id and info['colour_scheme'] == COLOUR_SCHEME:
                return info
        info = prepare_frame(io.BytesIO(get(url).content), png, t, source_id, source, f'{path}/radar/{t}.png')
        receipt.write_text(json.dumps(info), encoding='utf-8')
        return info

    frames = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for index, result in enumerate(pool.map(frame, expected), 1):
            frames.append(result)
            if index % 40 == 0 or index == len(expected):
                print(f'{event_id}: {index}/{len(expected)} radar frames', flush=True)

    manifest = dict(version=1, eventId=event_id, wind_models={WIND_MODEL: points}, radar=dict(
        source=source, quantity='DBZH', unit='dBZ', projection='EPSG:4326', bbox=[9.5, 54, 14, 57],
        width=WIDTH, height=HEIGHT, interval_seconds=INTERVAL, colour_scheme=COLOUR_SCHEME, frames=frames))
    temporary = out / 'manifest.json.tmp'
    temporary.write_text(json.dumps(manifest, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
    temporary.replace(out / 'manifest.json')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--event', choices=['silverrudder-2024', 'silverrudder-2025', 'silverrudder-2026'])
    parser.add_argument('--cache-dir', type=Path, default=Path(tempfile.gettempdir()) / 'sr-silverrudder-weather')
    parser.add_argument('--workers', type=int, default=12)
    args = parser.parse_args()
    catalog = load_catalog()
    for event in sorted(catalog['events'], key=lambda event: event['id']):
        event_id = event['id']
        if event_id.startswith('silverrudder-') and (args.event is None or args.event == event_id):
            prepare(event, catalog['weather'][event_id]['radar'], args.cache_dir, args.workers)
