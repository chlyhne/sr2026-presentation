const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('events/sjaelland-rundt-2026/',process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/').href);
  await page.waitForSelector('main:not([inert])');
  await page.evaluate(()=>{setRainEnabled(true);visibleTimeRanges=[];renderRadar(1781164800);return radarReady;});
  await page.waitForFunction(()=>radarImageBuffer.front?.ready&&radarImageBuffer.back?.ready);
  const result=await page.evaluate(async()=>{
   const check=(ok,message)=>{if(!ok)throw Error(message);};
   const original=requestAnimationFrame,frames=[];
   window.requestAnimationFrame=callback=>frames.push(callback);
   const oldRadar=radarImageBuffer.frontNode;
   const radarHref=oldRadar.getAttribute('href');
   try{
    renderRadar(1781165400);
    await Promise.resolve();
    check(oldRadar.getAttribute('visibility')==='visible','Old frame removed before paint');
    check(radarImageBuffer.frontNode===oldRadar.parentNode.lastElementChild,'Radar source order was not updated');
    const first=frames.splice(0);for(const callback of first)callback(performance.now());
    await Promise.resolve();
    check(oldRadar.getAttribute('visibility')==='visible','Previous source retired before handoff');
    check(oldRadar.getAttribute('href')===radarHref,'Source slot overwritten before handoff');
    const second=frames.splice(0);for(const callback of second)callback(performance.now());
    await radarImageBuffer.paintReady;
    check(oldRadar.getAttribute('visibility')==='hidden','Previous source did not retire');
    check(radarImageBuffer.frontNode.getAttribute('visibility')==='visible','No image after handoff');
    return {radarPaintCallbacks:first.length,retireCallbacks:second.length};
   }finally{window.requestAnimationFrame=original;}
  });
  await page.waitForFunction(()=>radarImageBuffer.back?.ready);
  // Reverse immediately while the previous front is still retained for painting.
  await page.evaluate(()=>{renderRadar(1781166000);renderRadar(1781165400);});
  await page.evaluate(()=>radarReady);assert.equal(await page.locator('#radarImage').getAttribute('data-weather-key'),'1781165400');
  await page.evaluate(()=>radarImageBuffer.paintReady);
  assert.equal(await page.locator('#precipitation image[visibility="visible"]').count(),1);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:type.name(),checks:'source retained through handoff, no early slot reuse, source ordering, clean retirement, rapid reverse seek',...result,errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1);});
