const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));

(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  const url=new URL('events/sjaelland-rundt-2026/',process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  const start=require('../viewer/events/catalog.json').events.find(event=>event.id==='sjaelland-rundt-2026').start+3600;
  const notes=[{time:start,text:'Første event'},{time:start+5,text:'Næste event'}];
  await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={admin:false};'}));
  await page.route('**/presentation.json',route=>route.fulfill({json:{version:1,notes,speedPins:[]}}));
  await page.goto(url.href);
  await page.locator('main:not([inert])').waitFor({timeout:120000});
  const player=page.locator('#editingTimeline');
  const height=()=>player.evaluate(element=>element.getBoundingClientRect().height);
  const next=page.locator('#nextEvent');
  const status=page.locator('#presentationMessage');
  const idleHeight=await height();

  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.locator('#playbackSpeed').selectOption('10');
  await next.click();
  assert.match(await status.textContent(),/Afspiller frem til event 2/);
  assert.equal(await height(),idleHeight,'Next keeps the player height when opening the event panel and starting playback');
  await page.clock.runFor(200);
  assert.equal(await page.evaluate(()=>!!interval),true);
  assert.equal(await height(),idleHeight,'The player keeps its height while advancing');
  await page.clock.runFor(400);
  assert.equal(await page.evaluate(()=>activePresentationNote.text),'Næste event');
  assert.equal(await status.textContent(),'');
  assert.equal(await height(),idleHeight,'The player keeps its height on arrival');

  await page.locator('#presentationEventSelect').selectOption('0');
  await next.click();
  await next.click();
  assert.equal(await page.evaluate(()=>activePresentationNote.text),'Næste event');
  assert.equal(await height(),idleHeight,'Skipping to the target keeps the player height');
  console.log('Firefox: playback controls keep the same height before, during and after Next.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
