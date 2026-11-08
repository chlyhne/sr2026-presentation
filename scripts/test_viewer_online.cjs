// Run local server on 18097 and the Pages artifact on 18098. All online writes are mocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
const publicBase=process.env.SR_PUBLIC_URL||'http://127.0.0.1:18098/';
const localBase=process.env.SR_LOCAL_URL||'http://127.0.0.1:18097/';
const origin=new URL(publicBase).origin;
const data=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../viewer/data.js'),'utf8').replace(/^window.DATA=/,'').replace(/;\s*$/,''));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const imageID='11111111-1111-4111-8111-111111111111',importID='22222222-2222-4222-8222-222222222222';
const fixture={version:1,notes:[{time:data.start+3600,text:'Udgivet event',view:[230,250,620,760],settings:{wind:false,rain:false,boats:[],boatNames:[]},image:{id:imageID,url:`event-images/${imageID}.png`,name:'Testbillede',width:1,height:1,type:'image/png'}}],speedPins:[{id:'test-pin',boatId:data.boats[0].id,time:data.boats[0].points[0][2]}]};
const copy=x=>JSON.parse(JSON.stringify(x));
async function ready(page){await page.waitForFunction(()=>typeof notes!=='undefined'&&document.querySelector('#onlineStatus'));}
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
  await publicPage.route('**/presentation.json',route=>route.fulfill({json:fixture}));
  await publicPage.goto(publicBase);await ready(publicPage);
  assert.equal(await publicPage.locator('#eventText').textContent(),'Udgivet event');
  assert.equal(await publicPage.evaluate(()=>notes.length),1);
  assert.equal(await publicPage.evaluate(()=>speedPins.length),1);
  assert.equal(await publicPage.locator('#endPresentation').isVisible(),false);
  await publicPage.keyboard.press('Escape');
  assert.equal(await publicPage.locator('body').evaluate(e=>e.classList.contains('presenting')),true,'Escape must not unlock public editing');
  await publicPage.locator('#eventText').click();
  assert.equal(await publicPage.locator('#eventTextEditor').isVisible(),false);
  assert.equal(await publicPage.evaluate(()=>persistNotes([{time:1,text:'Forbidden'}])),false);
  assert.equal(await publicPage.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes'))[0].text),'Lokalt gammelt indhold');
  await publicPage.close();

  const writer=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true});
  writer.on('pageerror',e=>errors.push(e.message));
  let serverDocument=copy(fixture),sha='a'.repeat(40),conflict=false,canEdit=true,published=[],uploads=0;
  await photoRoutes(writer);
  await writer.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:`window.SR_CONFIG=${JSON.stringify({admin:true,apiBase:origin})};`}));
  await writer.route('**/api/session',r=>r.fulfill({json:{authenticated:true,canEdit,login:'writer'}}));
  await writer.route('**/api/presentation',async r=>{
   if(r.request().method()==='GET')return r.fulfill({json:{document:serverDocument,sha}});
   const payload=r.request().postDataJSON();published.push(payload);
   if(conflict)return r.fulfill({status:409,json:{error:'Conflict'}});
   assert.equal(payload.sha,sha,'Publish must include the loaded revision');
   serverDocument=copy(payload.document);sha='b'.repeat(40);
   return r.fulfill({json:{sha}});
  });
  await writer.route('**/api/event-images',async r=>{
   uploads++;assert.equal(r.request().method(),'POST');
   assert.deepEqual(r.request().postDataBuffer(),png,'Imported picture bytes survive export/import');
   return r.fulfill({status:201,json:{id:importID,url:`event-images/${importID}.png`}});
  });
  await writer.goto(publicBase);await ready(writer);
  await writer.locator('.note-jump').first().click();
  await writer.locator('#eventText').click();await writer.locator('#eventTextEditor').fill('Min redigerede kladde');await writer.keyboard.press('Control+Enter');
  assert.equal(await writer.evaluate(()=>notes[0].text),'Min redigerede kladde');
  assert.equal(published.length,0,'Editing saves a draft, not a remote publish');
  await writer.reload();await ready(writer);
  assert.equal(await writer.evaluate(()=>notes[0].text),'Min redigerede kladde','Reload restores a draft of the same server revision');
  assert.match(await writer.locator('#onlineStatus').textContent(),/gendannet/);
  conflict=true;await writer.getByRole('button',{name:'Udgiv',exact:true}).click();
  await writer.waitForFunction(()=>document.querySelector('#onlineStatus').textContent.includes('En anden version'));
  assert.equal(await writer.evaluate(()=>notes[0].text),'Min redigerede kladde','Conflicts retain in-memory edits');
  assert.equal(await writer.evaluate(()=>JSON.parse(localStorage.getItem(SR_DRAFT_KEY)).document.notes[0].text),'Min redigerede kladde','Conflicts retain persisted drafts');
  conflict=false;await writer.getByRole('button',{name:'Udgiv',exact:true}).click();
  await writer.waitForFunction(()=>document.querySelector('#onlineStatus').textContent.includes('Gemt i GitHub'));
  assert.equal(serverDocument.notes[0].text,'Min redigerede kladde');
  assert.deepEqual(serverDocument.speedPins,fixture.speedPins);
  assert.equal(await writer.evaluate(()=>localStorage.getItem(SR_DRAFT_KEY)),null,'Successful publish clears only the draft');
  const bundle=await exported(writer);
  assert.equal(bundle.version,1);assert.deepEqual(bundle.speedPins,fixture.speedPins);
  assert.match(bundle.notes[0].image.dataUrl,/^data:image\/png;base64,/);
  bundle.notes[0].text='Importeret event';
  writer.once('dialog',d=>d.accept());
  const chooserPromise=writer.waitForEvent('filechooser');
  await writer.getByRole('button',{name:'Importér noter',exact:true}).click();
  await (await chooserPromise).setFiles({name:'presentation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});
  await writer.waitForFunction(()=>document.querySelector('#onlineStatus').textContent.includes('Importeret til kladden'));
  assert.equal(uploads,1);assert.equal(published.length,2,'Import does not publish automatically');
  assert.equal(await writer.evaluate(()=>notes[0].text),'Importeret event');
  assert.equal(await writer.evaluate(()=>notes[0].image.id),importID);
  assert.equal(await writer.evaluate(()=>notes[0].image.dataUrl),undefined);
  assert.deepEqual(await writer.evaluate(()=>speedPins),fixture.speedPins);
  // Authenticated read-only accounts still receive the viewer, never editing controls.
  await writer.evaluate(()=>localStorage.clear());canEdit=false;
  await writer.reload();await ready(writer);
  assert.equal(await writer.getByRole('button',{name:'Udgiv',exact:true}).count(),0);
  assert.equal(await writer.locator('#endPresentation').isVisible(),false);
  await writer.close();

  // Local mode retains the original browser storage and exports all portable content.
  const local=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true});
  local.on('pageerror',e=>errors.push(e.message));
  await photoRoutes(local);
  await local.addInitScript(f=>{
   localStorage.setItem('sr2026-notes',JSON.stringify(f.notes));localStorage.setItem('sr2026-speed-pins',JSON.stringify(f.speedPins));
   for(const key of ['sr2026-event-boats-initialized-v1','sr2026-event-boats-rosa-lux-v1','sr2026-event-boat-names-shown-v1'])localStorage.setItem(key,'1');
  },fixture);
  await local.goto(localBase);await ready(local);
  assert.equal(await local.evaluate(()=>SR_READONLY),false);
  const localBundle=await exported(local);
  assert.equal(localBundle.notes[0].text,fixture.notes[0].text);
  assert.deepEqual(localBundle.speedPins,fixture.speedPins);
  assert.match(localBundle.notes[0].image.dataUrl,/^data:image\/png;base64,/);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'public snapshot, readonly Escape, local storage isolation, writer edit, reload draft, revision publish, conflict retention, portable image/pin export/import, read-only login, legacy local export',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
