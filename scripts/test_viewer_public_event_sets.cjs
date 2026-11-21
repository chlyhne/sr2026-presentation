const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));

(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  // A prefixed viewer with the config returned by the older admin Worker.
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/';
  const url=new URL('test/events/sjaelland-rundt-2026/',base);
  const catalog=structuredClone(require('../viewer/events/catalog.json'));
  const event=catalog.events.find(item=>item.id==='sjaelland-rundt-2026');
  event.publicSets=[{id:'testsaet',title:'Testsæt',presentationFile:'presentation/testsaet.json'}];
  const published=require('../presentation/presentation.json');
  const image=published.notes.find(note=>note.image&&note.image.url!==published.notes[0]?.image?.url).image;
  const alternate={version:1,notes:[{time:published.notes[0].time+60,text:'Event fra testsættet',image}],speedPins:[]};
  const errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>requests.push(request.url()));
  await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',
   body:'window.SR_CONFIG={admin:true,apiBase:location.origin};'}));
  await page.route('**/events/catalog.json',route=>route.fulfill({json:catalog}));
  await page.route('**/presentations/testsaet.json',route=>route.fulfill({json:alternate}));
  await page.goto(url.href);
  await page.locator('main:not([inert])').waitFor({timeout:120000});
  assert.equal(await page.evaluate(()=>notes.length),published.notes.length);

  const overlay=page.locator('#mapEventImageContent');
  await overlay.waitFor({state:'visible'});
  const initialImage=await overlay.getAttribute('src');
  assert.ok(new URL(initialImage,await page.evaluate(()=>document.baseURI)).pathname.startsWith('/test/event-images/'));
  await page.keyboard.press('Escape');
  await page.locator('#eventPanelToggle').click();
  const startTime=await page.evaluate(()=>currentTime());
  const nextSet=page.waitForResponse(response=>response.url().endsWith('/presentations/testsaet.json'));
  await page.locator('#eventSetPicker').click();
  await page.locator('#eventSetSelect').selectOption('set:testsaet');
  assert.equal((await nextSet).ok(),true);
  await page.waitForFunction(text=>notes[0].text===text,alternate.notes[0].text);
  assert.equal(await page.evaluate(()=>notes.length),alternate.notes.length);
  assert.equal(await page.evaluate(()=>currentTime()),startTime);
  await page.locator('#presentationEventSelect').selectOption('0');
  await overlay.waitFor({state:'visible'});
  assert.equal(await overlay.getAttribute('alt'),image.name);
  assert.equal(await page.evaluate(()=>document.location.href),url.href);
  assert.ok(requests.some(request=>new URL(request).pathname.startsWith('/test/event-images/')));
  assert.ok(!requests.some(request=>new URL(request).pathname.startsWith('/api/')));
  // The published view has a local editor even with the older config.
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Redigér event',exact:true}).click();
  await page.locator('#eventTextEditor').fill('Rettelse gemt i browseren');
  await page.getByRole('button',{name:'Gem event',exact:true}).click();
  await page.waitForFunction(()=>$('onlineStatus').textContent==='Gemt lokalt.');
  await page.locator('#eventSetPicker').click();
  await page.locator('#eventSetSelect').selectOption('set:default');
  await page.waitForFunction(()=>eventSetSource==='set:default'&&!eventSetBusy);
  await page.locator('#eventSetPicker').click();
  await page.locator('#eventSetSelect').selectOption('set:testsaet');
  await page.waitForFunction(()=>eventSetSource==='set:testsaet'&&!eventSetBusy);
  assert.equal(await page.evaluate(()=>notes[0].text),'Rettelse gemt i browseren');
  assert.deepEqual(errors,[]);
  console.log('Firefox: standard and named sets and their published images load under a prefixed static viewer.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
