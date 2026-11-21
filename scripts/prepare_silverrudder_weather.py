"""Prepare Silverrudder weather assets without rebuilding track profiles."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
import io
import json
import math
from pathlib import Path
import re
import tempfile
import time

from urllib.parse import quote
from xml.etree import ElementTree

import requests

from event_config import ROOT, load_catalog
from prepare_radar import COLOUR_SCHEME, HEIGHT, WIDTH, colour_metadata, get, prepare_frame

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


def get_wind(url, params):
    for attempt in range(4):
        try:
            response = requests.get(url, params=params, timeout=60)
            if response.status_code == 429 and attempt < 3:
                print('Weather API rate limit; retrying in 60 seconds', flush=True)
                time.sleep(60)
                continue
            response.raise_for_status()
            return response
        except requests.RequestException:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))


def cached_wind(start_date, end_date, cache):
    if cache.exists():
        return json.loads(cache.read_text(encoding='utf-8'))
    points = [(54 + i * .25, 9.5 + j * .25) for i in range(13) for j in range(19)]
    checkpoint = cache.with_suffix('.partial.json')
    result = json.loads(checkpoint.read_text(encoding='utf-8')) if checkpoint.exists() else []
    for offset in range(len(result), len(points), 40):
        batch = points[offset:offset + 40]
        data = get_wind('https://historical-forecast-api.open-meteo.com/v1/forecast', dict(
            latitude=','.join(str(p[0]) for p in batch),
            longitude=','.join(str(p[1]) for p in batch),
            start_date=start_date, end_date=end_date, hourly=','.join(WIND_VARIABLES),
            models=WIND_MODEL, wind_speed_unit='ms', timezone='UTC', timeformat='unixtime',
            cell_selection='nearest', elevation=','.join(['nan'] * len(batch)),
        )).json()
        result.extend(data if isinstance(data, list) else [data])
        checkpoint.write_text(json.dumps(result), encoding='utf-8')
    hours = ((date.fromisoformat(end_date) - date.fromisoformat(start_date)).days + 1) * 24
    if len(result) != len(points) or any(
        len(point['hourly']['time']) != hours or None in point['hourly']['wind_speed_10m']
        for point in result
    ):
        raise ValueError('Incomplete wind grid from the historical forecast API')
    cache.write_text(json.dumps(result), encoding='utf-8')
    return result

def wind_points(event, cache):
    expected = list(times(event, 3600))
    points = cached_wind(utc(expected[0]).date().isoformat(),
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
        width=WIDTH, height=HEIGHT, interval_seconds=INTERVAL, **colour_metadata(), frames=frames))
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
