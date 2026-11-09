"""Test permanent route writes on an isolated loopback server and temporary file."""
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import serve_viewer


class PermanentRhumblineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.original = serve_viewer.RHUMBLINE_FILE
        serve_viewer.RHUMBLINE_FILE = Path(self.temporary.name) / 'rhumbline.json'
        serve_viewer.RHUMBLINE_FILE.write_text('{"version":1,"points":[]}\n')
        self.server = serve_viewer.ThreadingHTTPServer(('127.0.0.1', 0), serve_viewer.ViewerHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        serve_viewer.RHUMBLINE_FILE = self.original
        self.temporary.cleanup()

    def post(self, value, origin=True):
        request = Request(self.origin + '/api/rhumbline', data=json.dumps(value).encode(),
                          headers={'Content-Type': 'application/json', **({'Origin': self.origin} if origin else {})})
        try:
            response = urlopen(request)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def test_save_once_and_serve_same_file(self):
        definition = {'version': 1, 'points': [[12, 55], [12.1, 55.1], [12.3, 55.2]]}
        self.assertEqual(self.post(definition), (201, definition))
        self.assertEqual(json.loads(serve_viewer.RHUMBLINE_FILE.read_text()), definition)
        with urlopen(self.origin + '/rhumbline.json') as response:
            self.assertEqual(json.load(response), definition)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(self.post({'version': 1, 'points': [[10, 54], [11, 55]]})[0], 409)
        self.assertEqual(json.loads(serve_viewer.RHUMBLINE_FILE.read_text()), definition)
        with urlopen(self.origin + '/rhumbline.html') as response:
            self.assertIn(b'id="map"', response.read())

    def test_invalid_input_or_missing_origin_does_not_write(self):
        valid = {'version': 1, 'points': [[12, 55], [12.1, 55.1]]}
        self.assertEqual(self.post(valid, origin=False)[0], 403)
        for points in [[], [[12, 55]], [[12, 55], [12, 55]], [[12, 55], [13, 90]],
                       [[True, 55], [12, 56]], [[12, 55], [float('nan'), 56]]]:
            self.assertEqual(self.post({'version': 1, 'points': points})[0], 400)
        self.assertEqual(json.loads(serve_viewer.RHUMBLINE_FILE.read_text()), {'version': 1, 'points': []})

    def test_corrupt_existing_file_is_not_replaced(self):
        serve_viewer.RHUMBLINE_FILE.write_text('invalid JSON')
        self.assertEqual(self.post({'version': 1, 'points': [[12, 55], [12.1, 55.1]]})[0], 500)
        self.assertEqual(serve_viewer.RHUMBLINE_FILE.read_text(), 'invalid JSON')


if __name__ == '__main__':
    unittest.main()
