// Data-only 20 Mbit/s startup benchmark of the actual app, headless Firefox PC.
// Only source.bin.gz is rate limited. Metadata, code, maps and weather stay local.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
const root=path.resolve(__dirname,'..'),upstream=process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'viewer/track-profiles/manifest.json'),'utf8'));
const source=fs.readFileSync(path.join(root,'viewer',manifest.replayFile)),bitsPerSecond=20000000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)));
(async()=>{
 const proxy=http.createServer(async(request,response)=>{
  try{
   if(new URL(request.url,upstream).pathname.endsWith('/source.bin.gz')){
    response.writeHead(200,{'Content-Type':'application/gzip','Content-Length':source.length,'Cache-Control':'no-store'});
    const start=performance.now(),chunkSize=32768;
    for(let offset=0;offset<source.length;offset+=chunkSize){
     const end=Math.min(source.length,offset+chunkSize);await sleep((end*8/bitsPerSecond)*1000-(performance.now()-start));
     if(response.destroyed)return;response.write(source.subarray(offset,end));
    }
    response.end();return;
   }
   const result=await fetch(new URL(request.url,upstream)),body=Buffer.from(await result.arrayBuffer());
   response.writeHead(result.status,{'Content-Type':result.headers.get('content-type')||'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-store'});response.end(body);
  }catch(error){if(!response.headersSent)response.writeHead(500);response.end(error.message);}
 });
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 const browser=await firefox.launch({headless:true}),runs=[];
 try{
  for(let run=0;run<3;run++){
   const context=await browser.newContext({viewport:{width:1500,height:1000}}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/gpu-track-preparation.js',async route=>{
    const result=await route.fetch(),code=await result.text();
    await route.fulfill({contentType:'text/javascript',body:code+`
window.startupBenchmark={compileMs:0,prepareMs:0};
for(const [method,key] of [['program','compileMs'],['prepare','prepareMs']]){
 const original=GPUTrackPreparation.prototype[method];
 GPUTrackPreparation.prototype[method]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{startupBenchmark[key]+=performance.now()-t;}};
}
const benchmarkReady=GPUTrackPreparation.prototype.ready;
GPUTrackPreparation.prototype.ready=async function(){await benchmarkReady.call(this);startupBenchmark.dataReadyAt??=performance.now();};
`});
   });
   await page.goto('http://127.0.0.1:'+proxy.address().port+'/');await page.waitForSelector('main:not([inert])',{timeout:120000});
   const result=await page.evaluate(async()=>{
    stopPlayback();$('wind').checked=$('rain').checked=false;chosen.clear();for(const boat of boats)chosen.add(boat.name);boatFavouritesOnly=true;
    selectedTime=D.start+43200;render();await webglTracks.preparation.ready();
    const end=performance.now(),resource=performance.getEntriesByType('resource').find(r=>r.name.endsWith('/source.bin.gz'));
    if(!resource||webglTracks.buffers.size!==boats.length)throw Error('Incomplete benchmark data');
    return {boats:boats.length,points:boats.reduce((n,b)=>n+b.points.length,0),renderer:webglTracks.renderer,transferMs:resource.responseEnd-resource.startTime,
     shaderCompilationMs:startupBenchmark.compileMs,boatPreparationMs:startupBenchmark.prepareMs,
     requestToGPUDataMs:startupBenchmark.dataReadyAt-resource.startTime,requestToFleetFrameMs:end-resource.startTime};
   });
   assert.deepEqual(errors,[]);assert.ok(result.transferMs>=source.length*8/bitsPerSecond*1000-20);runs.push(result);console.log(JSON.stringify({run:run+1,...result}));
   await context.close();
  }
  const median=key=>runs.map(r=>r[key]).sort((a,b)=>a-b)[1];
  const report={date:new Date().toISOString(),browser:'Firefox headless PC',sourceBytes:source.length,bitsPerSecond,scope:'Only source.bin.gz is rate limited; other assets are local. Fresh contexts; driver shader cache may be warm.',
   medianRequestToGPUDataMs:median('requestToGPUDataMs'),medianRequestToFleetFrameMs:median('requestToFleetFrameMs'),runs};
  if(process.env.SR_BENCHMARK_REPORT)fs.writeFileSync(process.env.SR_BENCHMARK_REPORT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
 }finally{await browser.close();proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
