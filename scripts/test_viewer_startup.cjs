const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   window.sourcePreparationJobs=0;window.Worker=class{constructor(){sourcePreparationJobs++;throw Error('Build artifacts must not start a worker');}};
   const extension=WebGL2RenderingContext.prototype.getExtension;
   WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_color_buffer_float'?null:extension.call(this,name);};
   WebGL2RenderingContext.prototype.beginTransformFeedback=()=>{throw Error('Preparation must not execute on GPU');};
  });
  await page.route('**/timeline.js' ,async route=>{
   await page.evaluate(()=>{if(webglBackground.gl||webglTracks.gl)throw Error('WebGL context created before CPU preparation finished');requestRender();requestRender({viewportOnly:true});render();});
   await new Promise(resolve=>setTimeout(resolve,100));
   await route.continue();
  });
  if(!process.env.SR_STARTUP_FAILURES_ONLY){
  for(let attempt=0;attempt<3;attempt++){
   if(attempt)await page.reload();else await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8098/test/');
   await page.waitForSelector('main:not([inert])',{timeout:180000});
   assert.deepEqual(errors,[],'No painting may start while modules are still loading');
   assert.equal(await page.evaluate(()=>webglTracks.active&&webglBackground.active),true);
   assert.equal(await page.evaluate(()=>webglTracks.preparation.sourceFinished),true,'Prepared files are ready before the first map');
   assert.equal(await page.evaluate(()=>sourcePreparationJobs),0,'Completed source files must be reused on reload');
   console.log('Repeated startup '+(attempt+1)+' passed with delayed timeline and early paint requests.');
  }

  await page.evaluate(()=>{
   window.oldStartupPreparation=webglTracks.preparation;
   const get=oldStartupPreparation.files.get.bind(oldStartupPreparation.files);let reads=0;
   oldStartupPreparation.files.get=async(...args)=>{
    const values=await get(...args);
    if(++reads===2){window.oldReadBlocked=true;await new Promise(resolve=>{window.releaseOldRead=resolve;});}
    return values;
   };
   referenceBoatId=boats.find(boat=>boat.id!==referenceBoatId).id;webglTracks.prepareComparison();
  });
  await page.waitForFunction(()=>window.oldReadBlocked);
  await page.evaluate(()=>{window.startupLose=webglTracks.gl.getExtension('WEBGL_lose_context');startupLose.loseContext();});
  await page.waitForFunction(()=>!webglTracks.active);
  await page.evaluate(()=>{window.restorePaintTimer=setInterval(()=>requestRender(),10);startupLose.restoreContext();});
  await page.waitForFunction(()=>webglTracks.preparation!==oldStartupPreparation);
  await page.evaluate(()=>releaseOldRead());
  await page.waitForFunction(()=>webglTracks.active&&!webglTracks.restoring&&!hasRenderingFailure()&&webglTracks.buffers.size===boats.length,{},{timeout:180000});
  await page.evaluate(()=>clearInterval(restorePaintTimer));assert.deepEqual(errors,[]);
  console.log('Context restoration kept painting blocked until all tracks and the active style were ready.');
  }

  const stalled=await browser.newPage(),stallErrors=[];
  stalled.on('pageerror',error=>stallErrors.push(error.message));
  await stalled.route('**/boot.js',async route=>{
   const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('VIEWER_SCRIPT_TIMEOUT_MS=45000','VIEWER_SCRIPT_TIMEOUT_MS=500')});
  });
  await stalled.route('**/timeline.js',()=>{});
  await stalled.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8098/test/');
  await stalled.waitForSelector('#viewerLoadingError:not([hidden])',{timeout:180000});
  assert.match(await stalled.locator('#viewerLoadingError').textContent(),/timeline\.js.*45 sekunder/);
  assert.equal(await stalled.locator('main').getAttribute('inert'),'');assert.deepEqual(stallErrors,[]);
  await stalled.close();
  const lost=await browser.newPage(),lostErrors=[];
  lost.on('pageerror',error=>lostErrors.push(error.message));
  await lost.addInitScript(()=>{
   const get=HTMLCanvasElement.prototype.getContext;let injected=false;
   HTMLCanvasElement.prototype.getContext=function(type,...args){const gl=get.call(this,type,...args);if(type==='webgl2'&&gl&&!injected){injected=true;gl.getExtension('WEBGL_lose_context').loseContext();}return gl;};
  });
  await lost.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8098/test/');
  await lost.waitForSelector('#viewerLoadingError:not([hidden])',{timeout:180000});
  assert.match(await lost.locator('#viewerLoadingError').textContent(),/WebGL-konteksten er mistet/);
  assert.deepEqual(lostErrors,[]);await lost.close();
  const broken=await browser.newPage(),brokenErrors=[];
  broken.on('pageerror',error=>brokenErrors.push(error.message));
  await broken.addInitScript(()=>{
   const parameter=WebGL2RenderingContext.prototype.getShaderParameter,log=WebGL2RenderingContext.prototype.getShaderInfoLog;
   WebGL2RenderingContext.prototype.getShaderParameter=function(shader,name){if(this.canvas.parentElement?.hasAttribute('data-webgl-tracks')&&name===this.COMPILE_STATUS)return false;return parameter.call(this,shader,name);};
   WebGL2RenderingContext.prototype.getShaderInfoLog=function(shader){
    if(this.canvas.parentElement?.hasAttribute('data-webgl-tracks')){setTimeout(()=>this.canvas.dispatchEvent(new WebGLContextEvent('webglcontextlost',{cancelable:true})),0);return 'Injected first shader failure';}
    return log.call(this,shader);
   };
  });
  await broken.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8098/test/');
  await broken.waitForSelector('#viewerLoadingError:not([hidden])',{timeout:120000});
  assert.match(await broken.locator('#viewerLoadingError').textContent(),/Injected first shader failure.*Trin:/);
  assert.equal(await broken.evaluate(()=>!webglTracks.graphicsReady&&webglTracks.preparation.sourceFinished),true,'A drawing failure must remain visible after CPU preparation');
  assert.deepEqual(brokenErrors,[]);await broken.close();
  console.log('Startup: deploy-time files, repeated loads, restored contexts, missing modules and original drawing failures passed without any client worker.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
