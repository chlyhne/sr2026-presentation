const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));

(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18453/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const zoom=await page.evaluate(()=>{
   const check=(value,message)=>{if(!value)throw Error(message);};
   stopPlayback();consumeRenderRequest();$('wind').checked=$('rain').checked=false;
   setCurrentTime(D.start+43200);
   // Keep a real boat in the viewport throughout zoom; the default map centre
   // eventually zooms onto land and cannot exercise stable track-cache reuse.
   const position=displayBoatPosition(referenceBoat(),currentTime());check(position,'Reference boat is missing');
   const [x,y]=xy(position.point);view=[x-view[2]/2,y-view[3]/2,view[2],view[3]];setview();render();
   const renderer=webglTracks,cache=renderer.cache,gl=renderer.gl,before={...cache.stats},uploads=renderer.uploads;
   const buffers=[...renderer.buffers],prepare=renderer.prepareComparison;
   renderer.prepareComparison=()=>{throw Error('Zoom recalculated prepared comparison data');};
   const originalBuild=cache.build;cache.build=()=>{throw Error('Zoom built a disposable raster tile');};
   const originals=new Map();
   for(const name of ['createTexture','texStorage2D','bufferData','bufferSubData','getBufferSubData']){
    originals.set(name,gl[name]);gl[name]=()=>{throw Error('Zoom allocated or changed fixed GPU resources: '+name);};
   }
   try{
    for(let index=0;index<12;index++){
     const rect=$('map').getBoundingClientRect(),width=view[2];
     $('map').dispatchEvent(new WheelEvent('wheel',{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,deltaY:-100,cancelable:true}));
     check(view[2]<width,'Real wheel handler did not zoom');flushRender();
     // Full paints between wheel events must not trigger tile creation either.
     // Exercise both a duplicate scene paint and progressing playback time.
     requestRender();flushRender();
     setCurrentTime(currentTime()-.05,{fractional:true});requestRender();flushRender();
     check(!hasRenderingFailure(),'Zoom or interleaved playback failed');
    }
   }finally{renderer.prepareComparison=prepare;cache.build=originalBuild;for(const [name,original] of originals)gl[name]=original;}
   check(cache.stats.builds===before.builds&&cache.stats.bytes===before.bytes,'Continuous zoom grew the raster cache');
   check(renderer.uploads===uploads&&buffers.every(([points,record])=>renderer.buffers.get(points)===record),'Zoom replaced prepared track data');
   check(gl.getError()===gl.NO_ERROR,'WebGL error during zoom');
   window.zoomCacheBuilds=cache.stats.builds;
   return {boats:boats.filter(boatIsDisplayed).length,steps:12,interleavedFullPaints:24,newTiles:0,newAtlasBytes:0,settleMs:TRACK_CACHE_ZOOM_SETTLE_MS};
  });
  await page.waitForTimeout(zoom.settleMs+30);
  const stable=await page.evaluate(()=>{
   const check=(value,message)=>{if(!value)throw Error(message);};
   const renderer=webglTracks,cache=renderer.cache;
   check(renderer.render(currentTime(),renderer.order,true),'Stable scale render failed');
   const builds=cache.stats.builds-window.zoomCacheBuilds;
   check(builds>0,'Stable scale did not admit raster tiles: '+JSON.stringify({time:currentTime(),view,stats:cache.stats,buildAfter:cache.buildAfter,now:performance.now()}));
   const before={...cache.stats};check(renderer.render(currentTime()+.05,renderer.order,true),'Stable playback render failed');
   check(cache.stats.builds===before.builds&&cache.stats.hits>before.hits,'Stable playback did not reuse raster tiles');
   check(!hasRenderingFailure(),'Stable playback failed');
   return {builtAfterSettling:builds,reused:cache.stats.hits-before.hits};
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'firefox',zoom,stable,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
