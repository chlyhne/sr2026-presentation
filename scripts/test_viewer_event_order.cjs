const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForFunction(()=>typeof chronologicalNotes==='function');
  const photo={id:'55555555-5555-4555-8555-555555555555',url:'/event-images/55555555-5555-4555-8555-555555555555.png',name:'Et billede fra næste dag'};
  await page.route('**'+photo.url,route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1cAAAAASUVORK5CYII=','base64')}));
  const fixtures=await page.evaluate(photo=>{
   const settings={...sceneSettings(),wind:false,rain:false,boats:[]},view=[230,250,620,760];
   return [{time:D.start+90000,text:'Næste dag',image:photo,view,settings},
    {time:D.start+7200,text:'Samme tid A',view,settings},
    {time:D.start+3600,text:'Først',point:[600,400],drawings:[{tool:'line',colour:'#e02020',width:4,points:[[590,390],[610,410]]}],view,settings},
    {time:D.start+7200,text:'Samme tid B',view,settings}];
  },photo);
  await page.evaluate(notes=>localStorage.setItem('sr2026-notes',JSON.stringify(notes)),fixtures);
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.note-jump').length===4);
  let expected=[fixtures[2],fixtures[1],fixtures[3],fixtures[0]];
  const storage=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes')));
  assert.deepEqual(await storage(),expected,'Existing events are migrated into stable full-timestamp order');
  async function labels(){return await page.evaluate(()=>notes.map(n=>n.text));}
  async function nextNow(){
   await page.locator('#nextEvent').click();
   if(await page.evaluate(()=>!!eventPlaybackTarget))await page.locator('#nextEvent').click();
  }
  assert.deepEqual(await labels(),['Først','Samme tid A','Samme tid B','Næste dag']);
  await page.locator('#startPresentation').click();
  assert.equal(await page.locator('#previousEvent').isDisabled(),true);
  for(const text of ['Samme tid A','Samme tid B','Næste dag']){
   await nextNow();assert.equal(await page.locator('#eventText').textContent(),text);
  }
  assert.equal(await page.locator('#nextEvent').isDisabled(),true);
  // The first event and next-day event have the same displayed clock time.
  assert.equal(await page.evaluate(()=>fmt(notes[0].time)===fmt(notes[3].time)),true);
  assert.ok(await page.evaluate(()=>currentTime()>notes[2].time));
  await page.locator('#previousEvent').click();assert.equal(await page.locator('#eventText').textContent(),'Samme tid B');
  await page.locator('#endPresentation').click();
  async function add(offset,text){
   await page.evaluate(offset=>{selectedTime=D.start+offset;render();},offset);
   await page.locator('#note').fill(text);await page.locator('#save').click();
  }
  await add(5400,'Tilføjet i midten');
  assert.deepEqual(await labels(),['Først','Tilføjet i midten','Samme tid A','Samme tid B','Næste dag']);
  assert.equal(await page.locator('#eventCounter').textContent(),'Event 2 af 5');
  await page.locator('#previousEvent').click();assert.equal(await page.locator('#eventText').textContent(),'Først');
  await page.locator('#nextEvent').click();assert.equal(await page.locator('#eventText').textContent(),'Tilføjet i midten');
  await page.locator('#nextEvent').click();assert.equal(await page.locator('#eventText').textContent(),'Samme tid A');
  await add(1800,'Tilføjet før alle');
  await add(150000,'Tilføjet efter alle');
  await add(7200,'Tilføjet på samme tid');
  const order=['Tilføjet før alle','Først','Tilføjet i midten','Samme tid A','Samme tid B','Tilføjet på samme tid','Næste dag','Tilføjet efter alle'];
  assert.deepEqual(await labels(),order);
  expected=await storage();assert.deepEqual(expected.map(n=>n.text),order);
  assert.deepEqual(expected[1],fixtures[2],'Reordering preserves marker, drawing, view and settings');
  assert.deepEqual(expected[6],fixtures[0],'Reordering preserves image metadata and next-day timestamp');
  assert.equal(await page.locator('#eventSelect').inputValue(),'5','New same-time event is inserted after existing ties and stays selected');
  await page.locator('#startPresentation').click();assert.equal(await page.locator('#eventText').textContent(),'Tilføjet på samme tid');
  await page.keyboard.press('Home');assert.equal(await page.locator('#eventText').textContent(),order[0]);
  for(const text of order.slice(1)){await nextNow();assert.equal(await page.locator('#eventText').textContent(),text);}
  for(const text of order.slice(0,-1).reverse()){await page.locator('#previousEvent').click();assert.equal(await page.locator('#eventText').textContent(),text);}
  await page.locator('#endPresentation').click();
  await page.locator('#eventSelect').selectOption('1');await page.locator('#eventText').click();
  await page.locator('#eventTextEditor').fill('Først, med rettet tekst');await page.keyboard.press('Control+Enter');
  expected[1]={...expected[1],text:'Først, med rettet tekst'};assert.deepEqual(await storage(),expected);
  const download=page.waitForEvent('download');await page.evaluate(()=>exportEventNotes());
  const exported=JSON.parse(fs.readFileSync(await(await download).path(),'utf8')).notes;
  assert.deepEqual(exported.map(n=>n.time),expected.map(n=>n.time));
  assert.ok(exported[6].image.dataUrl.startsWith('data:image/png;base64,'));
  await page.evaluate(()=>{window.originalOrderStorage=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='sr2026-notes')throw new Error('quota');return originalOrderStorage.call(this,key,value);};});
  await add(800,'Må ikke indsættes ved gemmefejl');assert.deepEqual(await storage(),expected);assert.equal(await page.evaluate(()=>notes.length),8);
  await page.evaluate(()=>{Storage.prototype.setItem=originalOrderStorage;});
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.note-jump').length===8);
  assert.deepEqual(await storage(),expected);assert.deepEqual(await labels(),expected.map(n=>n.text));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'existing unsorted events, middle/first/last insertions, stable ties, full timestamps across midnight, active selection, previous/next and keyboard, inline edits, images/drawings preserved, sorted export, failed save, reload',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
