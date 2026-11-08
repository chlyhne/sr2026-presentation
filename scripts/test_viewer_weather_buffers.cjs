const assert=require('node:assert/strict'),path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let releaseSlow,releaseStale;
  const slow=new Promise(resolve=>releaseSlow=resolve),stale=new Promise(resolve=>releaseStale=resolve);
  await page.route('**/radar/1781166000.png',async route=>{await slow;await route.continue();});
  await page.route('**/radar/1781166600.png',async route=>{await stale;await route.continue();});
  await page.route('**/radar/1781168400.png',route=>route.abort());
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');await page.waitForFunction(()=>typeof stopPlayback==='function');
  await page.evaluate(()=>Promise.all([windReady,radarReady]));
  await page.waitForFunction(()=>windImageBuffer.back?.ready&&radarImageBuffer.back?.ready);
  const instant=await page.evaluate(()=>{
   const radarBack=radarImageBuffer.backNode,windBack=windImageBuffer.backNode;
   renderRadar(D.start+600);renderWindField(D.start+3600);
   return {radar:radarImageBuffer.frontNode===radarBack,wind:windImageBuffer.frontNode===windBack,
    radarVisible:$('radarImage').getAttribute('visibility'),windVisible:$('windImage').getAttribute('visibility'),
    radarKey:radarImageBuffer.front.key,windKey:windImageBuffer.front.key};
  });
  assert.equal(instant.radar,true);assert.equal(instant.wind,true);assert.equal(instant.radarVisible,'visible');assert.equal(instant.windVisible,'visible');
  assert.equal(instant.radarKey,'1781165400');assert.match(instant.windKey,/:1781168400$/);
  await page.evaluate(()=>renderRadar(D.start+1200));
  assert.equal(await page.locator('#radarImage').getAttribute('visibility'),'visible');
  assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781165400','Keep old image while slow request loads');
  releaseSlow();await page.evaluate(()=>radarReady);
  assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781166000');
  await page.evaluate(()=>{renderRadar(D.start+1800);window.staleRadar=radarReady;renderRadar(D.start+2400);});
  await page.evaluate(()=>radarReady);assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781167200');
  releaseStale();await page.evaluate(()=>window.staleRadar);
  assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781167200','Stale load must never replace newer frame');
  await page.evaluate(()=>renderRadar(D.start+3600));await page.evaluate(()=>radarReady);
  assert.equal(await page.evaluate(()=>radarStatus),'kunne ikke indlæses');
  assert.equal(await page.locator('#radarImage').getAttribute('visibility'),'visible');
  assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781167200');
  await page.unroute('**/radar/1781168400.png');
  await page.evaluate(()=>{$('rain').checked=false;renderRadar(D.start+3600);});
  assert.equal(await page.locator('#radarImage').getAttribute('visibility'),'hidden');
  assert.equal(await page.locator('#radarImageBack').getAttribute('visibility'),'hidden');
  await page.evaluate(()=>{$('rain').checked=true;setCurrentTime(D.start+3600);render();});
  await page.evaluate(()=>Promise.all([radarReady,windReady]));
  assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781168400');
  assert.equal(await page.locator('#precipitation image[visibility="visible"]').count(),1);
  assert.equal(await page.locator('#windField image[visibility="visible"]').count(),1);
  await page.screenshot({path:'/tmp/sr2026-weather-buffers-'+type.name()+'.png'});
  const download=page.waitForEvent('download');await page.evaluate(()=>captureMap());await(await download).saveAs('/tmp/sr2026-weather-buffers-'+type.name()+'-export.png');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:type.name(),checks:'prefetched instant radar/wind swaps, two SVG buffers, no blank while loading, stale requests, load errors, retry, layer toggles, PNG export',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1);});
