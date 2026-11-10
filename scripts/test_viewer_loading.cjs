const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
const url=process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/';
async function loadingState(page){
 return page.evaluate(()=>({
  loading:document.documentElement.classList.contains('viewer-loading'),
  busy:document.body.getAttribute('aria-busy'),
  hidden:['main'].every(selector=>getComputedStyle(document.querySelector(selector)).visibility==='hidden'),
  geometry:document.querySelector('#map').getBoundingClientRect().width>0,
  inert:['main'].every(selector=>document.querySelector(selector).inert),
  progress:document.querySelector('#viewerLoadingProgress').value
 }));
}
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   window.loadingProgress=[];window.loadingReopened=false;
   addEventListener('DOMContentLoaded',()=>{
    const progress=document.querySelector('#viewerLoadingProgress');
    new MutationObserver(()=>window.loadingProgress.push(progress.value)).observe(progress,{attributes:true,attributeFilter:['value']});
    new MutationObserver(()=>{
     if(window.loadingFinished&&!document.querySelector('#viewerLoading').hidden)window.loadingReopened=true;
    }).observe(document.querySelector('#viewerLoading'),{attributes:true,attributeFilter:['hidden']});
   });
  });
  let releaseData,releaseOnline;
  const dataGate=new Promise(resolve=>{releaseData=resolve;}),onlineGate=new Promise(resolve=>{releaseOnline=resolve;});
  await page.route('**/data.js',async route=>{await dataGate;await route.continue();});
  await page.route('**/online.js',async route=>{await onlineGate;await route.continue();});
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#viewerLoadingProgress').value===5);
  assert.deepEqual(await loadingState(page),{loading:true,busy:'true',hidden:true,geometry:true,inert:true,progress:5});
  await page.screenshot({path:path.join(os.tmpdir(),'sr2026-initial-loading.png')});
  releaseData();
  await page.waitForRequest('**/online.js');
  const prepared=await loadingState(page);
  assert.equal(prepared.loading&&prepared.hidden&&prepared.inert&&prepared.geometry,true);
  assert.ok(prepared.progress>90&&prepared.progress<100);
  assert.equal(await page.evaluate(()=>boats.every(boat=>webglTracks.buffers.has(boat.points))),true);
  releaseOnline();
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  assert.equal(await page.locator('#viewerLoading').isVisible(),false);
  assert.equal(await page.locator('#mapHeading').isVisible(),true);
  assert.equal(await page.locator('#viewerLoadingProgress').evaluate(node=>node.value),100);
  assert.equal(await page.locator('body').getAttribute('aria-busy'),'false');
  assert.equal(await page.evaluate(()=>loadingProgress.every((value,index)=>index===0||value>=loadingProgress[index-1])),true);
  await page.evaluate(()=>{window.loadingFinished=true;});
  await page.locator('#visibleBoatsToggle').click();
  await page.locator('#boatSearchInput').fill('Mercutio');
  await page.locator('#boatSearchInput').fill('');
  await page.evaluate(()=>{selectedTime=D.start+3600;render();});
  assert.equal(await page.evaluate(()=>window.loadingReopened),false);
  assert.equal(await page.locator('#viewerLoading').isVisible(),false);
  assert.deepEqual(errors,[]);
  await page.close();

  const recovery=await browser.newPage();
  let fail=true;
  await recovery.route('**/data.js',route=>{
   if(fail){fail=false;return route.abort();}
   return route.continue();
  });
  await recovery.goto(url);
  await recovery.locator('#viewerLoadingError').waitFor({state:'visible'});
  assert.match(await recovery.locator('#viewerLoadingError').textContent(),/data\.js/);
  assert.equal((await loadingState(recovery)).hidden,true);
  await recovery.locator('#viewerLoadingRetry').click();
  await recovery.waitForSelector('main:not([inert])',{timeout:120000});
  assert.equal(await recovery.locator('#viewerLoading').isVisible(),false);
  await recovery.close();

  const invalid=await browser.newPage();
  await invalid.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={admin:false,apiBase:""};'}));
  for(const document of [[],{notes:[],speedPins:[]},{version:1,notes:[]}]){
   await invalid.route('**/presentation.json',route=>route.fulfill({json:document}));
   await invalid.goto(url);
   await invalid.locator('#viewerLoadingError').waitFor({state:'visible'});
   assert.match(await invalid.locator('#viewerLoadingError').textContent(),/version 1, notes og speedPins/);
   assert.equal((await loadingState(invalid)).hidden,true);
   await invalid.unroute('**/presentation.json');
  }
  await invalid.close();

  const executionFailure=await browser.newPage();
  await executionFailure.route('**/boat-icons.js',route=>route.fulfill({contentType:'application/javascript',body:'throw Error("Fejl under opstart af bådikoner.");'}));
  await executionFailure.goto(url);
  await executionFailure.locator('#viewerLoadingError').waitFor({state:'visible'});
  assert.match(await executionFailure.locator('#viewerLoadingError').textContent(),/Fejl under opstart af bådikoner/);
  assert.equal((await loadingState(executionFailure)).hidden,true);
  await executionFailure.close();

  for(const missing of ['coast_metadata','land','course_lines','route_t','traffic_separation','military_areas']){
   const incomplete=await browser.newPage();
   await incomplete.route('**/data.js',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+'\ndelete window.DATA.'+missing+';'});
   });
   await incomplete.goto(url);
   await incomplete.locator('#viewerLoadingError').waitFor({state:'visible'});
   assert.match(await incomplete.locator('#viewerLoadingError').textContent(),missing==='coast_metadata'?/OSM-kystlinje/:new RegExp(missing));
   assert.equal((await loadingState(incomplete)).hidden,true);
   await incomplete.close();
  }

  const publicPage=await browser.newPage();
  await publicPage.addInitScript(()=>{
   window.publicEditorFlash=false;
   function inspectFrame(){
    if(document.body&&!document.documentElement.classList.contains('viewer-loading')&&!document.body.classList.contains('presenting'))window.publicEditorFlash=true;
    requestAnimationFrame(inspectFrame);
   }
   requestAnimationFrame(inspectFrame);
  });
  let publicFail=true,releaseWeather;
  const weatherGate=new Promise(resolve=>{releaseWeather=resolve;});
  await publicPage.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={admin:false,apiBase:""};'}));
  await publicPage.route('**/presentation.json',route=>publicFail
   ?route.fulfill({status:500,body:'Unavailable'})
   :route.fulfill({json:{version:1,speedPins:[],notes:[
    {time:Date.UTC(2026,5,11,8)/1000,text:'Indlæsningskontrol',view:[230,250,620,760]}
   ]}}));
  await publicPage.route('**/radar/*.png',async route=>{await weatherGate;await route.continue();});
  await publicPage.goto(url);
  await publicPage.locator('#viewerLoadingError').waitFor({state:'visible'});
  assert.equal((await loadingState(publicPage)).hidden,true);
  assert.equal(await publicPage.locator('#viewerLoadingRetry').isVisible(),true);
  publicFail=false;
  await publicPage.locator('#viewerLoadingRetry').click();
  await publicPage.waitForFunction(()=>document.querySelector('#viewerLoadingProgress').value===95,{},{timeout:120000});
  assert.equal((await loadingState(publicPage)).hidden,true);
  assert.equal(await publicPage.locator('#viewerLoadingProgress').isVisible(),true,await publicPage.locator('#viewerLoadingError').textContent());
  releaseWeather();
  await publicPage.waitForSelector('main:not([inert])',{timeout:120000});
  assert.equal(await publicPage.evaluate(()=>radarImageBuffer.front?.key),String(Date.UTC(2026,5,11,8)/1000),'Radar uses UTC ten-minute frames even when boat data starts between frames');
  assert.equal(await publicPage.locator('#viewerLoading').isVisible(),false);
  assert.equal(await publicPage.evaluate(()=>window.SR_READONLY),true);
  assert.equal(await publicPage.locator('aside').isVisible(),false);
  assert.equal(await publicPage.locator('#endPresentation').isVisible(),false);
  await publicPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await publicPage.evaluate(()=>window.publicEditorFlash),false);
  await publicPage.close();
  console.log('Firefox: initial-only loading, real layout and fleet preparation, monotonic progress, interactions without reopening, explicit failures and reload recovery.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
