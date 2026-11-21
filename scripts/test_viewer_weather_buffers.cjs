const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let releaseSlow,releaseStale;
  const slow=new Promise(resolve=>releaseSlow=resolve),stale=new Promise(resolve=>releaseStale=resolve);
  await page.route('**/radar/1781166000.png',async route=>{await slow;await route.continue();});
  await page.route('**/radar/1781166600.png',async route=>{await stale;await route.continue();});
  await page.route('**/radar/1781168400.png',route=>route.abort());
  await page.goto(new URL('events/sjaelland-rundt-2026/',process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/').href);
  await page.waitForSelector('main:not([inert])');
  await page.evaluate(()=>{$('rain').checked=true;visibleTimeRanges=[];renderRadar(1781164800);return radarReady;});
  await page.waitForFunction(()=>radarImageBuffer.back?.ready);
  const instant=await page.evaluate(()=>{
   const radarBack=radarImageBuffer.backNode;
   renderRadar(1781165400);
   return {swapped:radarImageBuffer.frontNode===radarBack,
    current:radarImageBuffer.frontNode.getAttribute('visibility'),
    retired:radarImageBuffer.backNode.getAttribute('visibility'),
    key:radarImageBuffer.front.key};
  });
  assert.deepEqual(instant,{swapped:true,current:'visible',retired:'visible',key:'1781165400'});
  await page.evaluate(()=>renderRadar(1781166000));
  assert.equal(await page.locator('#radarImage').getAttribute('visibility'),'visible');
  assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781165400','Keep old image while slow request loads');
  releaseSlow();await page.evaluate(()=>radarReady);
  assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781166000');
  await page.evaluate(()=>{renderRadar(1781166600);window.staleRadar=radarReady;renderRadar(1781167200);});
  await page.evaluate(()=>radarReady);assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781167200');
  releaseStale();await page.evaluate(()=>window.staleRadar);
  assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781167200','Stale load must never replace newer frame');
  await page.evaluate(()=>renderRadar(1781168400));await page.evaluate(()=>radarReady);
  assert.equal(await page.evaluate(()=>radarStatus),'kunne ikke indlæses');
  assert.equal(await page.locator('#radarImage').getAttribute('visibility'),'visible');
  assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781167200');
  await page.unroute('**/radar/1781168400.png');
  await page.evaluate(()=>{$('rain').checked=false;renderRadar(1781168400);});
  assert.equal(await page.locator('#radarImage').getAttribute('visibility'),'hidden');
  assert.equal(await page.locator('#radarImageBack').getAttribute('visibility'),'hidden');
  await page.evaluate(()=>{$('rain').checked=true;setCurrentTime(1781168400);render();});
  await page.evaluate(()=>radarReady);
  assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781168400');
  await page.evaluate(()=>radarImageBuffer.paintReady);
  assert.equal(await page.locator('#precipitation image[visibility="visible"]').count(),1);
  await page.screenshot({path:'/tmp/sr2026-weather-buffers-'+type.name()+'.png'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:type.name(),checks:'prefetched instant radar swaps, two SVG buffers, no blank while loading, stale requests, load errors, retry, layer toggles',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1);});
