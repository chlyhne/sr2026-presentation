const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  // Desktop Firefox with a dense display; this does not emulate an iPhone.
  const page=await browser.newPage({viewport:{width:1200,height:850},deviceScaleFactor:3}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const check=()=>page.evaluate(()=>{
   stopPlayback();render();webglTracks.render(currentTime(),webglTracks.order,true);webglBackground.render(true);
   if(devicePixelRatio!==3)throw Error('Dense display not configured');
   if(hasRenderingFailure()||!webglTracks.active||!webglBackground.active)throw Error('Rendering failed');
   const {rect}=mapViewport(),expected=[Math.round(rect.width*2),Math.round(rect.height*2)];
   const layers=[webglBackground.host,$('mapBase'),webglTracks.host,$('map')];
   if($('mapSurface').querySelector('foreignObject canvas'))throw Error('Accelerated canvas embedded in SVG');
   if($('mapBase').getAttribute('viewBox')!==$('map').getAttribute('viewBox'))throw Error('SVG cameras disagree');
   for(const [index,layer] of layers.entries()){
    if(layer.parentNode!==$('mapSurface')||+getComputedStyle(layer).zIndex!==index)throw Error('Incorrect WebGL/SVG stacking order');
    const bounds=layer.getBoundingClientRect();
    if(['left','top','width','height'].some(key=>Math.abs(bounds[key]-rect[key])>.1))throw Error('Map layer viewport mismatch');
   }
   for(const renderer of [webglTracks,webglBackground]){
    if(renderer.canvas.width!==expected[0]||renderer.canvas.height!==expected[1])throw Error('Unbounded drawing buffer');
    if(renderer.gl.drawingBufferWidth!==expected[0]||renderer.gl.drawingBufferHeight!==expected[1]||renderer.gl.getError())throw Error('Drawing buffer unavailable');
   }
   return {css:[rect.width,rect.height],pixels:expected,uploads:webglTracks.uploads,layers:layers.length,
    trackBytes:[...webglTracks.buffers.values()].reduce((sum,record)=>sum+record.bytes,0),
    backgroundBytes:Object.values(webglBackground.geometry).reduce((sum,mesh)=>sum+mesh.vertices.byteLength+mesh.indices.byteLength,0),
    tracks:webglTracks.states.map(state=>({name:state.boat.name,intervals:state.last-state.first,caps:state.record.capCount,subdivisions:webglTracks.subdivisions(state.record,mapViewport())}))};
  });
  const initial=await check();
  await page.setViewportSize({width:1500,height:1000});
  const resized=await check();
  assert.notDeepEqual(initial.css,resized.css);assert.equal(resized.uploads,initial.uploads);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'firefox',deviceScaleFactor:3,initial,resized,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
