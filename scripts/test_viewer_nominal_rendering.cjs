const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/';
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850},acceptDownloads:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  assert.equal(await page.evaluate(()=>webglTracks.active&&webglBackground.active&&!hasRenderingFailure()),true);
  // PNG must contain the nominal GPU background, not a separately drawn SVG map.
  const sample=await page.evaluate(()=>{
   chosen.clear();$('wind').checked=$('rain').checked=false;
   for(const id of ['winds','trafficSeparation','militaryAreas','routeT','courseLines','boatMarkers','places','seamarks','speedMarkers','noteDrawings','drawingPreview','annotations','mapCredit','trackSpeedLegend'])$(id).setAttribute('visibility','hidden');
   render();webglBackground.render(true);
   const {gl,canvas}=webglBackground,raw=new Uint8Array(canvas.width*canvas.height*4);
   gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,raw);
   const land=(x,y)=>{const n=(y*canvas.width+x)*4;return raw[n]===189&&raw[n+1]===199&&raw[n+2]===203&&raw[n+3]===255;};
   let sample;
   for(let y=20;!sample&&y<canvas.height-20;y+=5)for(let x=20;x<canvas.width-20;x+=5)if(land(x,y)&&land(x-3,y)&&land(x+3,y)&&land(x,y-3)&&land(x,y+3)){sample={x,y,width:canvas.width,height:canvas.height};break;}
   const serialize=XMLSerializer.prototype.serializeToString;
   XMLSerializer.prototype.serializeToString=function(node){const xml=serialize.call(this,node);window.nominalExportSVG=xml;return xml;};
   return sample;
  });
  assert.ok(sample,'Nominal background draws the land');
  const download=page.waitForEvent('download');await page.evaluate(()=>captureMap());
  const png=fs.readFileSync(await(await download).path()).toString('base64');
  const exported=await page.evaluate(async({png,sample})=>{
   const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
   const context=canvas.getContext('2d');context.drawImage(image,0,0);
   const x=Math.floor((sample.x+.5)*canvas.width/sample.width),y=Math.floor((sample.height-sample.y-.5)*canvas.height/sample.height);
   const doc=new DOMParser().parseFromString(nominalExportSVG,'image/svg+xml');
   return {pixel:[...context.getImageData(x,y,1,1).data],layers:[...doc.querySelectorAll('[data-render-layer]')].map(node=>node.getAttribute('data-render-layer')),svgLand:doc.querySelectorAll('#land path,#coast path').length};
  },{png,sample});
  assert.deepEqual(exported.pixel,[189,199,203,255]);assert.deepEqual(exported.layers,['background','tracks']);assert.equal(exported.svgLand,0);
  // Losing either context must hide the whole map and show its cause, with no substitution.
  for(const name of ['webglTracks','webglBackground']){
   const available=await page.evaluate(name=>{
    const renderer=name==='webglTracks'?webglTracks:webglBackground;
    window.nominalContext=renderer.gl.getExtension('WEBGL_lose_context');
    if(!nominalContext)return false;nominalContext.loseContext();return true;
   },name);
   assert.ok(available,'Context-loss extension is available');
   await page.waitForFunction(()=>hasRenderingFailure()&&!$('renderingError').hidden);
   assert.equal(await page.locator('#map').isVisible(),false);assert.equal(await page.locator('#play').isEnabled(),false);
   assert.equal(await page.locator('#land path,#coast path,[data-software-tracks]').count(),0);
   await page.evaluate(()=>nominalContext.restoreContext());
   await page.waitForFunction(()=>webglTracks.active&&webglBackground.active&&!hasRenderingFailure());
   assert.equal(await page.locator('#map').isVisible(),true);
  }
  // No full-viewport video substitution when the nominated fullscreen path is unavailable.
  await page.route('https://www.youtube-nocookie.com/embed/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Video test</title>'}));
  await page.evaluate(()=>{
   notes=[{time:D.start+3600,text:'Video',video:parseYouTubeVideo('https://youtu.be/M7lc1UVf-VE')}];showNotes();restoreNote(notes[0]);
   Object.defineProperty(document,'fullscreenEnabled',{value:false,configurable:true});
  });
  await page.locator('#eventVideoButton').click();assert.equal(await page.locator('#eventVideoOverlay').isVisible(),false);
  assert.match(await page.locator('#eventVideoStatus').textContent(),/kræver fuld skærm/);
  await page.evaluate(()=>{delete document.fullscreenEnabled;$('eventVideoOverlay').requestFullscreen=()=>Promise.reject(Error('Afvist i test'));});
  await page.locator('#eventVideoButton').click();
  await page.waitForFunction(()=>$('eventVideoStatus').textContent.includes('Afvist i test'));
  assert.equal(await page.locator('#eventVideoOverlay').isVisible(),false);assert.equal(await page.locator('#eventVideoPlayer iframe').count(),0);
  assert.deepEqual(errors,[]);await page.close();
  // Initialization failures on either layer are explicit and block export.
  for(const blocked of ['background','tracks','all']){
   const failed=await browser.newPage({viewport:{width:1200,height:850}}),failErrors=[];
   failed.on('pageerror',error=>failErrors.push(error.message));
   await failed.addInitScript(blocked=>{
    const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(kind,...args){
     if(kind==='webgl2'&&(blocked==='all'||this.closest('[data-webgl-'+blocked+']')))return null;
     return get.call(this,kind,...args);
    };
   },blocked);
   await failed.goto(base);await failed.waitForFunction(()=>document.querySelector('#onlineStatus'));
   assert.equal(await failed.locator('#renderingError').isVisible(),true);
   assert.match(await failed.locator('#renderingErrorDetails').textContent(),/WebGL 2/);
   assert.equal(await failed.locator('#map').isVisible(),false);
   await failed.evaluate(()=>updateTimeline());
   assert.equal(await failed.locator('#play').isEnabled(),false);
   await failed.evaluate(()=>startPlayback());assert.equal(await failed.evaluate(()=>!!interval),false);
   assert.equal(await failed.locator('#land path,#coast path,[data-software-tracks]').count(),0);
   await failed.evaluate(()=>captureMap());assert.match(await failed.locator('#captureStatus').textContent(),/WebGL 2/);
   assert.deepEqual(failErrors,[]);await failed.close();
  }
  console.log(JSON.stringify({browser:'firefox',checks:'nominal WebGL for background/tracks/PNG, missing WebGL on either layer, explicit errors, blocked export/playback, context loss and same-path recovery, no alternate video rendering',errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
