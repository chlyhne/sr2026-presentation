"""Serve the viewer and persist uploaded event images on the local server."""
import argparse
import json
import re
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / 'data' / 'event-images'
MAX_UPLOAD = 16 * 1024 * 1024
IMAGE_NAME = re.compile(r'^[0-9a-f-]{36}\.(webp|png|jpg)$')


class ViewerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'viewer'), **kwargs)

    def translate_path(self, path):
        route = urlsplit(path).path
        if route.startswith('/event-images/'):
            name = route.removeprefix('/event-images/')
            return str(IMAGE_DIR / name) if IMAGE_NAME.fullmatch(name) else str(IMAGE_DIR / '_not_found')
        return super().translate_path(path)

    def json_response(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path == '/config.js':
            body = b'window.SR_CONFIG={local:true,admin:false,apiBase:""};'
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
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


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8097)
    parser.add_argument('--bind', default='127.0.0.1')
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.bind, args.port), ViewerHandler)
    server.daemon_threads = True
    print(f'Viewer: http://{args.bind}:{args.port}/ · billeder: {IMAGE_DIR}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
