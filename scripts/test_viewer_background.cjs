const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('events/sjaelland-rundt-2026/',process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/').href);await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.evaluate(()=>{
   if(!webglBackground.active)throw Error(webglBackground.error);
   chosen.clear();notes=[];
   for(const id of ['winds','trafficSeparation','militaryAreas','routeT','courseLines','routes','boatMarkers','places','seamarks','speedMarkers','noteDrawings','drawingPreview','annotations','mapCredit','trackSpeedLegend'])$(id).setAttribute('visibility','hidden');
  });
  await page.evaluate(async()=>{
   if(document.fullscreenElement)await document.exitFullscreen();
   view=[230,250,620,760];$('grid').checked=false;$('rain').checked=true;setview();render();
   visibleTimeRanges=[];renderRadar(1781164800);await radarReady;await radarImageBuffer.paintReady;flushRender();
  });
  // Both radar textures are prepared before exercising pan/zoom; there
  // must be no geometry allocation or image upload while moving the camera.
  await page.waitForFunction(()=>radarImageBuffer.back?.ready);
  const stats=await page.evaluate(()=>{
   const bg=webglBackground,uploads=bg.uploads,textures=bg.textureUploads,geometry=bg.geometry;
   for(let i=0;i<8;i++){view=[view[0]+.05,view[1]+.1,view[2]*.99,view[3]*.99];setview();flushRender();}
   if(bg.geometry!==geometry||bg.uploads!==uploads||bg.textureUploads!==textures)throw Error('Pan/zoom rebuilt background resources');
   if($('land').children.length||$('coast').children.length)throw Error('SVG background geometry retained');
   for(const layer of bg.layers)if(layer.buffer){
    if(!bg.weatherSlots.get(layer.buffer.id).some(s=>s.entry===layer.buffer.front))throw Error('Prefetch overwrote the displayed texture');
   }
   return {uploads,textures};
  });
  // A prepared weather swap selects a texture synchronously and never clears
  // the displayed image while waiting for a future frame.
  await page.evaluate(()=>{
   renderRadar(1781165400);flushRender();
   if(!webglBackground.weatherSlots.get(radarImageBuffer.id).some(s=>s.entry===radarImageBuffer.front))throw Error('Swapped to an unprepared texture');
  });
  const holes=await page.evaluate(async()=>{
   const bg=webglBackground,layer=bg.layers.find(l=>l.id==='land'),originalMesh=layer.mesh,originalView=[...view];
   const coastVisibility=$('coast').getAttribute('visibility');
   const point=(x,y)=>[9.5+x*4.5/1000,57-y*3/1180];
   const polygon={rings:[[[200,200],[400,200],[400,400],[200,400],[200,200]],[[260,260],[340,260],[340,340],[260,340],[260,260]]].map(r=>r.map(p=>point(...p))),west:10,east:12,south:55,north:57};
   layer.mesh=bg.mesh(prepareBackgroundGeometry([polygon],[]).land,4);$('coast').setAttribute('visibility','hidden');
   const image=colour=>{const c=document.createElement('canvas');c.width=c.height=1;c.getContext('2d').fillStyle=colour;c.getContext('2d').fillRect(0,0,1,1);return c.toDataURL();};
   try{
    const red=radarImageBuffer.prepare('test-red',()=>image('red'));
    await red.promise;radarImageBuffer.display('test-red');
    view=[180,180,240,240];$('map').setAttribute('viewBox',view.join(' '));
    const pixel=(x,y)=>{
     const {rect,matrix}=mapViewport(),p=new DOMPoint(x,y).matrixTransform(matrix),gl=bg.gl,out=new Uint8Array(4);
     gl.readPixels(Math.floor((p.x-rect.left)/rect.width*gl.drawingBufferWidth),gl.drawingBufferHeight-1-Math.floor((p.y-rect.top)/rect.height*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);return [...out];
    };
    const verify=(x,y,rgba)=>{const actual=pixel(x,y);if(rgba.some((v,i)=>Math.abs(actual[i]-v)>2))throw Error('Layer/land hole mismatch: '+JSON.stringify({actual,rgba}));};
    bg.render(true);
    verify(190,300,[191,0,0,191]);verify(220,300,[238,50,51,255]);verify(300,300,[191,0,0,191]);
    const green=radarImageBuffer.prepare('test-green',()=>image('lime'));await green.promise;
    bg.render(true);verify(300,300,[191,0,0,191]);
    radarImageBuffer.display('test-green');bg.render(true);verify(300,300,[0,191,0,191]);
    return true;
   }finally{
    layer.mesh=originalMesh;view=originalView;$('map').setAttribute('viewBox',view.join(' '));
    if(coastVisibility===null)$('coast').removeAttribute('visibility');else $('coast').setAttribute('visibility',coastVisibility);
    radarKey=null;render();await radarReady;await radarImageBuffer.paintReady;flushRender();
   }
  });assert.equal(holes,true);
  const lost=await page.evaluate(()=>{
   window.backgroundLoss=webglBackground.gl.getExtension('WEBGL_lose_context');if(!backgroundLoss)return false;backgroundLoss.loseContext();return true;
  });
  if(lost){
   await page.waitForFunction(()=>!webglBackground.active&&hasRenderingFailure());
   await page.evaluate(()=>backgroundLoss.restoreContext());await page.waitForFunction(()=>webglBackground.active&&webglBackground.draws>1);
   assert.equal(await page.evaluate(()=>webglBackground.gl.getError()),0);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:type.name(),...stats,checks:'nominal land holes, weather layer order, fixed buffers/textures, protected prefetch, prepared swaps, explicit context failure and recovery',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
