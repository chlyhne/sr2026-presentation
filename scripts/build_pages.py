"""Package only the public viewer and its published content for GitHub Pages."""
from hashlib import sha256
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit
from event_config import load_catalog, public_event_files, tracker_html

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_SUFFIXES = {'.geojson', '.html', '.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.gz'}


def prepare_track_profiles():
    node = shutil.which('node')
    if node is None:
        raise RuntimeError('Node.js is required to prepare track profiles. Install Node.js 24 and run this command again.')
    subprocess.run([node, str(ROOT / 'scripts' / 'prepare_track_profiles.cjs'), '--if-stale'], cwd=ROOT, check=True)


def package_tracker_assets(stage):
    scripts = [path for path in stage.glob('*.js') if path.name != 'config.js']
    assets = sorted([*scripts, *stage.glob('*.css'), *(stage / 'vendor').rglob('*.js')])
    digest = sha256((ROOT / 'viewer/tracker.html').read_bytes())
    for asset in assets:
        digest.update(asset.relative_to(stage).as_posix().encode())
        digest.update(sha256(asset.read_bytes()).digest())
    asset_root = f'assets/{digest.hexdigest()[:20]}/'
    for asset in assets:
        target = stage / asset_root / asset.relative_to(stage)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(asset, target)
    return asset_root


def package_public_event_sets(stage, event):
    titles = {}
    for url, source in public_event_files(event):
        document = json.loads((ROOT / source).read_text(encoding='utf-8'))
        if document.get('version') != 1 or not isinstance(document.get('notes'), list) or not isinstance(document.get('speedPins'), list):
            raise ValueError('Invalid presentation: ' + source)
        if any(note.get('private') not in (None, False) or 'privateId' in note or
               (note.get('image') or {}).get('url', '').lstrip('/').startswith('private-event-images/')
               for note in document['notes']):
            raise ValueError('Private event in public presentation: ' + source)
        if 'title' in document:
            title = document['title']
            if not isinstance(title, str) or not title.strip() or len(title.encode('utf-16-le')) > 200:
                raise ValueError('Invalid presentation title: ' + source)
            titles['default' if url == 'presentation.json' else Path(url).stem] = title
        target = stage / 'events' / event['id'] / url
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return titles


def package_tracker_config(stage, api_base):
    # Enable the authenticated API only where the Worker routes and cookies share the tracker origin.
    config = f'window.SR_CONFIG={{eventService:location.origin==={json.dumps(api_base)},admin:false}};\n'
    (stage / 'config.js').write_text(config, encoding='utf-8')
    return 'config.js?v=' + sha256(config.encode('utf-8')).hexdigest()[:20]


def build():
    api_base = os.environ.get('SR_API_URL', '').strip().rstrip('/')
    if api_base:
        parsed = urlsplit(api_base)
        if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
            raise ValueError('SR_API_URL must be an HTTPS origin, without a path or credentials')
    prepare_track_profiles()
    with tempfile.TemporaryDirectory(prefix='sr2026-pages-') as temporary:
        stage = Path(temporary) / 'public'
        stage.mkdir()
        catalog=load_catalog()
        profile_files=set()
        for event in catalog['events']:
            config=event
            manifest_file=config['profileRoot']+'manifest.json'
            profile_manifest=json.loads((ROOT/'viewer'/manifest_file).read_text(encoding='utf-8'))
            profile_files.update([manifest_file,profile_manifest['replayFile'],profile_manifest['dataFile'],profile_manifest['prepared']['common']['file']])
            titles = package_public_event_sets(stage, event)
            if titles:
                event['publicSetTitles'] = titles
        for path in (ROOT / 'viewer').rglob('*'):
            relative = path.relative_to(ROOT / 'viewer')
            if 'track-profiles' in relative.parts and relative.as_posix() not in profile_files:
                continue
            if any(part.startswith('.') for part in relative.parts) or path.name in {'tracker.html', 'rhumbline-editor.js', 'track-preparation-math.js', 'gpu-probe.html', 'gpu-probe.js'}:
                continue
            if path.is_symlink():
                raise ValueError(f'Symbolic links cannot be published: {relative}')
            if path.is_file() and path.suffix.lower() in PUBLIC_SUFFIXES:
                target = stage / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
        (stage / 'events' / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        asset_root = package_tracker_assets(stage)
        config_url = package_tracker_config(stage, api_base)
        for event in catalog['events']:
            entry = stage / 'events' / event['id'] / 'index.html'
            entry.write_text(tracker_html(event['id'], asset_root, config_url), encoding='utf-8')
        (stage / '.nojekyll').touch()
        if not (stage / 'index.html').is_file():
            raise ValueError('viewer/index.html is missing')
        output = ROOT / 'dist'
        if output.is_symlink():
            raise ValueError('Refusing to overwrite a symlink at dist')
        if output.exists():
            shutil.rmtree(output)
        shutil.copytree(stage, output)
    print(f'Built {output}: {len(catalog["events"])} stævner with symmetric entry points')


if __name__ == '__main__':
    build()
