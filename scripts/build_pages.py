"""Package only the public viewer and its published content for GitHub Pages."""
import json
import os
from pathlib import Path
import shutil
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_SUFFIXES = {'.html', '.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2'}


def build():
    api_base = os.environ.get('SR_API_URL', '').strip().rstrip('/')
    if api_base:
        parsed = urlsplit(api_base)
        if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
            raise ValueError('SR_API_URL must be an HTTPS origin, without a path or credentials')
    source = ROOT / 'presentation' / 'presentation.json'
    document = json.loads(source.read_text(encoding='utf-8')) if source.exists() else {'version': 1, 'notes': [], 'speedPins': []}
    if not isinstance(document, dict) or document.get('version') != 1 or not isinstance(document.get('notes'), list) or not isinstance(document.get('speedPins'), list):
        raise ValueError('presentation/presentation.json must contain version: 1, notes: [], speedPins: []')
    with tempfile.TemporaryDirectory(prefix='sr2026-pages-') as temporary:
        stage = Path(temporary) / 'public'
        stage.mkdir()
        for path in (ROOT / 'viewer').rglob('*'):
            relative = path.relative_to(ROOT / 'viewer')
            if any(part.startswith('.') for part in relative.parts) or path.name == 'validation.json':
                continue
            if path.is_symlink():
                raise ValueError(f'Symbolic links cannot be published: {relative}')
            if path.is_file() and path.suffix.lower() in PUBLIC_SUFFIXES:
                target = stage / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
        # Locally uploaded photos predate the online editor; both paths are supported.
        images = ROOT / 'data' / 'event-images'
        if images.exists():
            for path in images.iterdir():
                if path.is_file() and not path.is_symlink() and path.suffix.lower() in {'.webp', '.png', '.jpg'}:
                    target = stage / 'event-images' / path.name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if not target.exists():
                        shutil.copyfile(path, target)
        (stage / 'config.js').write_text('window.SR_CONFIG=' + json.dumps({'apiBase': api_base, 'admin': False}, ensure_ascii=True) + ';\n', encoding='utf-8')
        (stage / 'presentation.json').write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        (stage / '.nojekyll').touch()
        if not (stage / 'index.html').is_file():
            raise ValueError('viewer/index.html is missing')
        output = ROOT / 'dist'
        if output.is_symlink():
            raise ValueError('Refusing to overwrite a symlink at dist')
        if output.exists():
            shutil.rmtree(output)
        shutil.copytree(stage, output)
    print(f'Built {output}: {len(document["notes"])} events, {len(document["speedPins"])} speed pins')
    if not source.exists():
        print('No published presentation yet. Import local events in the online editor and publish.')


if __name__ == '__main__':
    build()
