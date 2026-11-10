const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');

const root=path.resolve(__dirname,'..'),start=1781164800;
const context=vm.createContext({D:{start}});
for(const file of ['track-time.js','tracks.js','rhumbline-geometry.js','navigation-math.js']){
 vm.runInContext(fs.readFileSync(path.join(root,'viewer',file),'utf8'),context,{filename:file});
}
vm.runInContext('const rhumbRoute=buildRhumbRoute([[11.99,55.6],[12.2,55.6]]);',context);
const {projectedTrackSample,prepareReferenceStations,prepareReferencePassages,
 packReferenceStations,packedReferenceAtProgress,prepareProjectedTrack}=context;

function near(actual,expected,tolerance,label){
 assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,
  `${label}: ${actual} expected ${expected} within ${tolerance}`);
}
function sameSample(actual,expected,label){
 if(expected===null){assert.equal(actual,null,label);return;}
 assert.ok(actual,label);
 near(actual.vmg,expected.vmg,1e-5,`${label} VMG`);
 near(actual.time,expected.time,.1,`${label} time`);
}
function interval(low,high,time,vmg,endVmg=vmg,duration=60){
 return {low,high,a:{time:start+time,vmg},b:{time:start+time+duration,vmg:endVmg}};
}
function intervalSample(progress,value){
 if(!value)return null;
 const fraction=(progress-value.low)/(value.high-value.low);
 return {vmg:value.a.vmg+(value.b.vmg-value.a.vmg)*fraction,
  time:value.a.time+(value.b.time-value.a.time)*fraction};
}
function originalLookup(progress,stations){
 let selected=null;
 for(const station of stations){if(station.at>progress)break;selected=station;}
 return selected?intervalSample(progress,progress===selected.at?selected.point:selected.after):null;
}
function boat(id,coordinates,speeds,times=coordinates.map((_,i)=>i*60)){
 return {id,name:id,points:coordinates.map(([lon,lat],i)=>[lon,lat,start+times[i]]),speeds};
}

test('overlapping passages select the earliest forward interval including closed endpoints',()=>{
 const intervals=[interval(0,100,100,4),interval(10,20,10,8),interval(20,30,20,6)];
 const stations=prepareReferenceStations(intervals);
 const queries=[-1,0,10,20,20.1,30,30.1,100,101];
 const expected=[null,4,8,8,6,6,4,4,null];
 assert.deepEqual(queries.map(progress=>originalLookup(progress,stations)?.vmg??null),expected);
 for(const progress of queries){
  const candidates=intervals.filter(value=>value.low<=progress&&progress<=value.high)
   .sort((a,b)=>a.a.time-b.a.time);
  sameSample(originalLookup(progress,stations),intervalSample(progress,candidates[0]),`sweep at ${progress}`);
 }
});

test('packed stations distinguish exact point, immediately after, gaps and the final endpoint',()=>{
 const stations=prepareReferenceStations([
  interval(0,100,100,4),interval(10,20,10,8),interval(20,30,20,6),interval(110,120,200,9)
 ]);
 const packed=packReferenceStations(stations);
 assert.equal(packed.BYTES_PER_ELEMENT,4);
 assert.equal(packed.length,stations.length*8);
 const index=stations.findIndex(station=>station.at===20),offset=index*8;
 near(packed[offset+1],8,1e-5,'boundary point VMG');
 near(packed[offset+2],70,.1,'boundary point relative time');
 near(packed[offset+4],6,1e-5,'boundary after VMG');
 near(packed[offset+6],20,.1,'boundary after relative time');
 for(const progress of [-1,0,9.999,10,19.999,20,20.000001,30,30.000001,100,100.000001,105,110,120,121]){
  sameSample(packedReferenceAtProgress(progress,packed),originalLookup(progress,stations),`packed boundary ${progress}`);
 }
 assert.equal(packedReferenceAtProgress(20,packed).vmg,8);
 assert.equal(packedReferenceAtProgress(20.000001,packed).vmg,6);
});

test('split progress preserves distinct stations whose Float32 high components coincide',()=>{
 const at=200,step=2**-22;
 const stations=prepareReferenceStations([
  interval(at,at+4*step,100,4),interval(at,at+step,10,8),interval(at+step,at+2*step,20,2)
 ]);
 const packed=packReferenceStations(stations);
 assert.ok(stations.length>=4);
 assert.ok(stations.every(station=>Math.fround(station.at)===Math.fround(at)));
 assert.ok(new Set(Array.from({length:stations.length},(_,i)=>packed[i*8+3])).size>=4);
 for(const progress of [at-step,at,at+step/2,at+step,at+1.5*step,at+2*step,at+2.5*step,at+4*step,at+5*step]){
  sameSample(packedReferenceAtProgress(progress,packed),originalLookup(progress,stations),`split key ${progress}`);
 }
 assert.equal(packedReferenceAtProgress(at+step,packed).vmg,8);
 assert.equal(packedReferenceAtProgress(at+1.5*step,packed).vmg,2);
});

test('packed affine values agree with the original station lookup over varying VMG and passage times',()=>{
 const intervals=[
  interval(.123456789,8.234567891,151200,2.1,8.7,251.25),
  interval(1.234567891,3.456789123,120000,9.3,1.2,37.5),
  interval(3.456789123,6.876543219,130000,-1.7,6.1,117.75),
  interval(9.123456789,12.987654321,160000,7.3,3.9,299.5)
 ];
 const stations=prepareReferenceStations(intervals),packed=packReferenceStations(stations);
 const queries=Array.from({length:601},(_,i)=>i*14/600);
 for(const station of stations)queries.push(station.at,station.at-1e-6,station.at+1e-6);
 for(const progress of queries){
  sameSample(packedReferenceAtProgress(progress,packed),originalLookup(progress,stations),`affine lookup ${progress}`);
 }
 const empty=packReferenceStations([]);
 assert.equal(empty.length,0);
 assert.equal(packedReferenceAtProgress(1,empty),null);
 for(const progress of [NaN,Infinity,-Infinity])assert.equal(packedReferenceAtProgress(progress,packed),null);
});

test('projected VMG preserves direction and rejects missing SOG, undefined direction and outside positions',()=>{
 const forward=boat('forward',[[12,55.6],[12.1,55.6]],[6,8]);
 const reverse=boat('reverse',[[12.1,55.6],[12,55.6]],[6,8]);
 near(projectedTrackSample(forward,start+30).vmg,7,1e-5,'forward VMG');
 near(projectedTrackSample(reverse,start+30).vmg,-7,1e-5,'reverse VMG');
 assert.equal(prepareReferencePassages(reverse).stations.length,0);
 for(const speeds of [[null,null],[6,null],[undefined,8],[-1,8],[NaN,8],undefined]){
  assert.equal(projectedTrackSample({...forward,speeds},start+30),null);
 }
 assert.equal(projectedTrackSample({...forward,speeds:[null,8]},start),null);
 const stationary=boat('stationary',[[12.04,55.6],[12.04,55.6]],[6,6]);
 assert.equal(projectedTrackSample(stationary,start+30),null);
 near(projectedTrackSample({...stationary,speeds:[0,0]},start+30).vmg,0,1e-5,'stationary zero VMG');
 assert.equal(projectedTrackSample(boat('outside',[[12.3,55.6],[12.4,55.6]],[6,6]),start+30),null);
});

test('tracking gaps remain missing while valid endpoints on either side retain their own samples',()=>{
 const gapped=boat('gapped',[[12,55.6],[12.02,55.6],[12.06,55.6],[12.08,55.6]],
  [6,6,6,6],[-60,0,301,361]);
 assert.ok(projectedTrackSample(gapped,start));
 assert.ok(projectedTrackSample(gapped,start+301));
 assert.equal(projectedTrackSample(gapped,start+150),null);
 const isolated=boat('isolated',[[12.02,55.6],[12.06,55.6]],[6,6],[0,301]);
 for(const time of [start,start+150,start+301])assert.equal(projectedTrackSample(isolated,time),null);
 assert.equal(prepareReferencePassages(isolated).stations.length,0);
 const packed=packReferenceStations(prepareReferencePassages(gapped).stations);
 const gapProgress=context.projectOnRhumbRoute([12.04,55.6]).progress;
 assert.equal(packedReferenceAtProgress(gapProgress,packed),null);
 const samples=prepareProjectedTrack(isolated);
 assert.ok(samples[2]<-1e19&&samples[5]<-1e19);
});

test('reference profiles subdivide original source intervals into at most five seconds without bridging missing SOG',()=>{
 const reference=boat('reference',[[12,55.6],[12.05,55.6],[12.1,55.6]],[4,7,6],[0,11,18]);
 const profile=prepareReferencePassages(reference);
 assert.equal(profile.boat,reference);
 assert.equal(profile.stations.length,6);
 const packed=packReferenceStations(profile.stations);
 for(const station of profile.stations){
  for(const passage of [station.point,station.after]){
   if(passage){assert.ok(passage.b.time>passage.a.time);assert.ok(passage.b.time-passage.a.time<=5);}
  }
 }
 for(const time of [0,11/3,22/3,11,14.5,18]){
  const sample=projectedTrackSample(reference,start+time);
  sameSample(packedReferenceAtProgress(sample.progress,packed),sample,`reference subdivision ${time}`);
 }
 const missing=boat('missing',[[12,55.6],[12.02,55.6],[12.04,55.6],[12.06,55.6]],
  [4,null,6,6],[0,10,20,30]);
 const missingPacked=packReferenceStations(prepareReferencePassages(missing).stations);
 assert.equal(packedReferenceAtProgress(projectedTrackSample(missing,start).progress,missingPacked),null);
 sameSample(packedReferenceAtProgress(projectedTrackSample(missing,start+20).progress,missingPacked),
  projectedTrackSample(missing,start+20),'valid passage after missing SOG');
});

test('prepared source samples contain split progress and VMG plus endpoint padding independently of any reference',()=>{
 const source=boat('source',[[12,55.6],[12.03,55.6],[12.08,55.6]],[4,7,6],[0,11,18]);
 const before=prepareProjectedTrack(source);
 assert.equal(before.length,(source.points.length+1)*3);
 assert.equal(before.BYTES_PER_ELEMENT,4);
 for(let i=0;i<source.points.length;i++){
  const sample=projectedTrackSample(source,source.points[i][2]),offset=i*3;
  near(before[offset]+before[offset+1],sample.progress,1e-12,`source progress ${i}`);
  near(before[offset+2],sample.vmg,1e-5,`source VMG ${i}`);
 }
 assert.deepEqual(Array.from(before.slice(-3)),Array.from(before.slice(-6,-3)));
 const forbidden=()=>{throw Error('Source preparation consulted reference data');};
 const saved={prepareReferencePassages:context.prepareReferencePassages,
  packReferenceStations:context.packReferenceStations,packedReferenceAtProgress:context.packedReferenceAtProgress};
 try{
  Object.assign(context,{prepareReferencePassages:forbidden,packReferenceStations:forbidden,
   packedReferenceAtProgress:forbidden,referenceAtProgress:forbidden,referenceBoat:forbidden});
  Object.defineProperty(context,'referencePassages',{configurable:true,get:forbidden});
  assert.deepEqual(Array.from(prepareProjectedTrack(source)),Array.from(before));
 }finally{
  Object.assign(context,saved);
  delete context.referenceAtProgress;delete context.referenceBoat;delete context.referencePassages;
 }
 const empty=prepareProjectedTrack(boat('empty',[],[]));
 assert.equal(empty.length,3);
 assert.ok(empty[2]<-1e19);
 const missing=prepareProjectedTrack({...source,speeds:[null,null,null]});
 for(let i=2;i<missing.length;i+=3)assert.ok(missing[i]<-1e19);
});
