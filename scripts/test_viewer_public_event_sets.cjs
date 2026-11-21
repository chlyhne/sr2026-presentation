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
  const errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>requests.push(request.url()));
  await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',
   body:'window.SR_CONFIG={admin:true,apiBase:location.origin};'}));
  await page.goto(url.href);
  await page.locator('main:not([inert])').waitFor({timeout:120000});
  assert.equal(await page.evaluate(()=>notes.length),67);

  const overlay=page.locator('#mapEventImageContent');
  await overlay.waitFor({state:'visible'});
  const initialImage=await overlay.getAttribute('src');
  assert.ok(new URL(initialImage,await page.evaluate(()=>document.baseURI)).pathname.startsWith('/test/event-images/'));
  await page.keyboard.press('Escape');
  await page.locator('#eventPanelToggle').click();
  const startTime=await page.evaluate(()=>currentTime());
  const nextSet=page.waitForResponse(response=>response.url().endsWith('/presentations/stikord.json'));
  await page.locator('#eventSetSelect').selectOption('public:stikord');
  assert.equal((await nextSet).ok(),true);
  await page.waitForFunction(()=>notes[0].text.startsWith('Motoren fra Saga'));
  assert.equal(await page.evaluate(()=>notes.length),13);
  assert.equal(await page.evaluate(()=>currentTime()),startTime);
  await page.locator('#presentationEventSelect').selectOption('0');
  await overlay.waitFor({state:'visible'});
  assert.match(await overlay.getAttribute('alt'),/Sagas motor/);
  assert.equal(await page.evaluate(()=>document.location.href),url.href);
  assert.ok(requests.some(request=>new URL(request).pathname.startsWith('/test/event-images/')));
  assert.ok(!requests.some(request=>new URL(request).pathname.startsWith('/api/')));
  assert.deepEqual(errors,[]);
  console.log('Firefox: original and Stikord sets and their published images load under a prefixed static viewer.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
