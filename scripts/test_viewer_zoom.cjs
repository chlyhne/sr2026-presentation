const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18454/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.waitForTimeout(200);
  const zoom=await page.evaluate(()=>{
   const check=(value,message)=>{if(!value)throw Error(message);};
   stopPlayback();consumeRenderRequest();$('wind').checked=$('rain').checked=false;
   setCurrentTime(D.start+43200);
   const position=displayBoatPosition(referenceBoat(),currentTime());check(position,'Reference boat is missing');
   const [x,y]=xy(position.point);view=[x-view[2]/2,y-view[3]/2,view[2],view[3]];setview();updateTimeline();render();
   const renderer=webglTracks,gl=renderer.gl,uploads=renderer.uploads,marker=$('boatMarkers').firstElementChild,legend=$('trackSpeedLegend').firstElementChild;
   const buffers=[...renderer.buffers],originals=new Map(),functions=new Map(),map=$('map'),time=currentTime();
   check(typeof renderer.cache==='undefined'&&typeof WebGLTrackCache==='undefined','Raster cache must be removed');
   window.zoomCalls={};window.restoreZoomProbe=()=>{for(const [name,original] of functions)window[name]=original;};
   for(const name of ['updateTimeline','updateVisibleBoats','renderTracks','drawMap','updatePresentationControls','displayTrackWindow']){
    functions.set(name,window[name]);zoomCalls[name]=0;
    window[name]=function(...args){zoomCalls[name]++;return functions.get(name).apply(this,args);};
   }
   const oldCTM=map.getScreenCTM,oldRect=map.getBoundingClientRect;
   map.getScreenCTM=()=>{throw Error('Zoom resolved SVG layout');};
   map.getBoundingClientRect=()=>{throw Error('Zoom measured CSS layout');};
   for(const name of ['createTexture','createBuffer','texStorage2D','texSubImage2D','bufferData','bufferSubData','getBufferSubData']){
    originals.set(name,gl[name]);gl[name]=()=>{throw Error('Zoom changed fixed GPU resources: '+name);};
   }
   try{
    for(let index=0;index<12;index++){
     const camera=mapViewport(),wheel=new WheelEvent('wheel',{clientX:camera.rect.left+camera.rect.width*.43,clientY:camera.rect.top+camera.rect.height*.57,deltaY:-100,cancelable:true});
     const client=new DOMPoint(wheel.clientX,wheel.clientY),anchor=client.matrixTransform(camera.inverse);
     map.dispatchEvent(wheel);flushRender();
     const after=client.matrixTransform(mapViewport().inverse);
     check(Math.hypot(after.x-anchor.x,after.y-anchor.y)*mapViewport().matrix.a<.01,'Wheel anchor moved: '+JSON.stringify({index,anchor,after,view,client,scale:mapViewport().matrix.a}));
     check(currentTime()===time,'Zoom changed replay time');check(!hasRenderingFailure(),'Camera paint failed');
    }
   }finally{map.getScreenCTM=oldCTM;map.getBoundingClientRect=oldRect;for(const [name,original] of originals)gl[name]=original;}
   check(Object.values(zoomCalls).every(count=>count===0),'Camera triggered scene/UI work: '+JSON.stringify(zoomCalls));
   check($('boatMarkers').firstElementChild===marker&&$('trackSpeedLegend').firstElementChild===legend,'Zoom rebuilt retained SVG');
   check(renderer.uploads===uploads&&buffers.every(([points,record])=>renderer.buffers.get(points)===record),'Zoom replaced track data');
   window.zoomTime=time;
   return {boats:boats.filter(boatIsDisplayed).length,steps:12,layoutReads:0,gpuUploads:0,scenePaints:0};
  });
  await page.waitForTimeout(230);
  const derived=await page.evaluate(()=>{
   const calls={...zoomCalls};restoreZoomProbe();
   if(currentTime()!==zoomTime||calls.updateTimeline!==1||calls.drawMap!==0||calls.updateVisibleBoats!==0)throw Error('Derived slider UI sought or repainted the scene: '+JSON.stringify(calls));
   const marker=$('boatMarkers').firstElementChild;setCurrentTime(currentTime()+.05,{fractional:true});render();
   if($('boatMarkers').firstElementChild!==marker)throw Error('Playback rebuilt retained boat markers');
   return calls;
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'firefox',zoom,derived,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
