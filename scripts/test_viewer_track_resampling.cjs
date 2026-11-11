const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>requests.push(new URL(request.url()).pathname));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18453/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const result=await page.evaluate(()=>{
   const check=(condition,message)=>{if(!condition)throw Error(message);};
   stopPlayback();$('wind').checked=$('rain').checked=false;
   check(webglTracks.active,webglTracks.error);
   check(replayResources===null,'Release shared download after preparation');
   let count=0,gaps=0,cubic=false;
   const indexes=boats.map(boat=>trackTimeIndexes.get(boat.points)),models=boats.map(boat=>trackModelCache.get(boat.points));
   for(const boat of boats){
    check(trackTimeIndexes.has(boat.points),'Time index prepared before interaction');
    check(trackProfileCache.has(boat.points),'All comparisons prepared before interaction');
    check(boat.points.length===boat.speeds.length,'One time axis for coordinates and speed');
    let index=0;
    visitTrackSampleTimes(boat.trackSegments,D.start,time=>{
     check(boat.points[index++][2]===time,'Shared ten-second lattice and exact endpoints');
    });
    check(index===boat.points.length,'Complete resampling');count+=index;
    for(let segment=1;segment<boat.trackSegments.length;segment++){
     const end=boat.trackSegments[segment-1][1],start=boat.trackSegments[segment][0];
     check(start-end>TRACK_MAX_GAP,'Separate data holes');
     check(trackPosition(boat.points,(end+TRACK_MAX_GAP+start)/2)===null,'Do not fill data holes');gaps++;
    }
    for(let index=0;!cubic&&index+1<boat.points.length;index++){
     const first=boat.points[index],last=boat.points[index+1];
     if(last[2]-first[2]!==10)continue;
     const time=(first[2]+last[2])/2,position=trackPosition(boat.points,time);
     check(position.interpolated,'Sub-grid marker interpolation');
     if(Math.abs(position.point[0]-(first[0]+last[0])/2)>1e-10)cubic=true;
    }
   }
   check(cubic,'Retain cubic, not linear, rendering between new knots');
   for(const style of ['boat','absolute','handicap','time']){
    check(saveComparison({enabled:style!=='boat',basis:style==='boat'?'absolute':style,boatColour:style==='boat'}),'Change comparison style');
    selectedTime=D.start+43205;render();
   }
   check(boats.every((boat,index)=>trackTimeIndexes.get(boat.points)===indexes[index]&&trackModelCache.get(boat.points)===models[index]),'Reuse prepared indexes and cubic models');
   check(webglTracks.gl.getError()===webglTracks.gl.NO_ERROR,'No WebGL errors');
   return {boats:boats.length,points:count,gaps,cubic};
  });
  assert.equal(result.boats,106);assert.equal(result.points,1800766);assert.ok(result.gaps>0);
  assert.equal(requests.filter(name=>name.endsWith('/fleet.bin')).length,1);
  assert.equal(requests.filter(name=>name.endsWith('/track-profiles/manifest.json')).length,1);
  assert.equal(requests.some(name=>name.endsWith('/data.js')),false);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'firefox',...result,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
