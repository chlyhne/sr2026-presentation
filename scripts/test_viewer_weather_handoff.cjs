const assert=require('node:assert/strict'),path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');await page.waitForFunction(()=>typeof stopPlayback==='function');
  await page.waitForFunction(()=>radarImageBuffer.front?.ready&&radarImageBuffer.back?.ready&&windImageBuffer.front?.ready&&windImageBuffer.back?.ready);
  const result=await page.evaluate(async()=>{
   const check=(ok,message)=>{if(!ok)throw Error(message);};
   const original=requestAnimationFrame,frames=[];
   window.requestAnimationFrame=callback=>frames.push(callback);
   const oldRadar=radarImageBuffer.frontNode,oldWind=windImageBuffer.frontNode;
   const radarHref=oldRadar.getAttribute('href'),windHref=oldWind.getAttribute('href');
   try{
    renderRadar(D.start+600);renderWindField(D.start+3600);
    await Promise.resolve();
    check(oldRadar.getAttribute('visibility')==='visible'&&oldWind.getAttribute('visibility')==='visible','Old frame removed before paint');
    check(radarImageBuffer.frontNode===oldRadar.parentNode.lastElementChild,'New radar is below fallback');
    check(windImageBuffer.frontNode===oldWind.parentNode.lastElementChild,'New wind is below fallback');
    const first=frames.splice(0);for(const callback of first)callback(performance.now());
    await Promise.resolve();
    check(oldRadar.getAttribute('visibility')==='visible'&&oldWind.getAttribute('visibility')==='visible','Fallback did not survive one paint');
    check(oldRadar.getAttribute('href')===radarHref&&oldWind.getAttribute('href')===windHref,'Fallback slot overwritten before paint');
    const second=frames.splice(0);for(const callback of second)callback(performance.now());
    await Promise.all([radarImageBuffer.paintReady,windImageBuffer.paintReady]);
    check(oldRadar.getAttribute('visibility')==='hidden'&&oldWind.getAttribute('visibility')==='hidden','Fallback did not retire');
    check(radarImageBuffer.frontNode.getAttribute('visibility')==='visible'&&windImageBuffer.frontNode.getAttribute('visibility')==='visible','No image after handoff');
    return {radarPaintCallbacks:first.length,retireCallbacks:second.length};
   }finally{window.requestAnimationFrame=original;}
  });
  await page.waitForFunction(()=>radarImageBuffer.back?.ready);
  // Reverse immediately while the previous front is still retained for painting.
  await page.evaluate(()=>{renderRadar(D.start+1200);renderRadar(D.start+600);});
  await page.evaluate(()=>radarReady);assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781165400');
  await page.evaluate(()=>Promise.all([radarImageBuffer.paintReady,windImageBuffer.paintReady]));
  assert.equal(await page.locator('#precipitation image[visibility="visible"]').count(),1);
  assert.equal(await page.locator('#windField image[visibility="visible"]').count(),1);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:type.name(),checks:'fallback retained through paint, no early slot reuse, front on top, clean retirement, rapid reverse seek',...result,errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1);});
