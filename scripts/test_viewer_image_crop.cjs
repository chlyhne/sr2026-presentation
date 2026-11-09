const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  const source=Buffer.from(await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#ee2222';ctx.fillRect(0,0,1200,800);
   ctx.fillStyle='#2244ee';ctx.fillRect(300,200,600,400);
   return canvas.toDataURL('image/png').split(',')[1];
  }),'base64');
  const originalID='11111111-1111-4111-8111-111111111111';
  const images=new Map([[originalID+'.png',source]]),uploaded=[];
  let failUpload=false,holdUpload=false,releaseUpload=null;
  await page.route('**/event-images/*',route=>{
   const name=new URL(route.request().url()).pathname.split('/').at(-1),body=images.get(name);
   return route.fulfill({status:body?200:404,contentType:name.endsWith('.png')?'image/png':'image/webp',body:body||Buffer.alloc(0)});
  });
  await page.route('**/api/event-images',async route=>{
   if(failUpload)return route.fulfill({status:500,json:{error:'Test: beskæringen kunne ikke uploades.'}});
   const bytes=route.request().postDataBuffer();
   assert.equal(route.request().headers()['content-type'],'image/webp');
   const id=String(uploaded.length+2).padStart(8,'0')+'-2222-4222-8222-222222222222';
   uploaded.push({id,bytes});images.set(id+'.webp',bytes);
   if(holdUpload)await new Promise(resolve=>{releaseUpload=resolve;});
   return route.fulfill({status:201,json:{id,url:'event-images/'+id+'.webp'}});
  });
  const fixtures=await page.evaluate(id=>{
   const image={id,url:'event-images/'+id+'.png',name:'Originalfoto.png',width:1200,height:800,type:'image/png'};
   const settings={...sceneSettings(),wind:false,rain:false,boats:[]};
   return [0,1].map(i=>({time:D.start+(i+1)*3600,text:'Foto '+i,view:[230,250,620,760],settings,image,
    point:[600,400],drawings:[{tool:'line',colour:'#e02020',width:4,points:[[600,400],[650,450]]}]}));
  },originalID);
  await page.evaluate(notes=>localStorage.setItem('sr2026-notes',JSON.stringify(notes)),fixtures);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  const stored=await page.evaluate(()=>localStorage.getItem('sr2026-notes'));
  async function open(){
   await page.locator('#cropNoteImage').click();
   await page.waitForFunction(()=>$('imageCropDialog').open&&!$('imageCropFields').disabled&&$('imageCropSource').naturalWidth>0);
  }
  async function rectangle(x,y,width,height){
   for(const [id,value] of Object.entries({X:x,Y:y,Width:width,Height:height})){
    await page.locator('#imageCrop'+id).fill(String(value));await page.locator('#imageCrop'+id).press('Tab');
   }
  }
  async function apply(){
   await page.locator('#applyImageCrop').click();
   await page.waitForFunction(()=>!$('imageCropDialog').open&&!eventImageLoading);
  }
  await page.locator('.note-edit').first().click();await open();
  const initial=await page.locator('#imageCropStage').boundingBox();
  assert.ok(initial.width>200&&initial.height>100,'Preview has usable dimensions');
  // Resize a corner and then move the crop with real pointer events.
  const corner=await page.locator('[data-crop-corner=nw]').boundingBox();
  await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2);await page.mouse.down();
  await page.mouse.move(initial.x+initial.width*.2,initial.y+initial.height*.2,{steps:5});await page.mouse.up();
  const resized=await page.evaluate(()=>({...imageCropState.rect}));
  assert.ok(resized.x>100&&resized.y>80&&resized.width<1200&&resized.height<800);
  const selection=await page.locator('#imageCropSelection').boundingBox();
  await page.mouse.move(selection.x+selection.width/2,selection.y+selection.height/2);await page.mouse.down();
  await page.mouse.move(selection.x+selection.width/2-15,selection.y+selection.height/2-15,{steps:3});await page.mouse.up();
  const moved=await page.evaluate(()=>({...imageCropState.rect}));
  assert.ok(moved.x<resized.x&&moved.y<resized.y);assert.equal(moved.width,resized.width);
  await page.locator('#resetImageCrop').click();
  assert.deepEqual(await page.evaluate(()=>imageCropState.rect),{x:0,y:0,width:1200,height:800});
  await apply();assert.equal(uploaded.length,0,'Whole-image crop does not recompress or upload');
  await open();await rectangle(300,200,600,400);await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>noteDraft.image),fixtures[0].image,'Cancelling the crop keeps the attachment');
  await open();await rectangle(300,200,600,400);
  await page.screenshot({path:path.join(os.tmpdir(),'sr2026-crop-'+type.name()+'-desktop.png')});
  failUpload=true;await page.locator('#applyImageCrop').click();
  await page.waitForFunction(()=>$('imageCropStatus').textContent.includes('Test:')&&!eventImageLoading);
  assert.equal(await page.locator('#imageCropDialog').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>noteDraft.image),fixtures[0].image,'Failed upload preserves the original');
  failUpload=false;await apply();
  assert.equal(await page.evaluate(()=>localStorage.getItem('sr2026-notes')),stored,'Cropping only updates the note draft');
  assert.equal(await page.evaluate(()=>noteDraft.image.width),600);
  await page.locator('#cancelEdit').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('sr2026-notes')),stored,'Cancel note restores original photo');
  await page.locator('.note-edit').first().click();await open();await rectangle(300,200,600,400);await apply();
  const cropped=await page.evaluate(()=>({...noteDraft.image}));
  assert.notEqual(cropped.id,originalID);assert.equal(cropped.width,600);assert.equal(cropped.height,400);
  await page.locator('#save').click();
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes')));
  assert.deepEqual(saved,[{...fixtures[0],image:cropped},fixtures[1]],'Only the selected event image changes');
  const actual=await page.evaluate(async url=>{
   const img=new Image();img.src=url;await img.decode();
   const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
   const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
   return {width:img.naturalWidth,height:img.naturalHeight,pixel:[...ctx.getImageData(300,200,1,1).data]};
  },cropped.url);
  assert.equal(actual.width,600);assert.equal(actual.height,400);
  assert.ok(actual.pixel[2]>200&&actual.pixel[0]<80,'Uploaded pixels are from the chosen blue region');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  assert.deepEqual(await page.evaluate(()=>notes[0].image),cropped,'Crop survives reload');
  await page.locator('.note-jump').first().click();
  await page.waitForFunction(()=>$('mapEventImageContent').naturalWidth===600&&!$('mapEventImage').hidden);
  assert.equal(await page.locator('#eventImageFigure').isVisible(),false);
  await page.locator('#mapEventImage').click();
  await page.waitForFunction(()=>$('eventImage').naturalWidth===600&&!$('eventImageFigure').hidden);
  const download=page.waitForEvent('download');await page.evaluate(()=>exportEventNotes());
  const bundle=JSON.parse(fs.readFileSync(await(await download).path(),'utf8'));
  assert.deepEqual(Buffer.from(bundle.notes[0].image.dataUrl.split(',')[1],'base64'),uploaded.at(-1).bytes,'Export includes cropped pixels');
  assert.deepEqual(Buffer.from(bundle.notes[1].image.dataUrl.split(',')[1],'base64'),source,'Shared original stays intact');
  // Mobile controls and a new image-only event use the same crop/upload path.
  await page.locator('#noteImage').setInputFiles({name:'Nyt foto.png',mimeType:'image/png',buffer:source});
  await page.waitForFunction(()=>pendingEventImage&&!eventImageLoading);
  await page.setViewportSize({width:390,height:740});await open();await rectangle(50,60,400,300);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const mobile=await page.locator('#imageCropDialog').boundingBox();assert.ok(mobile.x>=0&&mobile.width<=390&&mobile.y>=0&&mobile.y+mobile.height<=741);
  await page.screenshot({path:path.join(os.tmpdir(),'sr2026-crop-'+type.name()+'-mobile.png')});
  await apply();assert.equal(await page.evaluate(()=>pendingEventImage.width),400);
  await page.locator('#save').click();assert.equal(await page.evaluate(()=>activePresentationNote.image.height),300);
  await page.setViewportSize({width:1500,height:1000});
  // Cancelling while an upload is in flight cannot replace an attachment later.
  await page.locator('.note-edit').first().click();await open();await rectangle(10,10,200,200);
  holdUpload=true;await page.locator('#applyImageCrop').click();
  await page.waitForFunction(()=>eventImageLoading);
  for(let i=0;!releaseUpload&&i<1000;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(releaseUpload,'Crop upload started');
  await page.locator('#cancelImageCrop').click();releaseUpload();holdUpload=false;
  await page.waitForLoadState('networkidle');
  assert.deepEqual(await page.evaluate(()=>noteDraft.image),cropped,'Late upload cannot change a cancelled crop');
  assert.equal(await page.locator('#save').isEnabled(),true);await page.locator('#cancelEdit').click();
  // Exercise the hosted editor's draft and publication path without live writes.
  let onlineDocument={version:1,notes:fixtures,speedPins:[]},published=null;
  const origin=new URL(page.url()).origin;
  await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:`window.SR_CONFIG=${JSON.stringify({admin:true,apiBase:origin})};`}));
  await page.route('**/api/session',route=>route.fulfill({json:{authenticated:true,canEdit:true,login:'test-editor'}}));
  await page.route('**/api/presentation',route=>{
   if(route.request().method()==='GET')return route.fulfill({json:{document:onlineDocument,sha:'a'.repeat(40)}});
   published=route.request().postDataJSON();onlineDocument=published.document;
   return route.fulfill({json:{sha:'b'.repeat(40)}});
  });
  await page.reload();await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  await page.locator('.note-edit').first().click();await open();await rectangle(100,100,250,150);await apply();
  await page.locator('#save').click();
  assert.equal(published,null,'Saving a crop online keeps it in the draft until publication');
  await page.getByRole('button',{name:'Udgiv',exact:true}).click();
  await page.waitForFunction(()=>$('onlineStatus').textContent.includes('Gemt i GitHub'));
  assert.equal(published.sha,'a'.repeat(40));assert.equal(published.document.notes[0].image.width,250);
  assert.deepEqual(published.document.notes[1],fixtures[1]);
  await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={admin:false,apiBase:""};'}));
  await page.route('**/presentation.json',route=>route.fulfill({json:onlineDocument}));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  await page.waitForFunction(()=>$('mapEventImageContent').naturalWidth===250&&!$('mapEventImage').hidden);
  assert.equal(await page.locator('#eventImageFigure').isVisible(),false,'Published crop also has a single visible location');
  await page.evaluate(()=>openImageCrop());assert.equal(await page.locator('#imageCropDialog').isVisible(),false,'Public viewers cannot open crop editing');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'corner resize/move, pixel fields, reset/no-op, crop/note cancellation, upload failure/retry, exact cropped pixels, event isolation, persistence, single image view, portable export, mobile, new image-only event, cancelled upload, hosted draft/publish/public crop',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(error=>{console.error(error);process.exit(1)});
