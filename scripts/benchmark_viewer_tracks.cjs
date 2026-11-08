// Use a real display/GPU by default. Headless Chromium often uses SwiftShader.
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await chromium.launch({headless:process.env.SR_HEADLESS==='1'});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  await page.addInitScript(()=>window.SR_TRACK_RENDERER='webgl');
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForFunction(()=>typeof captureMap==='function');
  const result=await page.evaluate(async()=>{
   if(!webglTracks.active)throw Error(webglTracks.error);
   $('wind').checked=$('rain').checked=false;chosen.clear();for(const boat of boats)chosen.add(boat.name);
   prepareSelectedTracks();
   const initialMemoryMB=[...webglTracks.buffers.values()].reduce((sum,b)=>sum+b.bytes,0)/1e6;
   const output=[];
   for(const renderer of ['webgl','svg']){
    webglTracks.active=renderer==='webgl';webglTracks.host.setAttribute('display',webglTracks.active?'inline':'none');
    for(const offset of [14400,43200]){
     selectedTime=D.start+offset;render();
     // Warm the entire tested window before recording either implementation.
     selectedTime=D.start+offset+400;render();
     const times=[],frames=[];
     for(let i=0;i<20;i++){
      await new Promise(requestAnimationFrame);selectedTime=D.start+offset+i*40;
      const start=performance.now();render();times.push(performance.now()-start);
      // Two RAFs include submission, painting and presentation of this update.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      frames.push(performance.now()-start);
     }
     const sorted=[...times].sort((a,b)=>a-b);
     output.push({renderer,hour:offset/3600,meanRenderMs:times.reduce((a,b)=>a+b)/times.length,p95RenderMs:sorted[Math.floor(sorted.length*.95)],meanThroughPaintMs:frames.reduce((a,b)=>a+b)/frames.length,paths:$('routes').querySelectorAll('path').length});
    }
   }
   return {gpu:webglTracks.renderer,boats:chosen.size,staticBufferMB:initialMemoryMB,output};
  });
  console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
