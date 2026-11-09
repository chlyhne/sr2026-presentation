const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/';
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true}),errors=[];
  // This test inspects SVG land fills and their PNG export, independently of GPU support.
  await page.addInitScript(()=>{window.SR_BACKGROUND_RENDERER='svg';});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  const source=await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#264b62';ctx.fillRect(0,0,1200,800);
   ctx.fillStyle='#bdc7cb';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(570,0);ctx.lineTo(370,560);ctx.lineTo(0,800);ctx.fill();
   ctx.strokeStyle='#ffdc42';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(700,680);ctx.lineTo(620,440);ctx.lineTo(800,200);ctx.stroke();
   ctx.fillStyle='white';ctx.font='48px sans-serif';ctx.fillText('Mercutio · et billede til eventet',70,720);
   const settings={...sceneSettings(),wind:false,rain:false,boats:[]};
   const notes=[{time:D.start+3600,text:'Den gemte eventtekst',point:xy([11,55.5]),view:[230,250,620,760],settings},
    {time:D.start+7200,text:'Et andet event',view:[230,250,620,760],settings}];
   localStorage.setItem('sr2026-notes',JSON.stringify(notes));return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.note-jump').length===2);
  await page.locator('.note-jump').first().click();
  const panel=await page.locator('#eventPanel').boundingBox(),map=await page.locator('#map').boundingBox();
  assert.ok(panel.x>=map.x+map.width-1,'Event panel sits to the right of the map');
  assert.equal(await page.locator('#eventText').textContent(),'Den gemte eventtekst');
  assert.equal(await page.locator('#annotations rect,#annotations tspan').count(),0,'No annotation text boxes remain on the map');
  assert.equal(await page.locator('#annotations circle').count(),1,'Geographic event marker remains');
  assert.ok(await page.locator('#land path').count()>0);assert.equal(await page.locator('#land path').first().getAttribute('fill'),'#bdc7cb');
  assert.equal(await page.locator('#coast path').first().getAttribute('stroke'),'#365766');
  await page.evaluate(()=>{
   const serialize=XMLSerializer.prototype.serializeToString;
   XMLSerializer.prototype.serializeToString=function(node){const xml=serialize.call(this,node);window.panelTestSVG=xml;return xml;};
  });
  const mapDownload=page.waitForEvent('download');await page.evaluate(()=>captureMap());
  await(await mapDownload).saveAs('/tmp/sr2026-land-'+type.name()+'-map.png');
  const mapExport=await page.evaluate(()=>{
   const doc=new DOMParser().parseFromString(panelTestSVG,'image/svg+xml');
   return {land:doc.querySelector('#land path')?.getAttribute('fill'),panel:!!doc.querySelector('#eventPanel'),textBoxes:doc.querySelectorAll('#annotations rect,#annotations tspan').length};
  });assert.deepEqual(mapExport,{land:'#bdc7cb',panel:false,textBoxes:0});
  const original=await page.evaluate(()=>localStorage.getItem('sr2026-notes'));
  await page.evaluate(()=>{selectedTime=D.start+10800;render();});
  const file={name:'mercutio-test.png',mimeType:'image/png',buffer:Buffer.from(source,'base64')};
  await page.locator('#noteImage').setInputFiles(file);
  await page.waitForFunction(()=>pendingEventImage&&!eventImageLoading);
  await page.waitForFunction(()=>$('eventImage').complete&&$('eventImage').naturalWidth>0&&!$('eventImageFigure').hidden);
  assert.equal(await page.locator('#eventCounter').textContent(),'Nyt event');
  assert.equal(await page.evaluate(()=>localStorage.getItem('sr2026-notes')),original,'Uploading an image does not create a note until saved');
  await page.locator('#save').click();
  let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes')));
  assert.equal(stored.length,3);assert.equal(stored[2].text,'','An image-only event is supported');
  const photo=stored[2].image;
  assert.ok(photo.url.startsWith('/event-images/'));assert.equal(photo.dataUrl,undefined);
  const imageFile=path.resolve(__dirname,'../data/event-images',photo.url.split('/').at(-1));
  assert.ok(fs.statSync(imageFile).size>0,'Image is saved on the server filesystem');
  const another=await browser.newContext(),imageResponse=await another.request.get(new URL(photo.url,base).href);
  assert.equal(imageResponse.status(),200);assert.ok(imageResponse.headers()['content-type'].startsWith('image/'));
  await another.close();
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.note-jump').length===3);
  await page.locator('.note-jump').nth(2).click();
  await page.waitForFunction(()=>$('mapEventImageContent').naturalWidth>0&&!$('mapEventImage').hidden);
  assert.equal(await page.locator('#eventImageFigure').isVisible(),false);
  await page.locator('#mapEventImage').click();
  await page.waitForFunction(()=>$('eventImage').naturalWidth>0&&!$('eventImageFigure').hidden);
  assert.equal(await page.locator('#eventImageCaption').textContent(),file.name);
  await page.locator('.note-edit').nth(2).click();await page.locator('#note').fill('Foto fra Storebælt <b>almindelig tekst</b>');
  assert.equal(await page.locator('#eventText').textContent(),'Foto fra Storebælt <b>almindelig tekst</b>');
  await page.locator('#removeNoteImage').click();assert.equal(await page.locator('#eventImageFigure').isVisible(),false);
  await page.locator('#cancelEdit').click();
  await page.waitForFunction(()=>$('eventImage').naturalWidth>0&&!$('eventImageFigure').hidden);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes'))),stored);
  await page.locator('.note-edit').nth(2).click();await page.locator('#note').fill('Foto fra Storebælt');await page.locator('#save').click();
  stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes')));
  assert.equal(stored[2].text,'Foto fra Storebælt');assert.deepEqual(stored[2].image,photo);
  await page.locator('#startPresentation').click();
  assert.equal(await page.locator('aside').isVisible(),false);assert.equal(await page.locator('#eventPanel').isVisible(),true);
  await page.waitForFunction(()=>$('mapEventImageContent').naturalWidth>0&&!$('mapEventImage').hidden);
  assert.equal(await page.locator('#eventImageFigure').isVisible(),false);
  await page.locator('#previousEvent').click();assert.equal(await page.locator('#eventImageFigure').isVisible(),false);
  await page.locator('#nextEvent').click();
  if(await page.evaluate(()=>!!eventPlaybackTarget))await page.locator('#nextEvent').click();
  await page.waitForFunction(()=>$('mapEventImageContent').naturalWidth>0&&!$('mapEventImage').hidden);
  assert.equal(await page.locator('#eventImageFigure').isVisible(),false);
  await page.screenshot({path:'/tmp/sr2026-event-panel-'+type.name()+'-desktop.png'});
  await page.setViewportSize({width:390,height:740});await page.waitForTimeout(150);
  const mobile=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,
   map:$('map').getBoundingClientRect().height,bottom:$('presentationFooter').getBoundingClientRect().bottom}));
  assert.ok(mobile.scroll<=mobile.width);assert.ok(mobile.map>=200);assert.ok(mobile.bottom<=742);
  await page.screenshot({path:'/tmp/sr2026-event-panel-'+type.name()+'-mobile.png'});
  await page.setViewportSize({width:1500,height:1000});await page.waitForTimeout(100);
  const dl=page.waitForEvent('download');await page.evaluate(()=>exportEventNotes());
  const bundle=JSON.parse(fs.readFileSync(await(await dl).path(),'utf8'));
  assert.equal(bundle.version,1);assert.ok(Array.isArray(bundle.speedPins));
  const exported=bundle.notes;
  assert.ok(exported[2].image.dataUrl.startsWith('data:image/webp;base64,'));
  assert.deepEqual(exported.slice(0,2),stored.slice(0,2));
  const response=await page.request.get(new URL(photo.url,base).href);
  assert.deepEqual(Buffer.from(exported[2].image.dataUrl.split(',')[1],'base64'),await response.body(),'Export embeds exact server image bytes');
  assert.equal((await page.request.post(new URL('/api/event-images',base).href,{headers:{'Content-Type':'image/png'},data:Buffer.from('bad image')})).status(),415);
  assert.equal((await page.request.post(new URL('/api/event-images',base).href,{headers:{Origin:'https://example.invalid','Content-Type':'image/png'},data:file.buffer})).status(),403);
  assert.equal((await page.request.post(new URL('/api/event-images',base).href,{data:Buffer.alloc(0)})).status(),413);
  await page.locator('#endPresentation').click();await page.locator('.note-edit').nth(2).click();
  await page.route('**/api/event-images',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Test: serveren kunne ikke gemme billedet.'})}));
  await page.locator('#noteImage').setInputFiles({...file,name:'replacement.png'});
  await page.waitForFunction(()=>!eventImageLoading&&$('annotationStatus').textContent.includes('Test:'));
  assert.deepEqual(await page.evaluate(()=>noteDraft.image),photo,'Failed upload keeps existing attachment');
  await page.locator('#cancelEdit').click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes'))),stored);
  await page.locator('.note-edit').nth(2).click();await page.locator('#note').fill('Denne tekst må ikke gemmes ved lagerfejl');
  await page.evaluate(()=>{window.originalNoteStorage=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='sr2026-notes')throw new Error('quota test');return originalNoteStorage.call(this,key,value);};});
  await page.locator('#save').click();assert.match(await page.locator('#annotationStatus').textContent(),/kan ikke gemme/);
  assert.equal(await page.locator('#cancelEdit').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes'))),stored);
  await page.evaluate(()=>{Storage.prototype.setItem=originalNoteStorage;});await page.locator('#cancelEdit').click();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'right panel, no map text boxes, light grey land, image-only event, server upload/file/URL, other browser access, reload, edit/cancel, presentation navigation, mobile, image export, failed upload',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
