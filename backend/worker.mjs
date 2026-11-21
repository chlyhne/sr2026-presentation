import '../viewer/i18n-messages.js';
import eventCatalog from '../viewer/events/catalog.json' with {type:'json'};
const encoder = new TextEncoder(), decoder = new TextDecoder();
const SESSION = '__Host-sr-session', OAUTH = '__Host-sr-oauth';
const IMAGE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg)$/;
const LOGIN_ATTEMPT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_DOCUMENT = 4 * 1024 * 1024, MAX_IMAGE = 16 * 1024 * 1024;
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const url64 = bytes => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromUrl64 = value => unb64(value.replace(/-/g, '+').replace(/_/g, '/'));
const random = () => url64(crypto.getRandomValues(new Uint8Array(32)));
const now = () => Math.floor(Date.now() / 1000);
function cookie(name, value, maxAge) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function cookies(request) { return Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(p => p.trim().split('='))); }
async function key(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) fail(503, 'Login er ikke konfigureret.');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(env.SESSION_SECRET)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(value, env, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: encoder.encode(purpose)}, await key(env), encoder.encode(JSON.stringify(value)));
  return `${url64(iv)}.${url64(new Uint8Array(encrypted))}`;
}
async function unseal(value, env, purpose) {
  try {
    if (!value || value.length > 3800) return null;
    const [iv, data] = value.split('.');
    const raw = await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromUrl64(iv), additionalData: encoder.encode(purpose)}, await key(env), fromUrl64(data));
    const result = JSON.parse(decoder.decode(raw));
    return result.exp > now() ? result : null;
  } catch { return null; }
}
function repo(env) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY || '')) fail(503, 'Repository er ikke konfigureret.');
  return `/repos/${env.GITHUB_REPOSITORY}`;
}
async function github(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, { ...options, headers: {
    'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'sr2026-presentation', ...options.headers
  }});
  if (!response.ok) {
    if (response.status === 401) fail(401, 'Log ind med GitHub igen.');
    if ([409, 422].includes(response.status)) fail(409, 'Serverens eventsæt er ændret. Din kladde er stadig gemt.');
    if (response.status === 403) fail(403, 'GitHub afviste handlingen. Kontrollér rettigheder og eventuelle branch-regler.');
    if (response.status === 404) fail(404, 'Filen eller repositoryet findes ikke, eller du mangler adgang.');
    fail(502, 'GitHub kunne ikke gennemføre handlingen. Prøv igen senere.');
  }
  return response;
}
async function identity(token, env) {
  const user = await (await github('/user', token)).json();
  try {
    const permission = await (await github(`${repo(env)}/collaborators/${encodeURIComponent(user.login)}/permission`, token)).json();
    return {id: user.id, login: user.login, canEdit: ['write', 'admin'].includes(permission.permission)};
  } catch (error) {
    if (![403, 404].includes(error.status)) throw error;
    return {id: user.id, login: user.login, canEdit: false};
  }
}
async function githubSession(request, env) {
  const session = await unseal(cookies(request)[SESSION], env, 'session');
  return session?.token && Number.isSafeInteger(session.id) && session.id > 0 ? session : null;
}
async function eventAccount(request,env){
  const session=await githubSession(request,env);
  return session?{id:session.id,canPublish:session.canPublish!==false,privateAvailable:!!env.PRIVATE_EVENTS}:null;
}
async function authorize(request, env) {
  const session = await githubSession(request, env);
  if (!session) fail(401, 'Log ind med GitHub for at udgive.');
  const user = await identity(session.token, env);
  if (user.id !== session.id || !user.canEdit) fail(403, 'Du skal have skriverettighed til repositoryet.');
  return {...user, token: session.token};
}
function checkOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) fail(403, 'Handlingen skal udføres fra redigeringssiden.');
}
async function readBody(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) fail(413, 'Filen er for stor.');
  if (!request.body) fail(400, 'Indhold mangler.');
  const reader = request.body.getReader(), chunks = []; let length = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); fail(413, 'Filen er for stor.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const string = (value, max = 10000) => typeof value === 'string' && value.length <= max;
const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
export function validateDocument(doc, {privateEvents = false} = {}) {
  if (!object(doc) || doc.version !== 1 || !Array.isArray(doc.notes) || doc.notes.length > 5000 || !Array.isArray(doc.speedPins) || doc.speedPins.length > 10000) fail(400, 'Ugyldigt præsentationsformat.');
  const ids = new Set();
  for (const note of doc.notes) {
    if (!object(note) || !Number.isFinite(note.time) || !string(note.text, 50000)) fail(400, 'Ugyldigt event.');
    if (privateEvents) {
      if (note.private !== true || !string(note.privateId, 36) || !IMAGE.test(note.privateId + '.png') || ids.has(note.privateId)) fail(400, 'Ugyldigt event.');
      ids.add(note.privateId);
    } else if ((note.private !== undefined && note.private !== false) || note.privateId !== undefined) {
      fail(400, 'Private events må kun gemmes privat.');
    }
    if (note.view !== undefined && (!vector(note.view, 4) || note.view[2] <= 0 || note.view[3] <= 0)) fail(400, 'Ugyldigt kortudsnit.');
    if (note.point !== undefined && !vector(note.point, 2)) fail(400, 'Ugyldig markør.');
    for (const [field, count] of [['measurement', 2], ['gates', 4]]) {
      if (note[field] !== undefined && (!Array.isArray(note[field]) || ![0, count].includes(note[field].length)
        || !note[field].every(p => vector(p, 2) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) < 85))) fail(400, 'Ugyldig måling.');
    }
    for (const k of ['lon', 'lat']) if (note[k] !== undefined && !Number.isFinite(note[k])) fail(400, 'Ugyldig koordinat.');
    if (note.settings !== undefined) {
      const s = note.settings; if (!object(s)) fail(400, 'Ugyldige indstillinger.');
      for (const k of ['wind', 'windNumbers', 'rain', 'grid', 'traffic', 'military', 'annotationsVisible', 'handicapTracksEnabled', 'boatFavouritesOnly']) if (s[k] !== undefined && typeof s[k] !== 'boolean') fail(400, 'Ugyldige indstillinger.');
      if (s.windMode !== undefined && !['off', 'mean', 'gust'].includes(s.windMode)) fail(400, 'Ugyldige indstillinger.');
      for (const k of ['boats', 'boatNames']) if (s[k] !== undefined && (!Array.isArray(s[k]) || s[k].length > 2000 || !s[k].every(v => string(v, 200)))) fail(400, 'Ugyldigt bådvalg.');
      if (s.windModel !== undefined && !['dmi_harmonie_arome_europe', 'ecmwf_ifs', 'era5'].includes(s.windModel)) fail(400, 'Ugyldig vindmodel.');
      if (s.rainOpacity !== undefined && (!Number.isFinite(s.rainOpacity) || s.rainOpacity < 0 || s.rainOpacity > 1)) fail(400, 'Ugyldig gennemsigtighed.');
      if (s.mapVersion !== undefined && s.mapVersion !== 1) fail(400, 'Ukendt kortkonfiguration.');
      if (s.referenceBoatId !== undefined && !string(s.referenceBoatId, 200)) fail(400, 'Ugyldig referencebåd.');
      if (s.boatSearchQuery !== undefined && !string(s.boatSearchQuery, 10000)) fail(400, 'Ugyldigt bådfilter.');
      if (s.boatCourseFilter !== undefined && (typeof s.boatCourseFilter!=='string'||(s.boatCourseFilter!==''&&!/^[a-z0-9_-]{1,64}$/.test(s.boatCourseFilter)))) fail(400, 'Ugyldig bane.');
      if (s.boatClassFilter !== undefined && !string(s.boatClassFilter, 200)) fail(400, 'Ugyldigt løb.');
      if (s.trackLengthSeconds !== undefined && ![-1,0,900,1800,3600,7200,14400,28800].includes(s.trackLengthSeconds)) fail(400, 'Ugyldig sporlængde.');
      if (s.comparison !== undefined) {
        const c = s.comparison;
        if (!object(c) || typeof c.enabled !== 'boolean' || !['absolute','handicap','time'].includes(c.basis)
          || (c.boatColour !== undefined && typeof c.boatColour !== 'boolean') || (c.enabled && c.boatColour)
          || Object.keys(c).some(k => !['enabled','basis','boatColour'].includes(k))) fail(400, 'Ugyldig sportype.');
      }
    }
    if (note.drawings !== undefined && (!Array.isArray(note.drawings) || note.drawings.length > 1000 || !note.drawings.every(d => object(d) && ['pen', 'arrow', 'line', 'circle'].includes(d.tool) && /^#[a-f0-9]{6}$/i.test(d.colour) && Number.isFinite(d.width) && d.width >= 1 && d.width <= 12 && Array.isArray(d.points) && d.points.length >= 2 && d.points.length <= 50000 && d.points.every(p => vector(p, 2))))) fail(400, 'Ugyldig tegning.');
    if (note.image != null) {
      const image = note.image, directory = privateEvents ? 'private-event-images' : 'event-images';
      const filename = typeof image.url === 'string' && image.url.split('/').at(-1);
      if (!object(image) || image.draft !== undefined || !string(image.id, 36) || !string(image.name, 500) || !IMAGE.test(filename) || image.url !== `${directory}/${filename}` || !filename.startsWith(image.id + '.')) fail(400, 'Ugyldigt billede.');
    }
    if (note.video != null && (!object(note.video) || note.video.provider !== 'youtube' || !/^[\w-]{11}$/.test(note.video.id) || !Number.isInteger(note.video.start) || note.video.start < 0 || note.video.start > 2147483647)) fail(400, 'Ugyldig video.');
  }
  for (const pin of doc.speedPins) if (!object(pin) || !string(pin.id, 200) || !string(pin.boatId, 200) || !Number.isFinite(pin.time)) fail(400, 'Ugyldigt fartmærke.');
  // JSON is served as data, never executable HTML; disallow unexpected bulk/secret fields.
  if (Object.keys(doc).some(k => !['version', 'notes', 'speedPins'].includes(k))) fail(400, 'Ukendte præsentationsfelter.');
  return doc;
}
const contentsPath = (env, path) => `${repo(env)}/contents/${path}`;
const branch = env => env.GITHUB_BRANCH || 'main';
async function publicFile(env, path, options) {
  const repository = repo(env).slice('/repos/'.length);
  const source = await fetch(`https://raw.githubusercontent.com/${repository}/${encodeURIComponent(branch(env))}/${path}`, options);
  if (!source.ok) fail(source.status === 404 ? 404 : 502, 'Den udgivne fil kunne ikke hentes.');
  return source;
}
async function gitBlobSha(bytes) {
  const prefix = encoder.encode(`blob ${bytes.length}\0`), blob = new Uint8Array(prefix.length + bytes.length);
  blob.set(prefix); blob.set(bytes, prefix.length);
  const digest = await crypto.subtle.digest('SHA-1', blob);
  return Array.from(new Uint8Array(digest), octet => octet.toString(16).padStart(2, '0')).join('');
}
async function getContentMetadata(env, token, path) {
  const response = await github(`${contentsPath(env, path)}?ref=${encodeURIComponent(branch(env))}`, token);
  return response.json();
}
async function putContent(env, token, path, content, message, sha) {
  return (await github(contentsPath(env, path), token, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({branch: branch(env), message, content: b64(content), ...(sha ? {sha} : {})})})).json();
}
const supportedLanguage=language=>language==='da'||globalThis.SR_MESSAGE_LANGUAGES.includes(language);
function eventForURL(url) {
  const id = url.searchParams.get('event') || eventCatalog.default;
  const event = eventCatalog.events.find(event => event.id === id);
  if (!event) fail(400, 'Ukendt stævne.');
  return event;
}
function privatePrefix(session, event) {
  return `users/${session.id}/${event.id}/`;
}
async function privateStorage(request, env, url) {
  const session = await githubSession(request, env);
  if (!session) fail(401, 'Log ind med GitHub for at se eller gemme private events.');
  const owner=url.searchParams.get('owner');
  if(owner!==null&&owner!==String(session.id))fail(403,'Log ind med den konto, der ejer disse private events.');
  if (!env.PRIVATE_EVENTS) fail(503, 'Lageret til private events er ikke konfigureret.');
  return {store: env.PRIVATE_EVENTS, prefix: privatePrefix(session, eventForURL(url))};
}
function imageType(name) {
  return name.endsWith('.webp') ? 'image/webp' : name.endsWith('.png') ? 'image/png' : 'image/jpeg';
}
async function routes(request, env, locale) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) checkOrigin(request);
  if (method === 'GET' && path === '/auth/login') {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) fail(503, 'GitHub-login er ikke konfigureret.');
    const state = random(), verifier = random(), eventId=url.searchParams.get('event');
    if(eventId&&!eventCatalog.events.some(event=>event.id===eventId))fail(400,'Ukendt stævne.');
    const language=url.searchParams.get('lang'),popup=url.searchParams.get('popup');
    if(popup!==null&&!LOGIN_ATTEMPT.test(popup))fail(400,'Loginforsøget er udløbet eller ugyldigt. Prøv igen.');
    const challenge = url64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
    const destination = new URL('https://github.com/login/oauth/authorize');
    destination.search = new URLSearchParams({client_id: env.GITHUB_CLIENT_ID, redirect_uri: `${url.origin}/auth/callback`, state, code_challenge: challenge, code_challenge_method: 'S256'});
    return new Response(null, {status: 302, headers: {Location: destination.href, 'Set-Cookie': cookie(OAUTH, await seal({state, verifier, popup, ...(eventId?{eventId}:{}), ...(supportedLanguage(language)?{language}:{}), exp: now() + 600}, env, 'oauth'), 600), 'Cache-Control': 'no-store'}});
  }
  if (method === 'GET' && path === '/auth/callback') {
    const pending = await unseal(cookies(request)[OAUTH], env, 'oauth');
    if (supportedLanguage(pending?.language)) locale.language=pending.language;
    if (!pending || url.searchParams.get('state') !== pending.state) fail(400, 'Loginforsøget er udløbet eller ugyldigt. Prøv igen.');
    if(pending.popup&&url.searchParams.get('error')==='access_denied'){
      return new Response(null,{status:302,headers:{
        Location:'/auth/complete?popup='+pending.popup+'&cancelled=1','Set-Cookie':cookie(OAUTH,'',0),'Cache-Control':'no-store'
      }});
    }
    if(!url.searchParams.get('code'))fail(400,'Loginforsøget er udløbet eller ugyldigt. Prøv igen.');
    const response = await fetch('https://github.com/login/oauth/access_token', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify({client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code'), code_verifier: pending.verifier, redirect_uri: `${url.origin}/auth/callback`})});
    const token = await response.json();
    if (!response.ok || !token.access_token || token.error) fail(401, 'GitHub-login kunne ikke gennemføres. Prøv igen.');
    const user = await identity(token.access_token, env);
    const maxAge = Math.max(1, Math.min(8 * 3600, Number(token.expires_in) || 8 * 3600));
    const value = await seal({id: user.id, canPublish: user.canEdit, token: token.access_token, exp: now() + maxAge}, env, 'session');
    if (value.length > 3800) fail(502, 'GitHub-sessionen kunne ikke oprettes.');
    const location=pending.popup?'/auth/complete?popup='+pending.popup:pending.eventId?'/admin/events/'+encodeURIComponent(pending.eventId)+'/':'/admin/';
    const headers = new Headers({Location: location+(!pending.popup&&pending.language?'?lang='+pending.language:''), 'Cache-Control': 'no-store'});
    headers.append('Set-Cookie', cookie(SESSION, value, maxAge)); headers.append('Set-Cookie', cookie(OAUTH, '', 0));
    return new Response(null, {status: 302, headers});
  }
  if (method === 'GET' && path === '/auth/complete') {
    const popup=url.searchParams.get('popup');
    if(!LOGIN_ATTEMPT.test(popup))fail(400,'Loginforsøget er udløbet eller ugyldigt. Prøv igen.');
    const status=url.searchParams.has('cancelled')?'cancelled':'ok';
    return new Response(`<!doctype html><meta charset="utf-8"><title>GitHub</title><script>const channel=new BroadcastChannel("sr-event-login:${popup}");channel.postMessage("${status}");channel.close();window.close();</script>`, {
      headers: {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'"}
    });
  }
  if (method === 'POST' && path === '/api/logout') return new Response('{}', {headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': cookie(SESSION, '', 0)}});
  if (method === 'GET' && path === '/api/event-session') return json({account:await eventAccount(request,env)});
  if (method === 'GET' && path === '/api/private-events') {
    const {store,prefix}=await privateStorage(request,env,url);
    const saved=await store.get(prefix+'events.json');
    return json({document:saved?await saved.json():{version:1,notes:[],speedPins:[]},revision:saved?.etag??null});
  }
  if (method === 'PUT' && path === '/api/private-events') {
    const {store, prefix} = await privateStorage(request, env, url);
    const input = await new Response(await readBody(request, MAX_DOCUMENT)).json().catch(() => null);
    if (!object(input) || (input.revision !== null && !/^[a-f0-9]{32}$/.test(input.revision || ''))) fail(400, 'Den indlæste version af private events mangler.');
    const doc = validateDocument(input.document, {privateEvents: true});
    if (doc.speedPins.length) fail(400, 'Ugyldigt præsentationsformat.');
    const images = new Set(doc.notes.flatMap(note => note.image ? [note.image.url] : []));
    for (const image of images) {
      if (!await store.head(prefix + image)) fail(400, 'Et af præsentationens billeder mangler. Upload det igen før udgivelse.');
    }
    const onlyIf = new Headers(input.revision === null ? {'If-None-Match': '*'} : {'If-Match': `"${input.revision}"`});
    const saved = await store.put(prefix + 'events.json', JSON.stringify(doc), {onlyIf});
    if (!saved) fail(409, 'Serverens eventsæt er ændret. Din kladde er stadig gemt.');
    return json({revision: saved.etag});
  }
  if (method === 'GET' && path.startsWith('/api/private-event-images/')) {
    const {store, prefix} = await privateStorage(request, env, url);
    const name = path.slice('/api/private-event-images/'.length);
    if (!IMAGE.test(name)) fail(404, 'Billedet findes ikke.');
    const image = await store.get(prefix + 'private-event-images/' + name);
    if (!image) fail(404, 'Billedet findes ikke.');
    return new Response(image.body, {headers: {'Content-Type': imageType(name), 'Cache-Control': 'private, no-store'}});
  }
  if (path === '/api/presentation' && ['GET', 'PUT'].includes(method)) {
    const event = eventForURL(url);
    const setId=url.searchParams.get('set')??'default';
    const set=setId==='default'?event:event.publicSets?.find(item=>item.id===setId);
    if(!set)fail(404,'Eventsættet findes ikke.');
    const documentPath=set.presentationFile;
    if (method === 'GET') {
      const response = await publicFile(env, documentPath, {cache:'no-store'});
      const bytes = new Uint8Array(await response.arrayBuffer());
      const result = {document:JSON.parse(decoder.decode(bytes)), sha:await gitBlobSha(bytes)};
      result.account=await eventAccount(request,env);
      return json(result);
    }
    const user = await authorize(request, env);
    let input; try { input = JSON.parse(decoder.decode(await readBody(request, MAX_DOCUMENT))); } catch (e) { if (e.status) throw e; fail(400, 'Ugyldig JSON.'); }
    if (!object(input)) fail(400, 'Ugyldig JSON.');
    const doc = validateDocument(input.document);
    if (!/^[a-f0-9]{40}$/.test(input.sha || '')) fail(400, 'Den indlæste versions SHA mangler.');
    const current = await getContentMetadata(env, user.token, documentPath);
    if (current.sha !== input.sha) fail(409, 'Serverens eventsæt er ændret. Din kladde er stadig gemt.');
    const imageURLs = [...new Set(doc.notes.filter(n => n.image).map(n => n.image.url))];
    if (imageURLs.length) {
      // One tree read avoids Worker subrequest limits for presentations with many images.
      const tree = await (await github(`${repo(env)}/git/trees/${encodeURIComponent(branch(env))}?recursive=1`, user.token)).json();
      if (tree.truncated) fail(502, 'Repositoryets filliste er for stor til at kontrollere billederne.');
      const paths = new Set(tree.tree.filter(entry => entry.type === 'blob').map(entry => entry.path));
      if (imageURLs.some(imagePath => !paths.has(`viewer/${imagePath}`))) fail(400, 'Et af præsentationens billeder mangler. Upload det igen før udgivelse.');
    }
    const saved = await putContent(env, user.token, documentPath, encoder.encode(JSON.stringify(doc, null, 2) + '\n'), `Update presentation by ${user.login}`, input.sha);
    return json({sha: saved.content.sha, commit: saved.commit.sha});
  }
  if (method === 'POST' && ['/api/event-images', '/api/private-event-images'].includes(path)) {
    const privateImage = path === '/api/private-event-images';
    const storage = privateImage ? await privateStorage(request, env, url) : null;
    const user = privateImage ? null : await authorize(request, env);
    const bytes = await readBody(request, MAX_IMAGE);
    const type = request.headers.get('Content-Type')?.split(';')[0], s = String.fromCharCode(...bytes.slice(0, 12));
    const extension = type === 'image/webp' && s.startsWith('RIFF') && s.slice(8, 12) === 'WEBP' ? 'webp' : type === 'image/png' && b64(bytes.slice(0, 8)) === 'iVBORw0KGgo=' ? 'png' : type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpg' : null;
    if (!extension) fail(415, 'Vælg et JPEG-, PNG- eller WebP-billede.');
    const id = url.searchParams.get('id') ?? crypto.randomUUID();
    const imagePath = `${privateImage ? 'private-event-images' : 'event-images'}/${id}.${extension}`;
    if (!IMAGE.test(`${id}.${extension}`)) fail(400, 'Ugyldigt billede.');
    if (storage) {
      const key = storage.prefix + imagePath;
      const saved = await storage.store.put(key, bytes, {onlyIf: new Headers({'If-None-Match': '*'})});
      if (!saved) {
        const existing = await storage.store.get(key);
        if (!existing || await gitBlobSha(new Uint8Array(await existing.arrayBuffer())) !== await gitBlobSha(bytes)) fail(409, 'Billedet kunne ikke gemmes til eventet.');
      }
      return json({id, url: imagePath}, 201);
    }
    const file = `viewer/${imagePath}`;
    try {
      await putContent(env, user.token, file, bytes, `Add event image by ${user.login}`);
    } catch (error) {
      if (error.status !== 409 || !url.searchParams.has('id')) throw error;
      const existing = await getContentMetadata(env, user.token, file);
      if (existing.sha !== await gitBlobSha(bytes)) throw error;
    }
    return json({id, url: imagePath}, 201);
  }
  if (method === 'GET' && path === '/admin/config.js') return new Response(`window.SR_CONFIG=${JSON.stringify({eventService: true, admin: true})};`, {headers: {'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store'}});
  if (method === 'GET' && (path.startsWith('/admin/event-images/')||path.startsWith('/api/event-images/'))) {
    const name = path.slice(path.indexOf('/event-images/')+'/event-images/'.length); if (!IMAGE.test(name)) fail(404, 'Billedet findes ikke.');
    const source = await publicFile(env, `viewer/event-images/${name}`);
    return new Response(source.body, {headers: {'Content-Type': imageType(name), 'Cache-Control': 'public, max-age=31536000, immutable'}});
  }
  if (method === 'GET' && (path === '/' || path === '/admin')) return Response.redirect(`${url.origin}/admin/`, 302);
  if (method === 'GET' && path.startsWith('/admin/')) {
    const base = new URL(env.SITE_URL);
    if (base.protocol !== 'https:' || !base.pathname.endsWith('/')) fail(503, 'SITE_URL skal være en HTTPS-adresse med afsluttende skråstreg.');
    const suffix = path.slice('/admin/'.length) || 'index.html';
    if (!/^[a-zA-Z0-9_./-]+$/.test(suffix) || suffix.split('/').some(p => p === '..' || p === '.') || suffix.startsWith('/')) fail(404, 'Siden findes ikke.');
    const target = new URL(suffix, base);
    if (!target.href.startsWith(base.href)) fail(404, 'Siden findes ikke.');
    const source = await fetch(target, {redirect: 'manual'});
    if (source.status >= 300 && source.status < 400) fail(502, 'Den offentlige side omdirigerer. Kontrollér SITE_URL.');
    const headers = new Headers({'Content-Type': source.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': 'no-store'});
    return new Response(source.body, {status: source.status, headers});
  }
  fail(404, 'Adressen findes ikke.');
}
export default {
  async fetch(request, env) {
    let response;
    const locale={language:new URL(request.url).searchParams.get('lang')};
    try {
      if (request.method === 'HEAD') {
        const path = new URL(request.url).pathname;
        if (!(path === '/' || path === '/admin' || path.startsWith('/admin/'))) fail(405, 'Metoden understøttes ikke.');
        response = await routes(new Request(request.url, {method: 'GET', headers: request.headers}), env, locale);
        response = new Response(null, {status: response.status, headers: response.headers});
      } else response = await routes(request, env, locale);
    }
    catch (error) {
      const message=error.status?error.message:'Serveren kunne ikke gennemføre handlingen.';
      const translated=globalThis.SR_MESSAGES[message];
      const text=translated?.[globalThis.SR_MESSAGE_LANGUAGES.indexOf(locale.language)];
      response=json({error:text??message},error.status||500);
    }
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff'); headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Frame-Options', 'DENY');
    return new Response(response.body, {status: response.status, headers});
  }
};
