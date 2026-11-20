"""Package only the public viewer and its published content for GitHub Pages."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit
from event_config import load_catalog, tracker_html

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_SUFFIXES = {'.geojson', '.html', '.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.gz'}


def prepare_track_profiles():
    node = shutil.which('node')
    if node is None:
        raise RuntimeError('Node.js is required to prepare track profiles. Install Node.js 24 and run this command again.')
    subprocess.run([node, str(ROOT / 'scripts' / 'prepare_track_profiles.cjs'), '--if-stale'], cwd=ROOT, check=True)


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
            event_document=json.loads((ROOT/config['presentationFile']).read_text(encoding='utf-8'))
            if event_document.get('version')!=1 or not isinstance(event_document.get('notes'),list) or not isinstance(event_document.get('speedPins'),list):
                raise ValueError('Invalid presentation: '+config['presentationFile'])
            event_target=stage/'events'/event['id']/'presentation.json'
            event_target.parent.mkdir(parents=True,exist_ok=True)
            event_target.write_text(json.dumps(event_document,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            (event_target.parent/'index.html').write_text(tracker_html(event['id']),encoding='utf-8')
        for path in (ROOT / 'viewer').rglob('*'):
            relative = path.relative_to(ROOT / 'viewer')
            if 'track-profiles' in relative.parts and relative.as_posix() not in profile_files:
                continue
            if any(part.startswith('.') for part in relative.parts) or path.name in {'tracker.html', 'rhumbline-editor.js', 'data.js', 'track-preparation-math.js', 'gpu-probe.html', 'gpu-probe.js'}:
                continue
            if path.is_symlink():
                raise ValueError(f'Symbolic links cannot be published: {relative}')
            if path.is_file() and path.suffix.lower() in PUBLIC_SUFFIXES:
                target = stage / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
        (stage / 'config.js').write_text('window.SR_CONFIG=' + json.dumps({'apiBase': api_base, 'admin': False}, ensure_ascii=True) + ';\n', encoding='utf-8')
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
