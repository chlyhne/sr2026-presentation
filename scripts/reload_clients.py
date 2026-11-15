"""Ask connected local test clients to reload once; never bypass unsaved drafts."""
import argparse
import json
from pathlib import Path
import tempfile
import time
import uuid
from serve_viewer import CLIENT_CONTROL_FILE


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', default='iphone', help='iphone, all, or a session ID from the client log')
    parser.add_argument('--page', choices=['tracker', 'probe'], default='tracker')
    parser.add_argument('--probe', choices=['minimal', 'minimal-no-aa', 'line', 'background', 'background-real', 'upload'], default='minimal')
    parser.add_argument('--cancel', action='store_true', help='Clear any pending reload command')
    args = parser.parse_args()
    command = {'command': None} if args.cancel else {
        'command': 'reload', 'revision': str(uuid.uuid4()), 'target': args.target, 'page': args.page, 'probe': args.probe,
        'expiresAt': int(time.time() * 1000) + 5 * 60 * 1000,
    }
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=CLIENT_CONTROL_FILE.parent, prefix='sr2026-client-command-', delete=False) as output:
        temporary = output.name
        json.dump(command, output)
    Path(temporary).replace(CLIENT_CONTROL_FILE)
    print(json.dumps(command))


if __name__ == '__main__':
    main()
