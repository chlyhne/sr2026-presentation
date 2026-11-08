"""One-time local GitHub App registration. Secrets go directly to Wrangler stdin."""
import argparse
import html
import json
import secrets
import subprocess
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8098)
parser.add_argument('--backend', default='https://sr2026-presentation-admin.hummesse.workers.dev')
parser.add_argument('--no-browser', action='store_true')
args = parser.parse_args()
state = secrets.token_urlsafe(32)
base = f'http://127.0.0.1:{args.port}'
setup_path = '/setup/' + state
# npx uses the project's pinned Wrangler and Node 22 without changing system Node.
wrangler = ['npx', '--yes', '--package=node@22', '--package=wrangler@4.154.0', 'wrangler']
manifest = {
 'name': 'SR2026 Presentation', 'url': 'https://chlyhne.github.io/sr2026-presentation/',
 'redirect_url': base + '/callback',
 'callback_urls': [args.backend + '/auth/callback'],
 'public': True, 'hook_attributes': {'active': False, 'url': args.backend + '/webhook'},
 'default_permissions': {'contents': 'write', 'metadata': 'read'},
 'default_events': [],
}
class Handler(BaseHTTPRequestHandler):
 def log_message(self, *args): pass
 def page(self, status, body):
  payload=('<!doctype html><meta charset="utf-8"><title>SR2026 opsætning</title><main style="max-width:650px;margin:60px auto;font:18px system-ui">'+body+'</main>').encode()
  self.send_response(status);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Referrer-Policy','no-referrer');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
 def do_GET(self):
  url=urllib.parse.urlsplit(self.path);query=urllib.parse.parse_qs(url.query)
  if url.path==setup_path:
   self.page(200, '<h1>Aktivér GitHub-login</h1><p>Opret præsentationens GitHub App, og installér den derefter kun på <b>sr2026-presentation</b>. Nøgler gemmes direkte som Cloudflare-hemmeligheder.</p><form method="post" action="https://github.com/settings/apps/new?state='+state+'"><input type="hidden" name="manifest" value="'+html.escape(json.dumps(manifest),quote=True)+'"><button>Opret GitHub App</button></form>');return
  if url.path!='/callback' or query.get('state')!=[state] or not query.get('code'):
   self.page(404,'Siden findes ikke.');return
  try:
   code=query['code'][0]
   if not code.isalnum():raise ValueError('Invalid code')
   conversion=subprocess.run(['gh','api','--method','POST',f'/app-manifests/{code}/conversions'],capture_output=True,text=True,check=True)
   app=json.loads(conversion.stdout)
   for name,value in [('GITHUB_CLIENT_ID',app['client_id']),('GITHUB_CLIENT_SECRET',app['client_secret']),('SESSION_SECRET',secrets.token_urlsafe(48))]:
    result=subprocess.run(wrangler+['secret','put',name],input=value+'\n',capture_output=True,text=True,cwd=ROOT/'backend')
    if result.returncode:raise RuntimeError('Cloudflare kunne ikke gemme '+name)
   install=app['html_url']+'/installations/new'
   self.page(200,'<h1>Login er konfigureret</h1><p>Sidste trin: installér appen på dit præsentationsrepo.</p><p><a href="'+html.escape(install,quote=True)+'">Installér GitHub App</a></p><p>Vælg <b>Only select repositories → sr2026-presentation</b>.</p><p><a href="'+html.escape(args.backend,quote=True)+'/auth/login">Åbn redigering efter installation</a></p>')
   print('GitHub App oprettet; Cloudflare-hemmeligheder gemt. Installér appen via browseren.',flush=True)
  except Exception:
   self.page(500,'Opsætningen kunne ikke gennemføres. Ingen nøgler vises her. Kontrollér GitHub/Cloudflare-adgang i terminalen. En eventuelt oprettet App findes under GitHub Settings → Developer settings.')
server=HTTPServer(('127.0.0.1',args.port),Handler)
print('Åbn opsætningen: '+base+setup_path,flush=True)
if not args.no_browser:webbrowser.open(base+setup_path)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:server.server_close()
