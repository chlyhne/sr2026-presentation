const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.join(os.tmpdir(),'sr2026-test-tools'),path.join(os.homedir(),'AppData/Local/Temp/sr2026-test-tools')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18516/events/sjaelland-rundt-2026/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const results=await page.evaluate(()=>{
   stopPlayback();const bg=webglBackground,gl=bg.gl;
   if(!bg.active)throw Error(bg.error);
   bg.layers=bg.layers.filter(layer=>layer.id==='bridge-deck-area');gridEnabled=false;
   const uploads=bg.uploads,results=[];
   for(const feature of window.SR_BRIDGE_FEATURES.filter(f=>f.properties.source_kind==='deck'&&f.properties.bridge.startsWith('storebaelt-'))){
    const ring=feature.geometry.coordinates[0],n=(ring.length-1)/2;
    const average=(a,b)=>a.map((v,i)=>(v+b[i])/2);
    const a=average(ring[0],ring[1]),b=average(ring[2*n-1],ring[2*n-2]),centre=average(a,b);
    for(const span of [400,200]){
     const c=xy(centre),width=span*MAP_GRID_UNITS_PER_METER[0],height=span*MAP_GRID_UNITS_PER_METER[1];
     view=[c[0]-width/2,c[1]-height/2,width,height];setview();bg.render(true);
     const {rect,matrix}=mapViewport();
     const pixel=fraction=>{
      const point=a.map((v,i)=>v+(b[i]-v)*fraction),p=new DOMPoint(...xy(point)).matrixTransform(matrix),rgba=new Uint8Array(4);
      gl.readPixels(Math.floor((p.x-rect.left)/rect.width*gl.drawingBufferWidth),gl.drawingBufferHeight-1-Math.floor((p.y-rect.top)/rect.height*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
      return [...rgba];
     };
     for(const fraction of [.1,.5,.9])if(pixel(fraction)[3]<250)throw Error('Deck not filled across its metre width: '+feature.id);
     for(const fraction of [-.2,1.2])if(pixel(fraction)[3]>5)throw Error('Deck wider than geographic footprint: '+feature.id);
     results.push({bridge:feature.properties.bridge,width:feature.properties.deck_width_metres,viewMetres:span});
    }
   }
   if(bg.uploads!==uploads)throw Error('Zoom rebuilt background buffers');
   if(gl.getError()!==0)throw Error('WebGL error');return results;
  });
  assert.equal(results.length,4);assert.deepEqual(errors,[]);console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
