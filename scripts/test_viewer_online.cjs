// Run against the local tracker. Hosted roles and online writes are mocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
const localBase=new URL('events/sjaelland-rundt-2026/',process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/').href;
const publicBase=process.env.SR_PUBLIC_URL||localBase;
const origin=new URL(publicBase).origin;
const event=require('../viewer/events/catalog.json').events.find(e=>e.id==='sjaelland-rundt-2026');
const pin=require('../presentation/presentation.json').speedPins[0];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const imageID='11111111-1111-4111-8111-111111111111';
const fixture={version:1,notes:[{time:event.start+3600,text:'Udgivet event',view:[230,250,620,760],settings:{wind:false,rain:false,boats:[],boatNames:[]},image:{id:imageID,url:`event-images/${imageID}.png`,name:'Testbillede',width:1,height:1,type:'image/png'}}],speedPins:[pin]};
const copy=x=>JSON.parse(JSON.stringify(x));
async function ready(page){
 await page.waitForFunction(()=>!document.querySelector('main').inert||!document.querySelector('#viewerLoadingError').hidden);
 assert.equal(await page.locator('#viewerLoadingError').isVisible(),false,await page.locator('#viewerLoadingError').textContent());
 if(await page.locator('#mapEventImage').isVisible())await page.keyboard.press('Escape');
}
async function openEvents(page){
 if(await page.locator('#eventPanelToggle').getAttribute('aria-expanded')==='false')await page.locator('#eventPanelToggle').click();
 const options=page.locator('#presentationOptions');
 if(await options.isVisible()&&await options.getAttribute('open')===null)await options.locator('summary').click();
}
async function exported(page){
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#export').click();
 const download=await downloadPromise;
 return JSON.parse(fs.readFileSync(await download.path(),'utf8'));
}
async function photoRoutes(page){await page.route('**/event-images/*.png',route=>route.fulfill({status:200,contentType:'image/png',body:png}));}
async function check(type){
 const browser=await type.launch({headless:true}),errors=[];
 try{
  // Public snapshot is authoritative, even with stale locally edited data.
  const publicPage=await browser.newPage({viewport:{width:1500,height:1000}});
  publicPage.on('pageerror',e=>errors.push(e.message));
  await publicPage.addInitScript(()=>localStorage.setItem('sr2026-notes',JSON.stringify([{time:1781164800,text:'Lokalt gammelt indhold'}])));
  await photoRoutes(publicPage);
  await publicPage.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:`window.SR_CONFIG=${JSON.stringify({admin:false,apiBase:origin})};`}));
  await publicPage.route('**/presentation.json',route=>route.fulfill({json:fixture}));
  await publicPage.goto(publicBase);await ready(publicPage);
  await openEvents(publicPage);
  assert.equal(await publicPage.locator('#eventText').textContent(),'Udgivet event');
  assert.equal(await publicPage.evaluate(()=>notes.length),1);
  assert.equal(await publicPage.evaluate(()=>speedPins.length),1);
  assert.equal(await publicPage.getByRole('link',{name:'Redigér events'}).getAttribute('href'),origin+'/admin/events/sjaelland-rundt-2026/');
  await publicPage.locator('#eventText').click();
  assert.equal(await publicPage.locator('#eventTextEditor').isVisible(),false);
  assert.equal(await publicPage.evaluate(()=>persistNotes([{time:1,text:'Forbidden'}])),false);
  assert.equal(await publicPage.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes'))[0].text),'Lokalt gammelt indhold');
  await publicPage.close();

  const writer=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true});
  writer.on('pageerror',e=>errors.push(e.message));
  let serverDocument=copy(fixture),sha='a'.repeat(40),conflict=false,canEdit=false,published=[],uploads=0,loginRequests=0;
  await photoRoutes(writer);
  await writer.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:`window.SR_CONFIG=${JSON.stringify({admin:true,apiBase:origin})};`}));
  await writer.route('**/auth/login?*',r=>{loginRequests++;canEdit=true;return r.fulfill({status:302,headers:{Location:publicBase}});});
  await writer.route('**/api/presentation?*',async r=>{
   if(r.request().method()==='GET')return r.fulfill({json:{document:serverDocument,sha}});
   if(!canEdit)return r.fulfill({status:401,json:{error:'Sign in'}});
   const payload=r.request().postDataJSON();published.push(payload);
   if(conflict)return r.fulfill({status:409,json:{error:'Conflict'}});
   assert.equal(payload.sha,sha,'Publish must include the loaded revision');
   serverDocument=copy(payload.document);sha='b'.repeat(40);
   return r.fulfill({json:{sha}});
  });
  await writer.route('**/api/event-images?*',async r=>{
   uploads++;assert.equal(r.request().method(),'POST');
   assert.deepEqual(r.request().postDataBuffer(),png,'Imported picture bytes survive export/import');
   const id=new URL(r.request().url()).searchParams.get('id');assert.ok(id);
   return r.fulfill({status:201,json:{id,url:`event-images/${id}.png`}});
  });
  await writer.goto(publicBase);await ready(writer);await openEvents(writer);
  await writer.locator('#eventText').click();await writer.locator('#eventTextEditor').fill('Min redigerede kladde');await writer.keyboard.press('Control+Enter');
  assert.equal(await writer.evaluate(()=>notes[0].text),'Min redigerede kladde');
  assert.equal(published.length,0,'Editing saves a draft, not a remote publish');
  assert.equal(loginRequests,0);
  const afterLogin=writer.waitForNavigation();
  await writer.getByRole('button',{name:'Udgiv',exact:true}).click();
  await afterLogin;await ready(writer);await openEvents(writer);
  assert.equal(loginRequests,1);
  assert.equal(published.length,0,'Returning from login does not silently publish');
  assert.equal(await writer.evaluate(()=>notes[0].text),'Min redigerede kladde','Reload restores a draft of the same server revision');
  assert.match(await writer.locator('#onlineStatus').textContent(),/gendannet/);
  conflict=true;await writer.getByRole('button',{name:'Udgiv',exact:true}).click();
  await writer.waitForFunction(()=>document.querySelector('#onlineStatus').textContent.includes('En anden version'));
  assert.equal(await writer.evaluate(()=>notes[0].text),'Min redigerede kladde','Conflicts retain in-memory edits');
  assert.equal(await writer.evaluate(()=>JSON.parse(eventStorage.getItem(SR_DRAFT_KEY)).document.notes[0].text),'Min redigerede kladde','Conflicts retain persisted drafts');
  conflict=false;await writer.getByRole('button',{name:'Udgiv',exact:true}).click();
  await writer.waitForFunction(()=>document.querySelector('#onlineStatus').textContent.includes('Gemt i GitHub'));
  assert.equal(serverDocument.notes[0].text,'Min redigerede kladde');
  assert.deepEqual(serverDocument.speedPins,fixture.speedPins);
  assert.equal(await writer.evaluate(()=>eventStorage.getItem(SR_DRAFT_KEY)),null,'Successful publish clears only the draft');
  const bundle=await exported(writer);
  assert.equal(bundle.version,1);assert.deepEqual(bundle.speedPins,fixture.speedPins);
  assert.match(bundle.notes[0].image.dataUrl,/^data:image\/png;base64,/);
  const beforeImport=await writer.evaluate(()=>({notes,speedPins,draft:eventStorage.getItem(SR_DRAFT_KEY)}));
  for(const invalid of [bundle.notes,{notes:bundle.notes,speedPins:bundle.speedPins},{version:1,notes:bundle.notes},{...bundle,version:2},{...bundle,version:'1'},{...bundle,notes:{}},{...bundle,speedPins:null},null]){
   const chooser=writer.waitForEvent('filechooser');
   await writer.getByRole('button',{name:'Importér noter',exact:true}).click();
   await (await chooser).setFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
   await writer.waitForFunction(()=>document.querySelector('#onlineStatus').textContent==='Ugyldige præsentationsdata: version 1, notes og speedPins er påkrævet.'&&document.querySelector('input[type="file"][accept=".json,application/json"]').value==='');
   assert.deepEqual(await writer.evaluate(()=>({notes,speedPins,draft:eventStorage.getItem(SR_DRAFT_KEY)})),beforeImport,'Invalid documents must not change notes, pins or the draft');
   assert.equal(uploads,0,'Invalid documents must be rejected before uploading embedded images');
  }
  bundle.notes[0].text='Importeret event';
  writer.once('dialog',d=>d.accept());
  const chooserPromise=writer.waitForEvent('filechooser');
  await writer.getByRole('button',{name:'Importér noter',exact:true}).click();
  await (await chooserPromise).setFiles({name:'presentation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});
  await writer.waitForFunction(()=>document.querySelector('#onlineStatus').textContent.includes('Importeret til kladden'));
  assert.equal(uploads,0);assert.equal(published.length,2,'Import does not upload or publish automatically');
  assert.equal(await writer.evaluate(()=>notes[0].text),'Importeret event');
  assert.equal(await writer.evaluate(()=>notes[0].image.draft),true);
  assert.equal(await writer.evaluate(()=>notes[0].image.dataUrl),undefined);
  assert.deepEqual(await writer.evaluate(()=>speedPins),fixture.speedPins);
  await writer.reload();await ready(writer);await openEvents(writer);
  assert.match((await exported(writer)).notes[0].image.dataUrl,/^data:image\/png;base64,/);
  await writer.getByRole('button',{name:'Udgiv',exact:true}).click();
  await writer.waitForFunction(()=>document.querySelector('#onlineStatus').textContent.includes('Gemt i GitHub'));
  assert.equal(uploads,1);assert.equal(published.length,3);
  assert.equal(serverDocument.notes[0].image.draft,undefined);
  await writer.locator('#eventText').click();await writer.locator('#eventTextEditor').fill('Kladde før serverændring');await writer.keyboard.press('Control+Enter');
  // A newer server version must preserve the older local draft for recovery.
  const staleDocument=await writer.evaluate(()=>({version:1,notes:JSON.parse(JSON.stringify(notes)),speedPins:JSON.parse(JSON.stringify(speedPins))}));
  sha='c'.repeat(40);serverDocument.notes[0].text='Ny serverversion';
  await writer.reload();await ready(writer);await openEvents(writer);
  assert.equal(await writer.evaluate(()=>notes[0].text),'Ny serverversion');
  const earlierDraft=()=>writer.evaluate(()=>JSON.parse(eventStorage.getItem(SR_DRAFT_KEY+':previous')).document);
  assert.deepEqual(await earlierDraft(),staleDocument,'Mismatched revision preserves the entire previous draft');
  await writer.locator('#eventText').click();await writer.locator('#eventTextEditor').fill('Ny kladde oven på serverversionen');await writer.keyboard.press('Control+Enter');
  assert.deepEqual(await earlierDraft(),staleDocument,'Further edits must not overwrite the previous draft');
  await writer.reload();await ready(writer);await openEvents(writer);
  assert.equal(await writer.evaluate(()=>notes[0].text),'Ny kladde oven på serverversionen');
  assert.deepEqual(await earlierDraft(),staleDocument,'Recovery copy survives another reload');
  const previousDownload=writer.waitForEvent('download');
  await writer.getByRole('button',{name:'Hent tidligere kladde',exact:true}).click();
  const recovered=JSON.parse(fs.readFileSync(await (await previousDownload).path(),'utf8'));
  assert.deepEqual(recovered,staleDocument,'Recovery download contains the original notes, image references and pins');
  await writer.close();

  // Local mode retains the original browser storage and exports all portable content.
  const local=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true});
  local.on('pageerror',e=>errors.push(e.message));
  await photoRoutes(local);
  await local.addInitScript(f=>{
   localStorage.setItem('sr2026-notes',JSON.stringify(f.notes));localStorage.setItem('sr2026-speed-pins',JSON.stringify(f.speedPins));
  },fixture);
  await local.goto(localBase);await ready(local);await openEvents(local);
  assert.equal(await local.evaluate(()=>SR_READONLY),false);
  const localBundle=await exported(local);
  assert.equal(localBundle.notes[0].text,fixture.notes[0].text);
  assert.deepEqual(localBundle.speedPins,fixture.speedPins);
  assert.match(localBundle.notes[0].image.dataUrl,/^data:image\/png;base64,/);
  local.once('dialog',d=>d.accept());
  const emptyChooser=local.waitForEvent('filechooser');
  await local.getByRole('button',{name:'Importér noter',exact:true}).click();
  await (await emptyChooser).setFiles({name:'empty.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,notes:[],speedPins:[]}))});
  await local.waitForFunction(()=>document.querySelector('#onlineStatus').textContent==='Noter og fart-pins er importeret.');
  assert.deepEqual(await local.evaluate(()=>({notes,speedPins})),{notes:[],speedPins:[]},'A complete empty version 1 document is valid');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'anonymous editing, publish-triggered sign-in, draft restoration, conflicts, deferred image uploads and local import/export',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
