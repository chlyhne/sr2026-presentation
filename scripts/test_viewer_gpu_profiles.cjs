const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.addScriptTag({content:'window.profileOracle=(()=>{'+fs.readFileSync(path.join(__dirname,'profile-reference-math.js'),'utf8')+';return {prepareReferenceProfile,prepareTimeProfiles,projectedTrackSample};})();'});
  const selected=process.env.SR_PROFILE_BOATS?.split(',');
  const result=await page.evaluate(async selected=>{
   stopPlayback();const speedErrors=[],timeErrors=[],large=[],timeDetails=[],infinityDifferences=[],coverage={speed:0,time:0},samples={speed:0,time:0},classified={routeJunction:0,differentPartialPassage:0,curveSampling:0},unexplained=[];let compared=0;
   const fleet=selected?boats.filter(b=>selected.includes(b.name)):boats;
   if(selected&&selected.some(name=>!fleet.some(b=>b.name===name)))throw Error('Unknown profile fixture boat');
   for(const boat of fleet){
    const gpu=trackProfileCache.get(boat.points),cpu=profileOracle.prepareReferenceProfile(boat),time=profileOracle.prepareTimeProfiles(boat).timeStations;
    const record=webglTracks.buffers.get(boat.points),texture=webglTracks.preparation.read(record.profile,1024,Math.ceil(referenceStationCount()/1024));
    for(let index=0;index<cpu.length;index++){
     const a=gpu.stations[index],b=cpu[index];
     if((a>=0)!==(b>=0))coverage.speed++;
     else if(a>=0){
      samples.speed++;const error=Math.abs(a-b);speedErrors.push(error);
      if(error>.1){
       const gpuTime=texture[index*4+2],cpuTime=cpu.passages[index]-D.start,span=texture[index*4+3];
       const entry={boat:boat.name,index,actual:a,expected:b,error,gpuTime,cpuTime,span};large.push(entry);
       const junction=rhumbRoute.legs.slice(1).some(leg=>Math.abs(index*10-leg.start*1852)<=16);
       if(junction)classified.routeJunction++;
       else if(Math.abs(gpuTime-cpuTime)>2*span+.03)classified.differentPartialPassage++;
       else{
        classified.curveSampling++;const nearby=[];
        for(let i=0;i<=16;i++){
         const sample=profileOracle.projectedTrackSample(boat,D.start+gpuTime+(i/8-1)*span);
         if(sample)nearby.push(Math.max(0,sample.vmg));
        }
        // An 8m sample bracket must stay inside the speeds of that local curve,
        // allowing .05kn for endpoint/time conditioning; no bitwise comparison.
        if(!nearby.length||a<Math.min(...nearby)-.05||a>Math.max(...nearby)+.05)unexplained.push(entry);
       }
      }
     }
     const x=gpu.timeStations[index],y=time[index];
     if((x>=0)!==(y>=0))coverage.time++;
     else if(x>=0){
      samples.time++;
      if(x>=Math.fround(1e15)||y===Infinity){
       if(!(x>=Math.fround(1e15)&&y===Infinity))infinityDifferences.push({boat:boat.name,index,actual:x,expected:y,nearby:Array.from(time.slice(Math.max(0,index-2),index+3))});
      }else{
       const error=Math.abs(x-y)/Math.max(.1,Math.abs(y));timeErrors.push(error);
       if(error>.1)timeDetails.push({boat:boat.name,index,actual:x,expected:y,error,nearby:Array.from(time.slice(Math.max(0,index-2),index+3))});
      }
     }
    }
    compared++;await new Promise(resolve=>setTimeout(resolve,0));
   }
   const original={legs:rhumbRoute.legs,total:rhumbRoute.total},canonical=[];
   const latitude=55.6,longitude=m=>12+m/(NAV_RADIUS_NM*1852*NAV_RAD*Math.cos(latitude*NAV_RAD));
   const run=(name,routePoints,points,speeds,check)=>{
    const route=buildRhumbRoute(routePoints);rhumbRoute.legs=route.legs;rhumbRoute.total=route.total;
    const preparation=new GPUTrackPreparation({gl:webglTracks.gl,buffers:new Map(),uploads:0}),boat={name,points,speeds};
    try{preparation.prepare(boat);check(trackProfileCache.get(points),route);canonical.push(name);}finally{preparation.dispose();}
   };
   try{
    const route=[[longitude(0),latitude],[longitude(1000),latitude]],line=[0,500,1000].map((m,i)=>[longitude(m),latitude,D.start+10000+i*100]);
    run('exact route endpoints',route,line,[4,4,4],profile=>{
     for(const index of [0,50,100])if(Math.abs(profile.stations[index]-4)>.005)throw Error('Route endpoint precision regression');
    });
    run('near zero VMG remains finite',route,line.map(p=>[...p]),[.00001,.00001,.00001],profile=>{
     const expected=3600/(1852*.00001);if(Math.abs(profile.timeStations[50]/expected-1)>.002)throw Error('Near-zero density was clipped or lost');
    });
    run('first short partial passage',route,[27,29,100,200].map((m,i)=>[longitude(m),latitude,D.start+10000+[0,10,400,460][i]]),[3,3,9,9],profile=>{
     if(Math.abs(profile.stations[3]-3)>.005||profile.stations[5]>=0||Math.abs(profile.stations[15]-9)>.005)throw Error('Short/gapped passage was replaced or connected');
    });
    run('Float32-equal neighbours keep one passage',route,[0,99.999,100.001,200].map((m,i)=>[longitude(m),latitude,D.start+10000+[0,60,60.000972,120][i]]),[4,4,4,4],profile=>{
     const density=3600/(1852*4);if(Math.abs(profile.timeStations[10]-density)>.01)throw Error('Progress plateau split a single passage: '+profile.timeStations[10]);
    });
    run('sub-resolution reversal does not duplicate passage time',route,[0,100,99.99,200].map((m,i)=>[longitude(m),latitude,D.start+10000+[0,60,60.01,120][i]]),[4,4,4,4],profile=>{
     const density=3600/(1852*4);if(Math.abs(profile.timeStations[10]-density)>.02)throw Error('Projection noise created another passage');
    });
    run('nearby start and finish do not bridge the route',[[12,latitude],[12.02,latitude],[12.02,latitude+.001],[12,latitude+.001]],[[12.005,latitude+.0001,D.start+10000],[12.005,latitude+.0009,D.start+10060]],[4,4],(profile,route)=>{
     const middle=Math.round((route.legs[1].start+route.legs[1].distance/2)*1852/10);
     if(profile.stations[middle]>=0||profile.timeStations[middle]>=0)throw Error('False passage between separated route legs');
    });
   }finally{rhumbRoute.legs=original.legs;rhumbRoute.total=original.total;}
   const distribution=values=>{values.sort((a,b)=>a-b);return {p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],p99:values[Math.floor(values.length*.99)],max:values.at(-1)};};
   return {canonical,boats:compared,stations:referenceStationCount(),samples,coverage,speedErrorKnots:distribution(speedErrors),relativeTimeError:distribution(timeErrors),infinityDifferences:infinityDifferences.slice(0,10),infinityDifferenceCount:infinityDifferences.length,timeDetails:timeDetails.sort((a,b)=>b.error-a.error).slice(0,10),classified,unexplained:unexplained.slice(0,15),large:large.sort((a,b)=>b.error-a.error).slice(0,8)};
  },selected);
  console.log(JSON.stringify(result));assert.deepEqual(errors,[]);
  assert.equal(result.boats,selected?selected.length:106);assert.ok(result.speedErrorKnots.p99<.1);assert.ok(result.relativeTimeError.p95<.02);
  assert.ok(result.coverage.speed<result.samples.speed*.0001&&result.coverage.time<result.samples.time*.0001);
  assert.deepEqual(result.unexplained,[]);
  assert.ok(result.relativeTimeError.max<10,'Unexpected local time-profile regression');
  assert.ok(result.infinityDifferenceCount<=2&&result.infinityDifferences.every(entry=>entry.nearby.some(value=>value===Infinity)),'Overflow differences must be confined to the known cell boundaries');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
