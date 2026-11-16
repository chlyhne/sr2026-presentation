const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8098/test/';
 try{
  for(const simple of [false,true]){
   const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],requests=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
   await page.addInitScript(()=>{
    window.Worker=class{constructor(){throw Error('Client worker must not be used');}};
    indexedDB.open=()=>{throw Error('Client track storage must not be used');};
   });
   await page.route('**/tracks.js',async route=>{
    const response=await route.fetch();let source=await response.text();
    if(simple)source=source.replace(/const SIMPLE_IPHONE_TRACKS=.*?;/,'const SIMPLE_IPHONE_TRACKS=true;');

    await route.fulfill({response,body:source});
   });
   await page.route('**/track-renderer.js',async route=>{
    const response=await route.fetch(),source=await response.text();
    await route.fulfill({response,body:source.replace('gl.linkProgram(this.program);',"gl.transformFeedbackVaryings(this.program,['gainsStart'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(this.program);")});
   });
   const began=Date.now();await page.goto(base);await page.waitForSelector('main:not([inert]), #viewerLoadingError:not([hidden])',{timeout:30000});if(await page.locator('#viewerLoadingError').isVisible())throw Error(await page.locator('#viewerLoadingError').innerText());
   const initial=await page.evaluate(()=>({boats:webglTracks.buffers.size,ready:webglTracks.graphicsReady,geometryReleased:webglTracks.preparation.files.geometry===null,bytes:[...webglTracks.buffers.values()].reduce((sum,r)=>sum+r.bytes,0)}));
   assert.equal(initial.boats,106);assert.equal(initial.ready,true);assert.equal(initial.geometryReleased,true);
   const checkColours=async()=>page.evaluate(()=>{
    const reference=referenceBoat(),referenceProfile=trackProfileCache.get(reference.points);let checked=0;
    for(const boat of boats){
     const profile=trackProfileCache.get(boat.points),n=boat.points.length;
     for(const index of new Set([0,Math.floor(n/3),Math.floor(2*n/3),n-1]))if(index>=0&&index<n){
      const station=profile.samples[index*3],vmg=profile.samples[index*3+2],timeStation=profile.timeSamples[index*2],cost=profile.timeSamples[index*2+1];
      const expected=[null,null,null],speed=referenceProfile.stations[station],time=referenceProfile.timeStations[timeStation];
      if(station>=0&&vmg> -1e19&&speed>=0){expected[0]=vmg-speed;const factor=1+((reference.handicapSecondsPerNm||0)-(boat.handicapSecondsPerNm||0))*vmg/3600;if(boat.handicapSecondsPerNm>0&&reference.handicapSecondsPerNm>0&&factor>0)expected[1]=vmg/factor-speed;}
      if(timeStation>=0&&cost>=0&&time>=0&&!(cost>=Math.fround(1e15)&&time>=Math.fround(1e15)))expected[2]=100*(time-cost);
      for(const [component,mode] of ['absolute','handicap','time'].entries()){
       const actual=webglTracks.preparation.comparisonValues(webglTracks.buffers.get(boat.points),index,false)[component],wanted=expected[component];
       if(wanted===null){if(actual>=-1e19)throw Error('Missing comparison changed: '+boat.name+'/'+mode);}
       else if(Math.abs(actual-wanted)>Math.max(.00001,Math.abs(wanted)*.000001))throw Error('Prepared comparison differs: '+boat.name+'/'+mode);
       checked++;
      }
     }
    }
    return checked;
   });
   assert.ok(await checkColours()>1000);
   const checkShader=async()=>page.evaluate(()=>{
    const renderer=webglTracks,gl=renderer.gl,u=renderer.uniforms,reference=referenceBoat();
    const buffer=gl.createBuffer(),feedback=gl.createTransformFeedback();let checked=0;
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,feedback);gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,buffer);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,12,gl.STREAM_READ);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,buffer);
    try{
     const viewport=mapViewport();renderer.begin(viewport);
     for(const boat of boats.slice(0,12)){
      const record=renderer.buffers.get(boat.points),index=Math.floor(boat.points.length/2);if(!boat.points.length)continue;
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,record.texture);
      gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,record.comparisonTexture);
      gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,record.capTexture);
      gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,renderer.preparation.referenceTexture);
      gl.uniform1i(u.boatColourMode,0);gl.uniform1i(u.relativeMode,1);gl.uniform1i(u.firstInstance,index);gl.uniform1i(u.capMode,0);gl.uniform1i(u.subdivisions,1);
      const stamp=boat.points[index][2]-D.start+1,high=Math.fround(stamp);gl.uniform4f(u.windowTime,1e6,high,0,stamp-high);
      gl.uniform2f(u.handicaps,boat.handicapSecondsPerNm||0,reference.handicapSecondsPerNm||0);
      const expected=renderer.preparation.comparisonValues(record,index,false);
      for(let mode=0;mode<3;mode++){
       gl.uniform1i(u.gainComponent,mode);gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArraysInstanced(gl.POINTS,0,1,1);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
       const actual=new Float32Array(3);gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,actual);
       if(expected[mode]<-1e19){if(actual[0]>=-1e19)throw Error('GPU missing value changed');}
       else if(Math.abs(actual[0]-expected[mode])>Math.max(.001,Math.abs(expected[mode])*.0001))throw Error('GPU comparison differs: '+boat.name+'/'+mode+': '+actual[0]+' != '+expected[mode]);
       checked++;
      }
     }
     if(gl.getError())throw Error('GPU comparison test failed');
    }finally{gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.deleteTransformFeedback(feedback);gl.deleteBuffer(buffer);renderer.lastKey=null;requestRender();}
    return checked;
   });
   assert.ok(await checkShader()>0);
   const before=requests.filter(url=>url.endsWith('.bin.gz')).length;
   for(const mode of ['boat','absolute','handicap','time','speed']){
    const state=await page.evaluate(async mode=>{
     comparison={enabled:!['boat','speed'].includes(mode),boatColour:mode==='boat',basis:['absolute','handicap','time'].includes(mode)?mode:'absolute'};
     await webglTracks.prepareComparison();webglTracks.render(currentTime(),boats,true);await webglTracks.preparation.ready('Test af færdige filer');assertRenderingReady();
     return {mode:webglTracks.loadedMode,error:webglTracks.gl.getError()};
    },mode);
    assert.equal(state.mode,mode);assert.equal(state.error,0);
   }
   assert.equal(requests.filter(url=>url.endsWith('.bin.gz')).length,before,'Style changes use prepared arrays without any download or computation');
   const changed=await page.evaluate(async()=>{
    referenceBoatId=boats.find(boat=>boat.course!==referenceBoat().course).id;await webglTracks.prepareComparison();assertRenderingReady();
    return {id:referenceBoatId,loaded:webglTracks.preparation.files.referenceId};
   });
   assert.equal(changed.loaded,changed.id);assert.ok(await checkColours()>1000);assert.ok(await checkShader()>0);assert.equal(requests.filter(url=>url.endsWith('.bin.gz')).length,before,'A reference change across courses uses resident profiles without downloads');
   assert.equal(requests.some(url=>/\/(?:line|cubic|reference-[0-9]+)\.bin\.gz$/.test(url)),false);
   assert.equal(requests.some(url=>url.includes('track-preparation-worker')||url.includes('track-preparation-math')),false);
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({simple,initial,loadMs:Date.now()-began,checks:'local geometry and indices; GPU station comparison; all styles; reference swap without download'}));
   await page.close();
  }
  for(const mode of ['missing','invalid-gzip']){
   const page=await browser.newPage();await page.addInitScript(()=>{
    window.testWebGLContexts=0;const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2')testWebGLContexts++;return get.call(this,type,...args);};
    window.Worker=class{constructor(){throw Error('No preparation fallback');}};
   });
   await page.route('**/common.bin.gz',route=>route.fulfill({status:mode==='missing'?404:200,body:mode==='missing'?'missing':'not gzip'}));
   await page.goto(base);await page.waitForSelector('#viewerLoadingError:not([hidden])',{timeout:30000});
   assert.equal(await page.evaluate(()=>testWebGLContexts),0);assert.equal(await page.locator('main').getAttribute('inert'),'');await page.close();
  }
  console.log('Firefox: missing or corrupt prepared data fails before WebGL; no fallback is attempted.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
