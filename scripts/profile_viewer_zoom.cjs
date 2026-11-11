const path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));

(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18453/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const result=await page.evaluate(async()=>{
   stopPlayback();consumeRenderRequest();
   $('wind').checked=$('rain').checked=false;
   setCurrentTime(D.start+43200);render();
   const functions=new Map(),restores=[],stack=[];
   const wrap=(object,key,name=key)=>{
    const original=object[key];
    object[key]=function(...args){
     const entry={start:performance.now(),children:0};stack.push(entry);
     try{return original.apply(this,args);}finally{
      const elapsed=performance.now()-entry.start;stack.pop();
      if(stack.length)stack.at(-1).children+=elapsed;
      const record=functions.get(name)||{calls:0,total:0,self:0,max:0};
      record.calls++;record.total+=elapsed;record.self+=elapsed-entry.children;record.max=Math.max(record.max,elapsed);functions.set(name,record);
     }
    };
    restores.push(()=>{object[key]=original;});
   };
   for(const name of ['setview','updateTimeline','drawMap','drawViewport','renderWindArrows','renderTraffic','renderMilitary','resizeSymbols','renderAnnotations','renderMapCredit','updateVisibleBoats','mapViewport'])wrap(window,name);
   wrap(webglTracks,'render','tracks.render');wrap(webglBackground,'render','background.render');
   wrap(webglTracks.cache,'build','cache.build');
   const frame=()=>new Promise(requestAnimationFrame),samples=[],before={...webglTracks.cache.stats};
   const gl=webglTracks.gl;gl.finish();
   try{
    for(let index=0;index<20;index++){
     await frame();
     const rect=$('map').getBoundingClientRect(),start=performance.now();
     $('map').dispatchEvent(new WheelEvent('wheel',{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,deltaY:index<12?-100:100,cancelable:true}));
     const event=performance.now()-start,paintStart=performance.now();flushRender();const paint=performance.now()-paintStart;
     const waitStart=performance.now();gl.finish();
     samples.push({event,paint,gpuWait:performance.now()-waitStart});
    }
    const summary=key=>{const sorted=samples.map(s=>s[key]).sort((a,b)=>a-b);return {mean:sorted.reduce((a,b)=>a+b,0)/sorted.length,p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)};};
    return {browser:'firefox',userAgent:navigator.userAgent,gpu:webglTracks.renderer,boats:boats.filter(boatIsDisplayed).length,steps:samples.length,event:summary('event'),paint:summary('paint'),gpuWait:summary('gpuWait'),functions:[...functions].map(([name,value])=>({name,...value})).sort((a,b)=>b.self-a.self),cache:Object.fromEntries(Object.entries(webglTracks.cache.stats).map(([name,value])=>[name,value-before[name]])),renderingErrors:[...renderingErrors]};
   }finally{for(const restore of restores.reverse())restore();}
  });
  console.log(JSON.stringify({...result,errors}));
  if(errors.length||result.renderingErrors.length)throw Error('Zoom profiling encountered rendering errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
