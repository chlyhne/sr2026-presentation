"""Shared event registry and static tracker entry points."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / 'viewer/events/catalog.json'

def load_catalog():
    return json.loads(CATALOG_FILE.read_text(encoding='utf-8'))

def event_config(event_id):
    return next(event for event in load_catalog()['events'] if event['id'] == event_id)

def tracker_html(event_id):
    event_config(event_id)
    template = (ROOT / 'viewer/tracker.html').read_text(encoding='utf-8')
    return template.replace('<html lang="da"', f'<html lang="da" data-event-id="{event_id}"', 1).replace(
        '<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="../../">', 1)
