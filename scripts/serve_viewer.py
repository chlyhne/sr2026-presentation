"""Serve the viewer and persist uploaded event images on the local server."""
import argparse
import json
import math
import os
import re
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from build_pages import prepare_track_profiles

ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / 'viewer' / 'event-images'
MAX_UPLOAD = 16 * 1024 * 1024
IMAGE_NAME = re.compile(r'^[0-9a-f-]{36}\.(webp|png|jpg)$')
RHUMBLINE_FILE = ROOT / 'viewer' / 'rhumbline.json'
RHUMBLINE_LOCK = threading.Lock()
CLIENT_ERRORS_FILE = Path(tempfile.gettempdir()) / 'sr2026-client-errors.jsonl'
CLIENT_ERRORS_LOCK = threading.Lock()
CLIENT_CONTROL_FILE = Path(tempfile.gettempdir()) / 'sr2026-client-control.json'


def valid_rhumbline(value):
    if not isinstance(value, dict) or value.get('version') != 1 or set(value) != {'version', 'points'}:
        return False
    points = value['points']
    if not isinstance(points, list) or not 2 <= len(points) <= 200:
        return False
    for index, point in enumerate(points):
        if not isinstance(point, list) or len(point) != 2 or not all(type(n) in (int, float) and math.isfinite(n) for n in point):
            return False
        if abs(point[0]) > 180 or abs(point[1]) >= 85:
            return False
        if index and (abs(point[0] - points[index - 1][0]) >= 180 or math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) <= 1e-8):
            return False
    return True


class ViewerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'viewer'), **kwargs)

    def parse_request(self):
        if not super().parse_request():
            return False
        self.test_alias = urlsplit(self.path).path.startswith('/test/')
        if self.test_alias:
            # Keep /test/ in the browser while using the same handlers and files.
            self.path = self.path[len('/test'):]
        del self.headers['If-Modified-Since']
        return True

    def translate_path(self, path):
        route = urlsplit(path).path
        if route == '/rhumbline.html':
            return str(ROOT / 'viewer' / 'index.html')
        if route == '/rhumbline.json':
            return str(RHUMBLINE_FILE)
        if route == '/rhumbline-boegestroemmen.json':
            return str(RHUMBLINE_FILE.with_name('rhumbline-boegestroemmen.json'))
        if route.startswith('/event-images/'):
            name = route.removeprefix('/event-images/')
            return str(IMAGE_DIR / name) if IMAGE_NAME.fullmatch(name) else str(IMAGE_DIR / '_not_found')
        return super().translate_path(path)

    def end_headers(self):
        immutable = re.fullmatch(r'/track-profiles/[a-f0-9]{64}/[a-zA-Z0-9_.-]+\.gz', urlsplit(self.path).path)
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if immutable else 'no-store')
        super().end_headers()

    def json_response(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def active_client_command(self):
        command = json.loads(CLIENT_CONTROL_FILE.read_text(encoding='utf-8')) if CLIENT_CONTROL_FILE.exists() else {}
        matches = command.get('target') == 'all' or (command.get('target') == 'iphone' and 'iPhone' in self.headers.get('User-Agent', ''))
        return command if matches and command.get('command') == 'reload' and command.get('expiresAt', 0) > time.time() * 1000 else {}

    def do_GET(self):
        # An explicit local test command can select the diagnostic document.
        # The client still reloads only after acknowledging and protecting drafts.
        if urlsplit(self.path).path in {'/', '/index.html'} and CLIENT_CONTROL_FILE.exists():
            try:
                command = self.active_client_command()
                if command.get('page') == 'probe':
                    self.path = '/gpu-probe.html'
            except (OSError, ValueError, TypeError):
                self.json_response(500, {'error': 'GPU-testkommandoen kunne ikke læses.'})
                return
        if urlsplit(self.path).path == '/api/client-control':
            try:
                command = json.loads(CLIENT_CONTROL_FILE.read_text(encoding='utf-8')) if CLIENT_CONTROL_FILE.exists() else {'command': None}
                self.json_response(200, command)
            except (OSError, ValueError):
                self.json_response(500, {'error': 'Testserverens klientkommando kunne ikke læses.'})
            return
        if urlsplit(self.path).path == '/config.js':
            try:
                revision = self.active_client_command().get('revision')
            except (OSError, ValueError, TypeError):
                self.json_response(500, {'error': 'Testserverens klientkommando kunne ikke læses.'})
                return
            config = {'local': True, 'admin': False, 'apiBase': '', 'diagnosticsUrl': 'api/client-errors', 'clientControlUrl': 'api/client-control', 'clientControlRevision': revision}
            body = ('window.SR_CONFIG=' + json.dumps(config) + ';').encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path == '/api/client-errors':
            self.save_client_error()
            return
        if urlsplit(self.path).path == '/api/rhumbline':
            self.save_rhumbline()
            return
        if urlsplit(self.path).path != '/api/event-images':
            self.json_response(404, {'error': 'Ukendt uploadadresse.'})
            return
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            self.json_response(403, {'error': 'Upload skal ske fra vieweren på denne server.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if not 0 < length <= MAX_UPLOAD:
            self.json_response(413, {'error': 'Billedet skal være mindre end 16 MB.'})
            return
        data = self.rfile.read(length)
        if len(data) != length:
            self.json_response(400, {'error': 'Billedfilen blev ikke modtaget helt.'})
            return
        content_type = self.headers.get('Content-Type', '').split(';')[0]
        signatures = {
            'image/webp': ('webp', data[:4] == b'RIFF' and data[8:12] == b'WEBP'),
            'image/png': ('png', data.startswith(b'\x89PNG\r\n\x1a\n')),
            'image/jpeg': ('jpg', data.startswith(b'\xff\xd8\xff')),
        }
        extension, valid = signatures.get(content_type, ('', False))
        if not valid:
            self.json_response(415, {'error': 'Upload et JPEG-, PNG- eller WebP-billede.'})
            return
        image_id = str(uuid.uuid4())
        name = f'{image_id}.{extension}'
        try:
            IMAGE_DIR.mkdir(parents=True, exist_ok=True)
            with (IMAGE_DIR / name).open('xb') as target:
                target.write(data)
        except OSError:
            self.json_response(500, {'error': 'Serveren kunne ikke gemme billedet.'})
            return
        self.json_response(201, {'id': image_id, 'url': f'/event-images/{name}'})

    def save_client_error(self):
        if self.headers.get('Origin') != f'http://{self.headers.get("Host")}':
            self.json_response(403, {'error': 'Fejlrapporter skal komme fra denne testserver.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 65536:
                raise ValueError('size')
            report = json.loads(self.rfile.read(length))
            if not isinstance(report, dict) or report.get('version') != 1 or not all(isinstance(report.get(key), str) for key in ['session', 'kind', 'message']):
                raise ValueError('report')
        except (ValueError, UnicodeDecodeError):
            self.json_response(400, {'error': 'Ugyldig fejlrapport.'})
            return
        entry = {'id': str(uuid.uuid4()), 'received': datetime.now(timezone.utc).isoformat(), 'report': report}
        try:
            with CLIENT_ERRORS_LOCK:
                if CLIENT_ERRORS_FILE.exists() and CLIENT_ERRORS_FILE.stat().st_size > 2 * 1024 * 1024:
                    CLIENT_ERRORS_FILE.replace(CLIENT_ERRORS_FILE.with_suffix('.jsonl.1'))
                with CLIENT_ERRORS_FILE.open('a', encoding='utf-8') as target:
                    target.write(json.dumps(entry, ensure_ascii=False) + '\n')
        except OSError:
            self.json_response(500, {'error': 'Testserveren kunne ikke gemme fejlrapporten.'})
            return
        self.json_response(201, {'id': entry['id']})

    def save_rhumbline(self):
        course = parse_qs(urlsplit(self.path).query).get('course', ['groensund'])[0]
        if course not in {'groensund', 'boegestroemmen'}:
            self.json_response(400, {'error': 'Ukendt bane.'})
            return
        route_file = RHUMBLINE_FILE if course == 'groensund' else RHUMBLINE_FILE.with_name('rhumbline-boegestroemmen.json')
        if self.headers.get('Origin') != f'http://{self.headers.get("Host")}':
            self.json_response(403, {'error': 'Gem rhumblinen fra kortet på denne lokale server.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 16384:
                raise ValueError('size')
            definition = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            self.json_response(400, {'error': 'Rhumbline blev ikke modtaget som gyldige punkter.'})
            return
        if not valid_rhumbline(definition):
            self.json_response(400, {'error': 'Tegn 2–200 forskellige punkter i sejlretningen.'})
            return
        with RHUMBLINE_LOCK:
            temporary = None
            try:
                existing = json.loads(route_file.read_text(encoding='utf-8'))
                if existing != {'version': 1, 'points': []} and not valid_rhumbline(existing):
                    raise ValueError('Invalid permanent rhumbline')
                if existing.get('points') and existing != definition:
                    self.json_response(409, {'error': 'Rhumbline er allerede gemt permanent og kan ikke overskrives fra kortet.'})
                    return
                with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=route_file.parent, delete=False) as target:
                    temporary = Path(target.name)
                    target.write(json.dumps(definition, ensure_ascii=False, indent=2) + '\n')
                    target.flush()
                    os.fsync(target.fileno())
                temporary.chmod(0o644)
                temporary.replace(route_file)
            except (OSError, ValueError, AttributeError):
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
                self.json_response(500, {'error': 'Rhumbline kunne ikke gemmes i projektet.'})
                return
        try:
            prepare_track_profiles()
        except (OSError, subprocess.CalledProcessError):
            self.json_response(500, {'error': 'Rhumbline er gemt, men sporfilerne kunne ikke bygges. Gem den samme rute igen for at prøve klargøringen igen.'})
            return
        self.json_response(201, definition)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8097)
    parser.add_argument('--bind', default='127.0.0.1')
    args = parser.parse_args()
    prepare_track_profiles()
    server = ThreadingHTTPServer((args.bind, args.port), ViewerHandler)
    server.daemon_threads = True
    print(f'Viewer: http://{args.bind}:{args.port}/ · billeder: {IMAGE_DIR}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
