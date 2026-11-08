const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');await page.waitForFunction(()=>typeof captureMap==='function');
  await page.waitForTimeout(100);
  const result=await page.evaluate(async()=>{
   const check=(v,message)=>{if(!v)throw Error(message);};
   const frame=()=>new Promise(requestAnimationFrame);
   chosen.clear();chosen.add('Mercutio');$('wind').checked=$('rain').checked=false;
   updateTimeline();setCurrentTime(D.start+7200);render();
   const originalMap=drawMap,originalViewport=drawViewport,originalPins=renderSpeedPins;
   let full=0,viewport=0,pins=0;
   drawMap=()=>{full++;originalMap();};drawViewport=()=>{viewport++;originalViewport();};renderSpeedPins=()=>{pins++;originalPins();};
   try{
    // Repeated real UI entry points update state immediately, paint only once.
    for(let i=0;i<12;i++)step(1);
    const end=currentTime();check(end===D.start+7212,'State changes were deferred');
    check(full===0&&renderRequestKind==='full','UI burst rendered synchronously');
    await frame();check(full===1&&viewport===0,'UI burst did not become one full draw');
    check($('clock').textContent===fmt(end),'Rendered stale time');check(pins===1,'Speed pins drawn twice in one frame');
    const marker=$('boatMarkers').firstChild;
    full=viewport=0;
    for(let i=0;i<5;i++){view=[view[0]+.1,view[1],view[2],view[3]];setview();}
    check(!full&&!viewport,'Pan burst rendered synchronously');await frame();
    check(!full&&viewport===1,'Pan burst was not coalesced');check($('boatMarkers').firstChild===marker,'Viewport paint rebuilt the boat markers');
    // Full requests win in either order; an immediate render drains the queue.
    for(const reverse of [false,true]){
     full=viewport=0;
     if(reverse){requestRender();requestRender({viewportOnly:true});}else{requestRender({viewportOnly:true});requestRender();}
     await frame();check(full===1&&viewport===0,'Full request was downgraded');
    }
    full=viewport=0;requestRender({backgroundOnly:true});requestRender({viewportOnly:true});requestRender({backgroundOnly:true});
    await frame();check(viewport===1&&full===0,'Background request overrode viewport work');
    full=viewport=0;requestRender({backgroundOnly:true});requestRender();requestRender({backgroundOnly:true});
    await frame();check(full===1&&viewport===0,'Background request overrode full work');
    full=viewport=0;requestRender();render();check(full===1,'Immediate render was deferred');
    await frame();check(full===1&&viewport===0,'Immediate render left a duplicate queued draw');
    // A request produced while drawing belongs to the next frame, not this one.
    full=viewport=0;
    drawViewport=()=>{viewport++;originalViewport();requestRender();};requestRender({viewportOnly:true});
    await frame();check(viewport===1&&full===0&&renderRequestKind==='full','Nested request was lost');
    await frame();check(full===1,'Nested request did not run in the next frame');
    return {burstRequests:12,burstDraws:1,checks:'latest synchronous state, one paint per frame, full/viewport priority, marker reuse, one speed-pin paint, immediate flush, requests during drawing'};
   }finally{drawMap=originalMap;drawViewport=originalViewport;renderSpeedPins=originalPins;flushRender();}
  });
  // Exporting immediately after input must include the queued scene, with no
  // dependence on whether the browser has delivered its next animation frame.
  await page.evaluate(()=>{
   const serialize=XMLSerializer.prototype.serializeToString;
   XMLSerializer.prototype.serializeToString=function(node){const value=serialize.call(this,node);window.schedulerExport=value;return value;};
  });
  const download=page.waitForEvent('download');
  const expected=await page.evaluate(async()=>{
   setCurrentTime(D.start+7300);requestRender();
   const boat=boats.find(b=>b.name==='Mercutio'),x=xy(trackPosition(boat.points,currentTime()).point)[0],time=fmt(currentTime());
   await captureMap();return {x,time};
  });
  const file=await(await download).path();assert.ok(fs.statSync(file).size>0);
  const exported=await page.evaluate(()=>{
   const doc=new DOMParser().parseFromString(schedulerExport,'image/svg+xml');
   return {x:+doc.querySelector('.boat-marker').dataset.screenX,description:doc.querySelector('desc').textContent,pending:renderRequestKind};
  });
  assert.ok(Math.abs(exported.x-expected.x)<1e-8);assert.ok(exported.description.includes(expected.time));assert.equal(exported.pending,null);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:type.name(),...result,latestScenePNG:true,errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
