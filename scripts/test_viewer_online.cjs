// Exercise the hosted event sources in local Firefox with the API and OAuth mocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
const base=new URL('events/sjaelland-rundt-2026/',process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
const catalog=require('../viewer/events/catalog.json');
const event=catalog.events.find(item=>item.id==='sjaelland-rundt-2026');
const imageId='11111111-1111-4111-8111-111111111111';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const publicDocument={version:1,notes:[{time:event.start+3600,text:'Udgivet event',view:[230,250,620,760],
 image:{id:imageId,url:'event-images/'+imageId+'.png',name:'Testbillede'}}],speedPins:[]};
const localDocument={version:1,notes:[{time:event.start+7200,text:'Lokalt event'}],speedPins:[]};

async function test(){
 const browser=await firefox.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1500,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  let navigations=0,logins=0,account=null,publicRevision='a',privateRevision=null;
  let published=structuredClone(publicDocument),privateDocument={version:1,notes:[],speedPins:[]};
  await page.addInitScript(document=>{
   localStorage.setItem('sr-event:sjaelland-rundt-2026:sr2026-notes',JSON.stringify(document.notes));
  },localDocument);
  await context.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={eventService:true};'}));
  event.publicSets=[{id:'opsamling',title:'Opsamling',presentationFile:'presentation/opsamling.json'}];
  await context.route('**/events/catalog.json',route=>route.fulfill({json:catalog}));
  await context.route('**/auth/login?*',route=>{
   logins++;account={id:7,canPublish:false,privateAvailable:true};
   const attempt=new URL(route.request().url()).searchParams.get('popup');
   return route.fulfill({contentType:'text/html',headers:{'Cross-Origin-Opener-Policy':'same-origin'},
    body:`<script>const channel=new BroadcastChannel('sr-event-login:${attempt}');channel.postMessage('ok');channel.close();window.close()</script>`});
  });
  await context.route('**/api/event-session',route=>route.fulfill({json:{account}}));
  await context.route('**/api/logout',route=>{account=null;return route.fulfill({json:{}});});
  await context.route('**/api/presentation?*',route=>{
   if(route.request().method()==='GET'){
    const set=new URL(route.request().url()).searchParams.get('set');
    const document=set==='opsamling'?{version:1,notes:[{time:publicDocument.notes[0].time,text:'Fra opsamling'}],speedPins:[]}:published;
    return route.fulfill({json:{document,sha:publicRevision,account}});
   }
   assert.equal(account?.canPublish,true);
   const body=route.request().postDataJSON();writes.push('public');
   if(body.sha!==publicRevision)return route.fulfill({status:409,json:{error:'Conflict'}});
   published=body.document;publicRevision+='x';
   return route.fulfill({json:{sha:publicRevision}});
  });
  await context.route('**/api/private-events?*',route=>{
   assert.equal(new URL(route.request().url()).searchParams.get('owner'),String(account?.id));
   if(route.request().method()==='GET')return route.fulfill({json:{document:privateDocument,revision:privateRevision}});
   const body=route.request().postDataJSON();writes.push('private');
   assert.equal(body.revision,privateRevision);
   privateDocument=body.document;privateRevision=(privateRevision||'')+'p';
   return route.fulfill({json:{revision:privateRevision}});
  });
  await context.route('**/api/private-event-images?*',route=>{
   assert.deepEqual(route.request().postDataBuffer(),png);
   const query=new URL(route.request().url()).searchParams;
   assert.equal(query.get('owner'),'7');
   assert.equal(query.get('id'),imageId);
   writes.push('private-image');
   return route.fulfill({json:{id:imageId,url:'private-event-images/'+imageId+'.png'}});
  });
  await context.route('**/api/*event-images/*.png*',route=>route.fulfill({status:200,contentType:'image/png',body:png}));
  await page.goto(base.href);
  await page.waitForFunction(()=>!document.querySelector('main').inert||!document.querySelector('#viewerLoadingError').hidden);
  assert.equal(await page.locator('#viewerLoadingError').isVisible(),false,await page.locator('#viewerLoadingError').textContent());
  await page.waitForFunction(()=>eventSetSource==='public:default');
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  if(await page.locator('#mapEventImage').isVisible())await page.keyboard.press('Escape');
  if(await page.locator('#eventPanelToggle').getAttribute('aria-expanded')==='false')await page.locator('#eventPanelToggle').click();
  const selector=page.locator('#eventSetSelect');
  const mapState=()=>page.evaluate(()=>({time:currentTime(),view:[...view],boats:sceneSettings().boats}));
  const edit=async text=>{
   await page.locator('#newEvent').click();
   await page.locator('#eventTextEditor').fill(text);
   await page.keyboard.press('Control+Enter');
  };
  const choose=async source=>{
   await selector.selectOption(source);
   await page.waitForFunction(value=>document.querySelector('#eventSetSelect').value===value&&!document.querySelector('#eventSetSelect').disabled,source);
  };
  assert.equal(await page.locator('#loginLink').count(),0);
  const initial=await mapState();
  await edit('Min private rettelse');
  assert.equal(await page.evaluate(()=>notes.length),1,'New event here edits the chosen event at its timestamp');
  assert.deepEqual(await mapState(),initial);
  assert.equal(logins,0);
  await page.locator('#savePrivateEvents').click();
  await page.waitForFunction(()=>document.querySelector('#onlineStatus').textContent==='Privat kopi er gemt.');
  assert.equal(logins,1);
  assert.deepEqual(writes,['private-image','private']);
  assert.equal(published.notes[0].text,'Udgivet event');
  assert.equal(privateDocument.notes[0].text,'Min private rettelse');
  assert.equal(privateDocument.notes[0].image.url,'private-event-images/'+imageId+'.png');
  await choose('public:opsamling');
  assert.equal(await page.evaluate(()=>notes[0].text),'Fra opsamling');
  assert.deepEqual(await mapState(),initial);
  await choose('local');
  assert.equal(await page.evaluate(()=>notes[0].text),'Lokalt event');
  assert.deepEqual(await mapState(),initial);
  await edit('Nyt lokalt event');
  await page.locator('#save').click();
  assert.equal(await page.evaluate(()=>notes.length),2);
  assert.equal(await page.evaluate(()=>readLocalEventSet().notes[0].text),'Nyt lokalt event');
  await choose('private');
  assert.equal(await page.evaluate(()=>notes[0].text),'Min private rettelse');
  assert.equal(await page.locator('#publishPublicEvents').isVisible(),false);
  assert.deepEqual(await mapState(),initial);
  await page.locator('#eventSetLogout').click();
  await page.waitForFunction(()=>eventSetSource==='local');
  assert.deepEqual(await mapState(),initial);
  assert.equal(await page.evaluate(()=>notes.some(note=>note.private)),false);
  account={id:7,canPublish:true,privateAvailable:true};
  await choose('public:default');
  assert.equal(await page.evaluate(()=>notes[0].text),'Min private rettelse','public draft is restored independently');
  await edit('Offentlig kladde ved konflikt');
  published.notes[0].text='Ny offentlig serverversion';publicRevision='new';
  await page.locator('#publishPublicEvents').click();
  await page.waitForFunction(()=>document.querySelector('#onlineStatus').textContent.includes('Serverens eventsæt er ændret'));
  assert.equal(await page.evaluate(()=>notes[0].text),'Offentlig kladde ved konflikt');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#loadServerEventSet').click();
  await page.waitForFunction(()=>notes[0].text==='Ny offentlig serverversion');
  assert.equal(await page.evaluate(()=>JSON.parse(eventStorage.getItem(eventSetDraftKey(eventSetSource)+':previous')).document.notes[0].text),'Offentlig kladde ved konflikt');
  await edit('Udgivet uden reload');
  await page.locator('#publishPublicEvents').click();
  await page.waitForFunction(()=>document.querySelector('#onlineStatus').textContent==='Det offentlige eventsæt er gemt.');
  assert.equal(published.notes[0].text,'Udgivet uden reload');
  assert.deepEqual(await mapState(),initial);
  assert.equal(navigations,0);
  await page.locator('#presentationOptions summary').click();
  const download=page.waitForEvent('download');
  await page.locator('#export').click();
  const exported=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
  assert.match(exported.notes[0].image.dataUrl,/^data:image\/png;base64,/);
  assert.deepEqual(errors,[]);
  console.log('Firefox: event sources, login popup, permissions, private image, conflict, export and no tracker navigation.');
 }finally{await browser.close();}
}
test().catch(error=>{console.error(error);process.exit(1);});
