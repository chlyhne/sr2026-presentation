const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/';
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForSelector('main:not([inert])',{timeout:120000});
  assert.equal(await page.evaluate(()=>webglTracks.active&&webglBackground.active&&!hasRenderingFailure()),true);
  assert.equal(await page.locator('#capture').count(),0);
  assert.equal(await page.locator('#captureStatus').count(),0);
  assert.equal(await page.evaluate(()=>typeof captureMap),'undefined');
  assert.equal(await page.evaluate(()=>typeof webglTracks.snapshot),'undefined');
  assert.equal(await page.evaluate(()=>typeof webglBackground.snapshot),'undefined');
  const sample=await page.evaluate(()=>{
   chosen.clear();$('wind').checked=$('rain').checked=false;
   for(const id of ['winds','trafficSeparation','militaryAreas','routeT','courseLines','boatMarkers','places','seamarks','speedMarkers','noteDrawings','drawingPreview','annotations','mapCredit','trackSpeedLegend'])$(id).setAttribute('visibility','hidden');
   render();webglBackground.render(true);
   const {gl,canvas}=webglBackground,raw=new Uint8Array(canvas.width*canvas.height*4);
   gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,raw);
   const land=(x,y)=>{const n=(y*canvas.width+x)*4;return raw[n]===189&&raw[n+1]===199&&raw[n+2]===203&&raw[n+3]===255;};
   let sample;
   for(let y=20;!sample&&y<canvas.height-20;y+=5)for(let x=20;x<canvas.width-20;x+=5)if(land(x,y)&&land(x-3,y)&&land(x+3,y)&&land(x,y-3)&&land(x,y+3)){sample={x,y,width:canvas.width,height:canvas.height};break;}
   return sample;
  });
  assert.ok(sample,'Nominal background draws the land');
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
   await failed.goto(base);await failed.locator('#viewerLoadingError').waitFor({state:'visible',timeout:120000});
   assert.equal(await failed.locator('#viewerLoadingError').isVisible(),true);
   assert.match(await failed.locator('#viewerLoadingError').textContent(),/WebGL 2/);
   assert.equal(await failed.locator('main').evaluate(node=>node.inert),true);
   assert.match(await failed.locator('#renderingErrorDetails').textContent(),/WebGL 2/);
   assert.equal(await failed.locator('#map').isVisible(),false);
   await failed.evaluate(()=>updateTimeline());
   assert.equal(await failed.locator('#play').isEnabled(),false);
   await failed.evaluate(()=>startPlayback());assert.equal(await failed.evaluate(()=>!!interval),false);
   assert.equal(await failed.locator('#land path,#coast path,[data-software-tracks]').count(),0);
   assert.deepEqual(failErrors,[]);await failed.close();
  }
  console.log(JSON.stringify({browser:'firefox',checks:'nominal WebGL for background/tracks, removed PNG export controls and APIs, missing WebGL on either layer, explicit errors, blocked playback, context loss and same-path recovery, no alternate video rendering',errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
