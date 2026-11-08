import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker, {seal, validateDocument} from './worker.mjs';
globalThis.crypto ||= webcrypto;
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const env = {SESSION_SECRET:'testing-secret-with-at-least-32-characters', GITHUB_REPOSITORY:'owner/repo', GITHUB_BRANCH:'main', GITHUB_CLIENT_ID:'client', GITHUB_CLIENT_SECRET:'secret', SITE_URL:'https://owner.github.io/repo/'};
const origin = 'https://admin.example.com';
const document = {version:1, notes:[{time:123, text:'En hændelse', view:[0,0,1000,1000], settings:{boats:['Mercutio'],rainOpacity:.5}}], speedPins:[]};
const sha = 'a'.repeat(40);
const reply = (value, status=200) => new Response(JSON.stringify(value), {status});
async function request(path, options={}, session={id:7, token:'user-secret', exp:Math.floor(Date.now()/1000)+600}) {
 const headers = new Headers(options.headers);
 if(session) headers.set('Cookie', '__Host-sr-session='+await seal(session,env,'session'));
 if(options.method && options.method!=='GET') headers.set('Origin', origin);
 return worker.fetch(new Request(origin+path,{...options,headers}),env);
}
function mockGithub(permission='write', extra) {
 const calls=[];
 globalThis.fetch=async(url,options={})=>{
  calls.push({url:String(url),options});
  if(String(url).endsWith('/user')) return reply({id:7,login:'captain'});
  if(String(url).endsWith('/collaborators/captain/permission')) return reply({permission});
  if(extra) return extra(String(url),options);
  throw new Error('Unexpected fetch '+url);
 };
 return calls;
}
test('unauthenticated uploads fail before reading or calling GitHub',async()=>{
 globalThis.fetch=()=>{throw new Error('should not call');};
 const response=await request('/api/event-images',{method:'POST',body:'abc'},null);
 assert.equal(response.status,401);
});
test('cross-origin and absent-origin mutations are denied, including logout',async()=>{
 for(const source of [null,'https://evil.example']) {
  const headers=new Headers();if(source)headers.set('Origin',source);
  const response=await worker.fetch(new Request(origin+'/api/logout',{method:'POST',headers}),env);
  assert.equal(response.status,403);
 }
});
test('expired and tampered sessions fail closed',async()=>{
 const expired=await request('/api/presentation',{}, {id:7,token:'secret',exp:1});
 assert.equal(expired.status,401);
 const tampered=await worker.fetch(new Request(origin+'/api/presentation',{headers:{Cookie:'__Host-sr-session=invalid.invalid'}}),env);
 assert.equal(tampered.status,401);
});
test('readers cannot publish or upload and permissions are rechecked',async()=>{
 const calls=mockGithub('read');
 const result=await request('/api/event-images',{method:'POST',body:'abc'});
 assert.equal(result.status,403);assert.equal(calls.length,2);
 const session=await request('/api/session');assert.equal((await session.json()).canEdit,false);
});
test('a token for a different identity is rejected',async()=>{
 mockGithub('write');
 assert.equal((await request('/api/presentation',{}, {id:99,token:'secret',exp:Math.floor(Date.now()/1000)+600})).status,403);
});
test('writers can load and publish Unicode document; only fixed path written',async()=>{
 const calls=mockGithub('write',(url,options)=>{
  if(options.method==='PUT') {
   const body=JSON.parse(options.body);assert.equal(body.sha,sha);assert.equal(body.branch,'main');
   assert.deepEqual(JSON.parse(Buffer.from(body.content,'base64').toString('utf8')),document);
   assert.equal(url,'https://api.github.com/repos/owner/repo/contents/presentation/presentation.json');
   return reply({content:{sha:'b'.repeat(40)},commit:{sha:'c'.repeat(40)}});
  }
  return reply({sha,content:Buffer.from(JSON.stringify(document)).toString('base64')});
 });
 const loaded=await request('/api/presentation');assert.deepEqual(await loaded.json(),{document,sha});
 const saved=await request('/api/presentation',{method:'PUT',body:JSON.stringify({document,sha})});
 assert.equal(saved.status,200);assert.equal((await saved.json()).sha,'b'.repeat(40));
 assert.equal(calls.filter(c=>c.url.endsWith('/permission')).length,2);
});
test('stale document SHA is a conflict and never overwritten',async()=>{
 const calls=mockGithub('write',()=>reply({sha:'b'.repeat(40),content:Buffer.from(JSON.stringify(document)).toString('base64')}));
 assert.equal((await request('/api/presentation',{method:'PUT',body:JSON.stringify({document,sha})})).status,409);
 assert.equal(calls.filter(c=>c.options.method==='PUT').length,0);
});
test('validation refuses external images, unsafe settings, malformed drawings and oversized request',async()=>{
 for(const change of [n=>n.image={id:'x',name:'x',url:'https://evil.example/image.png'},n=>n.image={id:'x',name:'x',url:{}},n=>n.settings={rainOpacity:2},n=>n.drawings=[{tool:'script'}]]) {
  const doc=structuredClone(document);change(doc.notes[0]);assert.throws(()=>validateDocument(doc));
 }
 mockGithub('write');
 assert.equal((await request('/api/presentation',{method:'PUT',headers:{'Content-Length':'5000000'},body:'{}'})).status,413);
});
test('invalid image content rejected; valid PNG written under generated UUID',async()=>{
 const calls=mockGithub('write',(url,options)=>{
  assert.match(url,/\/contents\/viewer\/event-images\/[a-f0-9-]{36}\.png$/);
  assert.equal(options.method,'PUT');return reply({content:{sha},commit:{sha}});
 });
 assert.equal((await request('/api/event-images',{method:'POST',headers:{'Content-Type':'image/png'},body:'<svg/>'})).status,415);
 const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 const response=await request('/api/event-images',{method:'POST',headers:{'Content-Type':'image/png'},body:bytes});
 assert.equal(response.status,201);assert.match((await response.json()).url,/^event-images\/[a-f0-9-]{36}\.png$/);
 assert.equal(calls.filter(c=>c.options.method==='PUT').length,1);
});
test('OAuth sets secure state cookie and PKCE; invalid callbacks cannot exchange token',async()=>{
 const login=await request('/auth/login',{},null);assert.equal(login.status,302);
 const target=new URL(login.headers.get('Location'));
 assert.equal(target.origin,'https://github.com');assert.equal(target.searchParams.get('code_challenge_method'),'S256');
 assert.equal(target.searchParams.get('redirect_uri'),origin+'/auth/callback');
 assert.match(login.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax/);
 globalThis.fetch=()=>{throw new Error('should not call');};
 assert.equal((await request('/auth/callback?state=wrong&code=x',{},null)).status,400);
});
test('OAuth callback exchanges code and gives encrypted session without exposing token',async()=>{
 const pending=await seal({state:'state',verifier:'verifier',exp:Math.floor(Date.now()/1000)+600},env,'oauth');
 const calls=mockGithub('write');
 const mock=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  if(String(url)==='https://github.com/login/oauth/access_token') {
   const body=JSON.parse(options.body);assert.equal(body.code_verifier,'verifier');assert.equal(body.code,'code');
   return reply({access_token:'token-not-for-browser',expires_in:3600});
  }
  return mock(url,options);
 };
 const response=await worker.fetch(new Request(origin+'/auth/callback?state=state&code=code',{headers:{Cookie:'__Host-sr-oauth='+pending}}),env);
 assert.equal(response.status,302);assert.equal(response.headers.get('Location'),'/admin/');
 assert.ok(!response.headers.get('Set-Cookie').includes('token-not-for-browser'));
 assert.equal(calls.length,2);
});
test('admin config overrides public config and proxy does not forward credentials',async()=>{
 const config=await request('/admin/config.js');assert.match(await config.text(),/"admin":true/);
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://owner.github.io/repo/index.html');assert.equal(options.headers,undefined);
  return new Response('page',{headers:{'Content-Type':'text/html'}});
 };
 const response=await request('/admin/');assert.equal(await response.text(),'page');
 assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('HEAD serves static metadata without response body or login side effects',async()=>{
 globalThis.fetch=async()=>new Response('page',{headers:{'Content-Type':'text/html'}});
 const response=await request('/admin/',{method:'HEAD'});assert.equal(response.status,200);assert.equal(await response.text(),'');
 assert.equal((await request('/auth/login',{method:'HEAD'})).status,405);
});
test('publishing checks all images in one repository tree, accepting migrated image paths',async()=>{
 const id='12345678-1234-1234-1234-123456789abc';
 const doc=structuredClone(document);doc.notes[0].image={id,name:'Photo',url:`event-images/${id}.webp`};
 const calls=mockGithub('write',(url,options)=>{
  if(url.includes('/git/trees/')) return reply({tree:[{type:'blob',path:`data/event-images/${id}.webp`}],truncated:false});
  if(options.method==='PUT')return reply({content:{sha},commit:{sha}});
  return reply({sha,content:Buffer.from(JSON.stringify(document)).toString('base64')});
 });
 assert.equal((await request('/api/presentation',{method:'PUT',body:JSON.stringify({document:doc,sha})})).status,200);
 assert.equal(calls.filter(c=>c.url.includes('/git/trees/')).length,1);
});
test('static proxy uses manual redirects and rejects them without following',async()=>{
 let calls=0;
 globalThis.fetch=async(url,options)=>{
  calls++;assert.equal(options.redirect,'manual');
  return new Response(null,{status:302,headers:{Location:'https://elsewhere.example/'}});
 };
 const response=await request('/admin/boot.js');assert.equal(response.status,502);
 assert.equal(calls,1);assert.match((await response.json()).error,/SITE_URL/);
});
