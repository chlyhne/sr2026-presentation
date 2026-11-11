const path=require('node:path');
const fs=require('node:fs');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));

(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18453/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const environment=await page.evaluate(()=>{
   stopPlayback();consumeRenderRequest();
   const gl=webglTracks.gl,info=gl.getExtension('WEBGL_debug_renderer_info');
   return {userAgent:navigator.userAgent,boats:boats.length,displayed:boats.filter(boatIsDisplayed).length,
    renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
    gpuTimer:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),view:[...view],
    trackLengthSeconds,comparison:{...comparison},wind:$('wind').checked,rain:$('rain').checked,
    listOpen:!$('visibleBoatsPanel').hidden,canvas:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
  });
  await page.evaluate(instrument=>{
   const records=new Map(),stack=[];
   const wrap=(object,key,name=key)=>{
    const original=object[key];
    if(typeof original!=='function')throw Error('Missing profiling target: '+name);
    object[key]=function(...args){
     const entry={start:performance.now(),children:0};stack.push(entry);
     try{return original.apply(this,args);}finally{
      const elapsed=performance.now()-entry.start;stack.pop();
      if(stack.length)stack[stack.length-1].children+=elapsed;
      let record=records.get(name);if(!record){record={calls:0,total:0,self:0,max:0,samples:[]};records.set(name,record);}
      record.calls++;record.total+=elapsed;record.self+=elapsed-entry.children;record.max=Math.max(record.max,elapsed);record.samples.push(elapsed);
     }
    };
    return ()=>{object[key]=original;};
   };
   if(instrument){
    for(const name of ['advancePlayback','setCurrentTime','drawMap','renderWindField','renderRadar','status','renderWindArrows','renderTraffic','renderMilitary','renderTracks','renderAnnotations','renderNavigation','renderMapCredit','resizeSymbols','resizeBoatIcons','updateVisibleBoats','highlightVisibleBoat','mapViewport','trackSpeedLegendLayout','centerPlaybackOnReferenceBoat','setview','updateTimeline','visibleBoatRanges'])wrap(window,name);
    wrap(webglTracks,'render','tracks.render');wrap(webglBackground,'render','background.render');
    wrap(SVGGraphicsElement.prototype,'getScreenCTM','DOM.getScreenCTM');
    wrap(Element.prototype,'getBoundingClientRect','DOM.getBoundingClientRect');
   }
   const intervals=[],frames=[],mutations={added:0,removed:0,attributes:0};let active=false,lastRaf=0,lastDraw=0;
   const draw=drawMap;
   drawMap=function(...args){if(active){const now=performance.now();if(lastDraw)frames.push(now-lastDraw);lastDraw=now;}return draw(...args);};
   const observer=new MutationObserver(entries=>{if(active)for(const entry of entries){mutations.added+=entry.addedNodes.length;mutations.removed+=entry.removedNodes.length;if(entry.type==='attributes')mutations.attributes++;}});
   if(instrument)observer.observe($('map'),{subtree:true,childList:true,attributes:true});
   function raf(now){if(active&&lastRaf)intervals.push(now-lastRaf);lastRaf=now;requestAnimationFrame(raf);}requestAnimationFrame(raf);
   const summary=values=>{
    const sorted=[...values].sort((a,b)=>a-b),sum=sorted.reduce((total,value)=>total+value,0);
    return {count:sorted.length,mean:sum/(sorted.length||1),p50:sorted[Math.floor(sorted.length*.5)]||0,p95:sorted[Math.floor(sorted.length*.95)]||0,p99:sorted[Math.floor(sorted.length*.99)]||0,max:sorted.at(-1)||0,over75ms:sorted.filter(value=>value>75).length};
   };
   let trackStart;
   window.playbackProfiler={wrap,begin(){records.clear();intervals.length=frames.length=0;lastRaf=lastDraw=0;mutations.added=mutations.removed=mutations.attributes=0;trackStart={...webglTracks.stats};active=true;},end(){active=false;return {functions:[...records].map(([name,value])=>({name,calls:value.calls,total:value.total,self:value.self,max:value.max,p95:summary(value.samples).p95})).sort((a,b)=>b.self-a.self),raf:summary(intervals),frames:summary(frames),mutations:{...mutations},tracks:Object.fromEntries(Object.entries(webglTracks.stats).map(([name,value])=>[name,value-trackStart[name]]))};}};
  },process.env.SR_PROFILE_INSTRUMENT!=='0');
  const duration=Number(process.env.SR_PROFILE_MS||8000),cases=[];
  for(const name of (process.env.SR_PROFILE_CASES||'normal,no-weather,no-markers,no-tracks,gpu-finish,follow-reference').split(',')){
   await page.evaluate(name=>{
    stopPlayback();consumeRenderRequest();
    if(window.restoreProfileCase)window.restoreProfileCase();
    const restores=[];
    $('wind').checked=name==='normal';$('rain').checked=false;
    boatFavouritesOnly=false;boatSearchQuery='';
    setCurrentTime(D.start+43200,{fractional:true,allowOutsideVisibleRanges:true});
    $('playbackSpeed').value='100';
    if(name==='no-markers'){
     const original=renderTracks;
     renderTracks=function(time){webglTracks.render(time,boats.filter(boatIsDisplayed));};
     restores.push(()=>{renderTracks=original;});
     $('boatMarkers').replaceChildren();
    }
    if(name==='no-tracks'){
     const original=webglTracks.render;webglTracks.render=()=>true;
     webglTracks.gl.clear(webglTracks.gl.COLOR_BUFFER_BIT);
     restores.push(()=>{webglTracks.render=original;});
    }
    if(name==='gpu-finish'){
     const gl=webglTracks.gl,original=webglTracks.render;
     restores.push(playbackProfiler.wrap(gl,'finish','GPU.finishWait'));
     webglTracks.render=function(...args){const result=original.apply(this,args);gl.finish();return result;};
     restores.push(()=>{webglTracks.render=original;});
    }
    window.restoreProfileCase=()=>{for(const restore of restores.reverse())restore();};
    render();
    if(name==='follow-reference'){
     const target={time:D.start+86400,text:'Profiling target'};notes.push(target);
     restores.push(()=>{notes.splice(notes.indexOf(target),1);});
     startPlayback({target});
    }else startPlayback();
   },name);
   await page.waitForTimeout(2000);
   await page.evaluate(()=>playbackProfiler.begin());
   await page.waitForTimeout(duration);
   const result=await page.evaluate(()=>{
    const result=playbackProfiler.end();result.playing=interval!==null;result.time=currentTime();
    result.renderingErrors=[...renderingErrors];stopPlayback();return result;
   });
   cases.push({name,duration,...result});
   console.log(JSON.stringify(cases.at(-1)));
  }
  await page.evaluate(()=>{stopPlayback();consumeRenderRequest();window.restoreProfileCase();});
  const gpu=process.env.SR_PROFILE_SKIP_GPU==='1'?[]:await page.evaluate(async()=>{
   $('wind').checked=$('rain').checked=false;
   const gl=webglTracks.gl,results=[],originalDraw=gl.drawArraysInstanced;
   const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
   for(const tail of [900,7200,0]){
    trackLengthSeconds=tail;
    for(const relative of [false,true]){
     comparison={enabled:relative,basis:'absolute',boatColour:false};
     let instances=0,vertices=0,draws=0;
     gl.drawArraysInstanced=function(mode,first,count,instanceCount){instances+=instanceCount;vertices+=count*instanceCount;draws++;return originalDraw.apply(this,arguments);};
     const submit=[],wait=[];
     try{
      gl.finish();
      for(let index=0;index<10;index++){
       await frame();
       const start=performance.now();
       if(!webglTracks.render(D.start+43200+index*10,boats,true))throw Error(webglTracks.error);
       const submitted=performance.now();gl.finish();
       if(index>=2){submit.push(submitted-start);wait.push(performance.now()-submitted);}
      }
     }finally{gl.drawArraysInstanced=originalDraw;}
     results.push({tail,relative,drawsPerFrame:draws/10,instancesPerFrame:instances/10,verticesPerFrame:vertices/10,
      submitMs:submit.reduce((total,value)=>total+value,0)/submit.length,finishWaitMs:wait.reduce((total,value)=>total+value,0)/wait.length});
    }
   }
   return results;
  });
  const report={environment,instrumented:process.env.SR_PROFILE_INSTRUMENT!=='0',cases,gpu,errors};
  if(process.env.SR_PROFILE_OUTPUT)fs.writeFileSync(process.env.SR_PROFILE_OUTPUT,JSON.stringify(report,null,2));
  console.log(JSON.stringify({environment,gpu,errors}));
  if(errors.length||cases.some(result=>result.renderingErrors.length||!result.playing))throw Error('Playback profiling encountered an application error');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
