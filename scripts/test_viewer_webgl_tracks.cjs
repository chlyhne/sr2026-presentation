const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.SR_TRACK_RENDERER='webgl');
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForFunction(()=>typeof captureMap==='function');
  const result=await page.evaluate(()=>{
   const check=(ok,message)=>{if(!ok)throw Error(message);};
   check(webglTracks.active,'WebGL 2 must be exercised, not the SVG fallback: '+webglTracks.error);
   $('wind').checked=$('rain').checked=false;
   const boat=boats.find(b=>b.name==='Mercutio'),point=(x,y,t)=>[9.5+x*4.5/1000,57-y*3/1180,D.start+t];
   boat.points=[point(600,460,100),point(610,468,160),point(630,465,220),point(640,480,280),point(645,470,1000),point(650,465,1060)];
   boat.speeds=[2,5,9,11,null,7];
   chosen.clear();chosen.add(boat.name);view=[595,455,65,35];setview();selectedTime=D.start+1100;render();
   const gl=webglTracks.gl,record=webglTracks.buffers.get(boat.points),uploads=webglTracks.uploads;
   check($('routes').querySelectorAll('path').length===0,'Live paths still exist');
   const pixel=(x,y)=>{
    const matrix=$('map').getScreenCTM(),rect=$('map').getBoundingClientRect(),screen=new DOMPoint(x,y).matrixTransform(matrix),ratio=devicePixelRatio||1;
    const value=new Uint8Array(4);
    gl.readPixels(Math.floor((screen.x-rect.left)*ratio),gl.drawingBufferHeight-1-Math.floor((screen.y-rect.top)*ratio),1,1,gl.RGBA,gl.UNSIGNED_BYTE,value);
    return [...value];
   };
   webglTracks.render(selectedTime,webglTracks.order,true);
   for(const [index,u] of [[0,.3],[1,.4],[2,.6],[4,.4]]){
    const a=boat.points[index],b=boat.points[index+1],time=a[2]+u*(b[2]-a[2]);
    const position=xy(trackValue(boat.points,index,time).point),actual=pixel(...position);
    const speed=index===4?null:boat.speeds[index]+u*(boat.speeds[index+1]-boat.speeds[index]);
    const expected=speed===null?[138,148,155]:TRACK_SPEED_COLOURS[speedBin(speed)].match(/\d+/g).map(Number);
    check(actual[3]===255&&expected.every((v,i)=>Math.abs(actual[i]-v)<=12),'Cubic/SOG sample mismatch: '+JSON.stringify({index,actual,expected}));
   }
   const gap=pixel(642.5,475);check(gap[3]===0,'Gap over five minutes was connected');
   let allocations=0;
   const originalUpload=gl.bufferData.bind(gl),originalSubUpload=gl.bufferSubData.bind(gl),originalBuffer=gl.createBuffer.bind(gl);
   gl.bufferData=(...args)=>{allocations++;return originalUpload(...args);};
   gl.bufferSubData=(...args)=>{allocations++;return originalSubUpload(...args);};
   gl.createBuffer=(...args)=>{allocations++;return originalBuffer(...args);};
   const originalGeometry=trackGeometry,originalSpeedGeometry=trackSpeedGeometry;
   trackGeometry=trackSpeedGeometry=()=>{throw Error('SVG geometry rebuilt during WebGL playback');};
   try{
    for(const offset of [100,.1,200,1000,9000,50,1100]){selectedTime=D.start+offset;render();}
    view=[590,450,80,45];setview();
   }finally{trackGeometry=originalGeometry;trackSpeedGeometry=originalSpeedGeometry;gl.bufferData=originalUpload;gl.bufferSubData=originalSubUpload;gl.createBuffer=originalBuffer;}
   check(!allocations&&webglTracks.uploads===uploads,'Playback/seek/zoom allocated or uploaded buffers');
   check(webglTracks.buffers.get(boat.points)===record,'Immutable voyage buffer replaced');
   // Repeated crossings must show the newest local sample, including
   // when a moving tail clips the beginning of one of the overlapping curves.
   const originalPoints=boat.points,originalSpeeds=boat.speeds;
   boat.points=[point(600,465,100),point(620,465,160),point(600,465,220),point(620,465,280)];boat.speeds=[2,10,5,7];
   const overlapColour=TRACK_SPEED_COLOURS[speedBin(5+2*Math.SQRT1_2)].match(/\d+/g).map(Number);
   for(const time of [7300,7330]){
    selectedTime=D.start+time;render();webglTracks.render(selectedTime,webglTracks.order,true);
    check(pixel(610,465).slice(0,3).every((v,i)=>Math.abs(v-overlapColour[i])<=3),'Overlap colour changed as the tail moved');
   }
   // An older crossing cannot cover the newer passage, even if submitted last.
   const crossing={id:'test-crossing',name:'test-crossing',points:[point(610,460,100),point(610,470,160)],speeds:[2,2]};
   webglTracks.render(selectedTime,[boat,crossing],true);
   const crossingColour=overlapColour;
   check(pixel(610,465).slice(0,3).every((v,i)=>Math.abs(v-crossingColour[i])<=3),'Boat layer order changed');
   chosen.add(crossing.name);
   const crossingScreen=new DOMPoint(610,465).matrixTransform($('map').getScreenCTM());
   check(nearestTrackSpeed(crossingScreen.x,crossingScreen.y,undefined,true)?.boatId===boat.id,'Click did not select the newest crossing track');
   chosen.delete(crossing.name);
   boat.points=originalPoints;boat.speeds=originalSpeeds;
   selectedTime=D.start+1100;render();
   check(gl.getError()===gl.NO_ERROR,'WebGL error');
   return {allocations,uploads:1,checks:'native cubic/SOG pixels, missing SOG, gaps, static buffers, forward/reverse seek, zoom, newest passage above older crossings, no SVG paths'};
  });
  await page.screenshot({path:'/tmp/sr2026-webgl-tracks.png'});
  // Export embeds a fresh full-resolution track render, never a foreignObject canvas.
  await page.evaluate(()=>{
   const serialize=XMLSerializer.prototype.serializeToString;
   XMLSerializer.prototype.serializeToString=function(node){const text=serialize.call(this,node);window.exportedTrackSVG=text;return text;};
  });
  const download=page.waitForEvent('download');await page.evaluate(()=>captureMap());
  await(await download).saveAs('/tmp/sr2026-webgl-export.png');
  assert.deepEqual(await page.evaluate(()=>{
   const doc=new DOMParser().parseFromString(exportedTrackSVG,'image/svg+xml');
   return {image:!!doc.querySelector('#routes image'),canvas:doc.querySelectorAll('canvas,foreignObject').length};
  }),{image:true,canvas:0});
  // A lost GPU context must show the depth-buffered fallback and recover.
  const contextLoss=await page.evaluate(()=>{
   const extension=webglTracks.gl.getExtension('WEBGL_lose_context');
   if(!extension)return false;window.testContextLoss=extension;extension.loseContext();return true;
  });
  if(contextLoss){
   await page.waitForFunction(()=>!webglTracks.active&&softwareTracks.host.getAttribute('display')!=='none');
   await page.evaluate(()=>testContextLoss.restoreContext());
   await page.waitForFunction(()=>webglTracks.active&&softwareTracks.host.getAttribute('display')==='none');
   assert.equal(await page.evaluate(()=>webglTracks.gl.getError()),0);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...result,png:true,contextLoss,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
