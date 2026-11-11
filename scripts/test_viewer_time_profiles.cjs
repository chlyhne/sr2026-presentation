const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
const near=(actual,expected,tolerance=.001)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} expected ${expected}`);
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const fleet=await page.evaluate(()=>{
   const reference=boats.find(boat=>boat.name==='Mercutio'),profile=trackProfileCache.get(reference.points);
   referenceBoatId=reference.id;webglTracks.comparisonReference=null;webglTracks.prepareComparison();
   const densities=Array.from(profile.timeStations).filter(value=>value>=0&&Number.isFinite(value)).sort((left,right)=>left-right);
   let sailing=0,saturated=0;
   for(let index=0;index<reference.points.length;index++){
    const station=profile.timeSamples[index*2];
    if(!(reference.speeds[index]>2)||station<1000||station>=profile.timeStations.length-1000)continue;
    const gain=webglTracks.comparisonSample(reference,reference.points[index][2])?.timeGain;
    if(gain===null||gain===undefined)continue;
    sailing++;if(Math.abs(gain)>TRACK_TIME_GAIN_LIMIT)saturated++;
   }
   return {median:densities[Math.floor(densities.length/2)],sailing,saturated};
  });
  assert.ok(fleet.median>.05&&fleet.median<1,JSON.stringify(fleet));
  assert.ok(fleet.sailing>1000&&fleet.saturated/fleet.sailing<.1,JSON.stringify(fleet));
  const result=await page.evaluate(()=>{
   stopPlayback();$('wind').checked=$('rain').checked=false;
   const latitude=55.6,longitude=meters=>12+meters/(NAV_RADIUS_NM*1852*NAV_RAD*Math.cos(latitude*NAV_RAD));
   const route=buildRhumbRoute([[longitude(0),latitude],[longitude(207),latitude]]);
   rhumbRoute.legs=route.legs;rhumbRoute.total=route.total;
   const metadata=boatMetadata('Mercutio');
   function fixture(id,meters,speed,row){
    const boat={id,name:id,metadata,handicapSecondsPerNm:580.6,
     points:meters.map((value,index)=>[longitude(value),latitude+row*.00008,D.start+3600+index*60]),speeds:meters.map(()=>speed)};
    colours[id]='#ffdc42';
    const {timeSamples,timeStations}=prepareTimeProfiles(boat);
    trackProfileCache.set(boat.points,{samples:prepareProjectedTrack(boat),stations:prepareReferenceProfile(boat),
     timeSamples:unpackTimeSamples(packTimeSamples(timeSamples),boat.points.length),
     timeStations:unpackTimeValues(packTimeValues(timeStations),timeStations.length)});
    webglTracks.prepare(boat);return boat;
   }
   boats.splice(0,boats.length,
    fixture('triple',[20,180,20,180],4,0),fixture('forward',[20,180],4,1),
    fixture('reverse',[180,20],4,2),fixture('reverseReference',[180,20],8,3),
    fixture('turn',[20,180,20],4,4),fixture('stopped',[80,80],0,5),fixture('missing',[20,180],null,6));
   chosen.clear();for(const boat of boats)chosen.add(boat.name);
   selectedTime=D.start+3900;
   const [left,bottom]=xy([longitude(0),latitude]),[right,top]=xy([longitude(207),latitude+.00056]);
   view=[left-.06,top-.06,right-left+.12,bottom-top+.12];setview();
   comparison={enabled:true,basis:'time'};comparisonRevision++;
   const forbidden=()=>{throw Error('Interaction recalculated time profiles or uploaded fixed buffers');};
   prepareTimeProfiles=projectedTimeSample=prepareProjectedTrack=prepareReferenceProfile=forbidden;
   webglTracks.gl.createBuffer=webglTracks.gl.bufferData=webglTracks.gl.bufferSubData=forbidden;
   const value=(boat,index=0)=>webglTracks.comparisonSample(boat,boat.points[index][2])?.timeGain??null;
   function reference(id){referenceBoatId=id;webglTracks.comparisonReference=null;webglTracks.prepareComparison();}
   function pixel(boat,meters=100){
    webglTracks.render(currentTime(),boats,true);
    const gl=webglTracks.gl,rect=$('map').getBoundingClientRect();
    const point=new DOMPoint(...xy([longitude(meters),boat.points[0][1]])).matrixTransform($('map').getScreenCTM()),rgba=new Uint8Array(4);
    gl.readPixels(Math.floor((point.x-rect.left)/rect.width*gl.drawingBufferWidth),Math.floor((rect.bottom-point.y)/rect.height*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
    return [...rgba];
   }
   reference('triple');
   const result={forward:value(boats[1]),reverse:value(boats[2]),turn:value(boats[4],1),blue:pixel(boats[1]),missing:value(boats[6]),grey:pixel(boats[6])};
   result.stopped=value(boats[5]);result.stoppedLabel=trackPinValue(boats[5],trackSpeedSample(boats[5],boats[5].points[0][2])).label;
   result.yellow= pixel(boats[5],80);
   reference('reverseReference');
   result.reverseOnly=value(boats[2]);result.red=pixel(boats[2]);
   reference('forward');result.equalReverse=value(boats[2]);result.white=pixel(boats[2]);
   const gl=webglTracks.gl,originals=new Map();
   for(const name of ['texSubImage2D','beginTransformFeedback']){originals.set(name,gl[name]);gl[name]=forbidden;}
   try{saveComparison({enabled:true,basis:'absolute'});saveComparison({enabled:true,basis:'time'});render();}
   finally{for(const [name,method] of originals)gl[name]=method;}
   if(!webglTracks.active)throw Error(webglTracks.error);
   result.glError=gl.getError();return result;
  });
  const density=3600/(1852*4);
  near(result.forward,200*density);near(result.reverse,result.forward);near(result.turn,result.forward);
  near(result.reverseOnly,-50*density);near(result.equalReverse,0);
  assert.ok(result.stopped< -1e16);assert.equal(result.stoppedLabel,'−∞ s/100 m');
  assert.equal(result.missing,null);assert.deepEqual(result.grey,[138,148,155,255]);
  assert.ok(result.blue[2]>result.blue[0]+80,JSON.stringify(result));
  assert.ok(result.red[0]>result.red[2]+20,JSON.stringify(result));
  assert.deepEqual(result.yellow,[255,196,61,255]);
  assert.ok(result.white[0]>230&&result.white[1]>230&&result.white[2]>230,JSON.stringify(result));
  assert.equal(result.glError,0);assert.deepEqual(errors,[]);
  console.log('Firefox: real-fleet start/finish projection regression '+JSON.stringify(fleet)+'; summed reverse passages, finite-difference turnarounds, GPU colours, missing data, zero-progress overflow and allocation-free interaction passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
