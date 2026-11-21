"""Shared event registry and static tracker entry points."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / 'viewer/events/catalog.json'

def load_catalog():
    return json.loads(CATALOG_FILE.read_text(encoding='utf-8'))

def event_config(event_id):
    return next(event for event in load_catalog()['events'] if event['id'] == event_id)

def public_event_files(event):
    yield 'presentation.json', event['presentationFile']
    for event_set in event.get('publicSets', []):
        set_id = event_set['id']
        if not re.fullmatch(r'[a-z0-9-]+', set_id) or set_id == 'default':
            raise ValueError(f'Invalid public event set: {set_id}')
        yield f'presentations/{set_id}.json', event_set['presentationFile']


def tracker_html(event_id, asset_root='', config_url='config.js'):
    event_config(event_id)
    template = (ROOT / 'viewer/tracker.html').read_text(encoding='utf-8')
    if asset_root:
        template = re.sub(r'((?:src|href)=")((?!config\.js")[\w-]+\.(?:js|css))"', rf'\1{asset_root}\2"', template)
    template = template.replace('src="config.js"', f'src="{config_url}"')
    return template.replace('<html lang="da"', f'<html lang="da" data-event-id="{event_id}"', 1).replace(
        '<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="../../">', 1)
