const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');

const root=path.resolve(__dirname,'..'),start=1781164800;
const radius=6371008.8,rad=Math.PI/180;
function setup(length=207,latitude=55.6){
 const longitude=meters=>12+meters/(radius*rad*Math.cos(latitude*rad));
 const context=vm.createContext({D:{start}});
 for(const file of ['track-time.js','tracks.js','rhumbline-geometry.js','navigation-math.js']){
  vm.runInContext(fs.readFileSync(path.join(root,'viewer',file),'utf8'),context,{filename:file});
 }
 context.routePoints=[[longitude(0),latitude],[longitude(length),latitude]];
 vm.runInContext('let rhumbRoute=buildRhumbRoute(routePoints);',context);
 function boat(meters,speeds,times=meters.map((_,i)=>i*60)){
  return {id:'test',points:meters.map((m,i)=>[longitude(m),latitude,start+times[i]]),speeds};
 }
 return {context,boat,total:vm.runInContext('rhumbRoute.total',context)};
}
function near(actual,expected,tolerance=1e-8){
 assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,`${actual} expected ${expected} within ${tolerance}`);
}
const encode=speed=>Math.round(Math.max(0,Math.min(25,speed))*1022/25);

test('packed 10-bit codes cover every value, byte boundary and partial final group',()=>{
 const {context:c}=setup();
 for(const count of [...Array.from({length:18},(_,index)=>index),1024]){
  const codes=Array.from({length:count},(_,index)=>count===1024?index:(index*277+1023)%1024);
  const packed=c.packSpeedCodes(codes),expected=new Uint8Array(Math.ceil(count*10/8));
  for(let index=0;index<count;index++)for(let bit=0;bit<10;bit++){
   if(codes[index]&(1<<bit))expected[Math.floor((index*10+bit)/8)]|=1<<((index*10+bit)%8);
  }
  assert.deepEqual(Array.from(packed),Array.from(expected));
  assert.deepEqual(Array.from(c.unpackSpeedCodes(packed,count)),codes);
  const unaligned=new Uint8Array(packed.length+3);unaligned.set(packed,1);
  assert.deepEqual(Array.from(c.unpackSpeedCodes(unaligned.subarray(1,1+packed.length),count)),codes);
  if(count%4){
   packed[packed.length-1]|=1<<(count*10%8);
   assert.throws(()=>c.unpackSpeedCodes(packed,count),/padding/);
  }
 }
 for(const code of [-1,1024,NaN,Infinity,.5])assert.throws(()=>c.packSpeedCodes([code]),/code/);
 for(const count of [-1,.5,NaN,Infinity])assert.throws(()=>c.unpackSpeedCodes(new Uint8Array(),count),/length or type/);
 assert.throws(()=>c.unpackSpeedCodes(new Uint16Array(2),1),/length or type/);
 assert.throws(()=>c.unpackSpeedCodes(new Uint8Array(1),1),/length or type/);
 assert.equal(c.packSpeedCodes([0,1,1022,1023]).byteLength,5);
});

test('uint10 fixed point clips to 0..25 kn and reserves only 1023 for missing',()=>{
 const {context:c,boat}=setup();
 assert.deepEqual(Array.from(vm.runInContext('[REFERENCE_STATION_METERS,REFERENCE_SPEED_MAX,REFERENCE_SPEED_SCALE,REFERENCE_MISSING]',c)),[10,25,1022/25,1023]);
 for(const speed of [0,.03,.05,1,6.789,12.5,24.99,25,26,100]){
  const profile=c.prepareReferenceProfile(boat([20,180],[speed,speed]));
  assert.equal(profile.BYTES_PER_ELEMENT,2);
  assert.equal(Object.prototype.toString.call(profile),'[object Uint16Array]');
  assert.equal(profile[10],encode(speed));
  const result=c.referenceAtStation(10,profile);
  assert.deepEqual(Object.keys(result),['vmg']);
  near(result.vmg,encode(speed)*25/1022);
  near(c.packedReferenceAtProgress(100/1852,profile).vmg,result.vmg);
  if(speed<=25)near(result.vmg,speed,25/1022/2+1e-12);
  assert.equal(profile[0],1023);
 }
 const original=c.projectedTrackSample;
 c.projectedTrackSample=(reference,time,...prepared)=>{
  const sample=original(reference,time,...prepared);return sample?{...sample,vmg:-3}:null;
 };
 assert.equal(c.prepareReferenceProfile(boat([20,180],[6,6]))[10],0);
 c.projectedTrackSample=original;
 const values=new Uint16Array([0,511,1022,1023]);
 assert.equal(c.referenceAtStation(3,values),null);
 for(const index of [-1,4,NaN,Infinity,.5])assert.equal(c.referenceAtStation(index,values),null);
 near(c.referenceAtStation(0,values).vmg,0);
 near(c.referenceAtStation(2,values).vmg,25);
});

test('count, nearest physical 10 m index, outside rejection and exact final endpoint',()=>{
 for(const latitude of [0,55.6,80]){
  const {context:c,boat,total}=setup(207,latitude);
  assert.equal(c.referenceStationCount(),Math.ceil(total*1852/10)+1);
  assert.equal(c.referenceStationCount(),22);
  for(let index=0;index<=20;index++){
   assert.equal(c.referenceStationIndex(index*10/1852),index);
   if(index)near((index*10/1852-(index-1)*10/1852)*1852,10);
  }
  assert.equal(c.referenceStationIndex(14.999999/1852),1);
  assert.equal(c.referenceStationIndex(15/1852),2);
  assert.equal(c.referenceStationIndex(15.000001/1852),2);
  for(const progress of [-1e-15,total+1e-15,NaN,Infinity,-Infinity]){
   assert.equal(c.referenceStationIndex(progress),-1);
   assert.equal(c.packedReferenceAtProgress(progress,new Uint16Array(22)),null);
  }
  const profile=c.prepareReferenceProfile(boat([0,207],[0,25]));
  assert.equal(profile.length,22);
  assert.equal(profile.byteLength,44);
  for(let index=0;index<=20;index++)assert.equal(profile[index],encode(25*index*10/207));
  assert.equal(profile[21],1022);
  near(c.packedReferenceAtProgress(total,profile).vmg,25);
 }
 const {context:c}=setup();
 vm.runInContext('rhumbRoute=buildRhumbRoute([])',c);
 assert.equal(c.referenceStationCount(),1);
 assert.deepEqual(Array.from(c.prepareReferenceProfile({points:[],speeds:[]})),[1023]);
 assert.equal(c.packedReferenceAtProgress(0,new Uint16Array([1023])),null);
});

test('both endpoints quantize coverage to nearest nodes and clamp VMG to passage bounds',()=>{
 const {context:c,boat}=setup();
 const profile=c.prepareReferenceProfile(boat([24,66],[4,12]));
 assert.equal(profile[1],1023);
 assert.equal(profile[2],encode(4));
 assert.equal(profile[7],encode(12));
 assert.equal(profile[8],1023);
 assert.equal(c.referenceStationIndex(24/1852),2);
 assert.equal(c.referenceStationIndex(66/1852),7);
 assert.ok(c.packedReferenceAtProgress(24/1852,profile));
 assert.ok(c.packedReferenceAtProgress(66/1852,profile));
 const short=c.prepareReferenceProfile(boat([27,29],[3,9]));
 assert.equal(short[3],encode(9));
 assert.equal(Array.from(short).filter(value=>value!==1023).length,1);
});

test('earliest forward overlap wins; reversing alone fills no nodes',()=>{
 const {context:c,boat}=setup();
 const reference=boat([0,80,10,180],[4,4,9,9],[0,60,120,180]);
 const profile=c.prepareReferenceProfile(reference);
 assert.equal(profile[3],encode(4));
 assert.equal(profile[6],encode(4));
 assert.equal(profile[12],encode(9));
 assert.ok(Array.from(c.prepareReferenceProfile(boat([180,20],[8,8]))).every(value=>value===1023));
 const short=c.prepareReferenceProfile(boat([27,29,100,101],[3,3,9,9],[0,10,311,321]));
 assert.equal(short[3],encode(3));
});

test('gaps above 300 s, missing SOG, undefined direction and outside samples remain missing',()=>{
 const {context:c,boat}=setup();
 const reference=boat([10,40,100,140],[6,6,9,9],[0,60,361,421]);
 const profile=c.prepareReferenceProfile(reference);
 assert.equal(profile[3],encode(6));
 assert.equal(profile[12],encode(9));
 for(let index=5;index<=9;index++)assert.equal(profile[index],1023);
 assert.equal(c.projectedTrackSample(reference,start+200),null);
 for(const speeds of [[null,null],[6,null],[undefined,8],[-1,8],[NaN,8],undefined]){
  const missing=boat([10,180],speeds);
  assert.equal(c.projectedTrackSample(missing,start+30),null);
  assert.ok(Array.from(c.prepareReferenceProfile(missing)).every(value=>value===1023));
 }
 for(const reference of [boat([10,180],[6,6],[0,301]),boat([-100,-20],[6,6]),boat([230,280],[6,6]),boat([30,30],[6,6])]){
  assert.ok(Array.from(c.prepareReferenceProfile(reference)).every(value=>value===1023));
 }
 assert.ok(c.prepareReferenceProfile(boat([10,180],[6,6],[0,300])).some(value=>value!==1023));
 const missing=boat([10,40,80,140],[6,null,9,9]);
 const missingProfile=c.prepareReferenceProfile(missing);
 for(let index=0;index<=7;index++)assert.equal(missingProfile[index],1023);
 assert.equal(missingProfile[10],encode(9));
});

test('source PCHIP sampling is bounded by physical distance without a five second subdivision',()=>{
 const {context:c,boat}=setup(1500);
 const original=c.projectedTrackSample,sampled=[];
 c.projectedTrackSample=(reference,time,...prepared)=>{sampled.push(time);return original(reference,time,...prepared);};
 c.prepareReferenceProfile(boat([20,28],[6,6],[0,300]));
 assert.deepEqual(sampled,[start,start+300]);
 sampled.length=0;
 const fast=boat([0,1000,1500],[4,8,7],[0,1,2]);
 c.prepareReferenceProfile(fast);
 assert.ok(sampled.length>150);
 for(let i=1;i<sampled.length;i++){
  const a=c.trackPosition(fast.points,sampled[i-1]).point,b=c.trackPosition(fast.points,sampled[i]).point;
  assert.ok(c.rhumbLeg(a,b).distance*1852<=10+1e-6);
 }
 sampled.length=0;
 const curved=boat([0,500,1400],[5,7,9],[0,100,200]);
 curved.points[1][1]+=.002;
 c.prepareReferenceProfile(curved);
 for(let i=1;i<sampled.length;i++){
  const a=c.trackPosition(curved.points,sampled[i-1]).point,b=c.trackPosition(curved.points,sampled[i]).point;
  assert.ok(c.rhumbLeg(a,b).distance*1852<=10+1e-6);
 }
});

test('source buffers contain integer station index, progress and own VMG plus endpoint padding independently of references',()=>{
 const {context:c,boat}=setup();
 const source=boat([24,66,180],[4,7,6],[0,60,120]);
 const before=c.prepareProjectedTrack(source);
 assert.equal(before.length,(source.points.length+1)*3);
 assert.equal(before.BYTES_PER_ELEMENT,4);
 for(let i=0;i<source.points.length;i++){
  const sample=c.projectedTrackSample(source,source.points[i][2]),offset=i*3;
  assert.equal(before[offset],c.referenceStationIndex(sample.progress));
  assert.ok(Number.isInteger(before[offset]));
  near(before[offset+1],sample.progress,1e-7);
  near(before[offset+2],c.quantizeProjectedSpeed(sample.vmg),1e-6);
  near(before[offset+2],sample.vmg,.05);
 }
 assert.deepEqual(Array.from(before.slice(-3)),Array.from(before.slice(-6,-3)));
 const forbidden=()=>{throw Error('Source preparation consulted reference data');};
 Object.assign(c,{prepareReferenceProfile:forbidden,referenceAtStation:forbidden,packedReferenceAtProgress:forbidden});
 assert.deepEqual(Array.from(c.prepareProjectedTrack(source)),Array.from(before));
 const empty=c.prepareProjectedTrack(boat([],[]));
 assert.deepEqual(Array.from(empty),[-1,0,Math.fround(-1e20)]);
 const missing=c.prepareProjectedTrack(boat([10,180],[6,6],[0,301]));
 for(let offset=0;offset<missing.length;offset+=3){assert.equal(missing[offset],-1);assert.ok(missing[offset+2]<-1e19);}
 const reverse=c.prepareProjectedTrack(boat([180,20],[8,8]));
 near(reverse[2],-8,.05);
});

test('ordered profile preparation reuses interval indices and PCHIP evaluations including duplicate times',()=>{
 const {context,boat}=setup(1500);
 const source=boat([0,200,300,900,1200,1400],[4,5,6,7,8,9],[0,30,30,120,120,180]);
 source.points[3][1]+=.002;
 const originalValue=context.trackValue,originalSample=context.projectedTrackSample;
 const expectedSamples=source.points.map(point=>originalSample(source,point[2]));
 context.projectedTrackSample=(reference,time)=>originalSample(reference,time);
 const expectedProfile=context.prepareReferenceProfile(source);
 let interpolations=0,interiorSamples=0;
 context.trackValue=(...args)=>{interpolations++;return originalValue(...args);};
 context.timeBoundary=()=>{throw Error('Ordered preparation must not binary-search timestamps');};
 context.projectedTrackSample=(reference,time,index,evaluation)=>{
  if(time!==reference.points[index][2]){
   interiorSamples++;assert.ok(evaluation);assert.equal(evaluation.point[2],time);
  }
  return originalSample(reference,time,index,evaluation);
 };
 const packed=context.prepareProjectedTrack(source);
 for(const [index,sample] of expectedSamples.entries()){
  assert.equal(packed[index*3],sample?context.referenceStationIndex(sample.progress):-1);
  assert.equal(packed[index*3+1],Math.fround(sample?.progress??0));
  assert.equal(packed[index*3+2],Math.fround(sample?context.quantizeProjectedSpeed(sample.vmg):-1e20));
 }
 assert.deepEqual(Array.from(context.prepareReferenceProfile(source)),Array.from(expectedProfile));
 assert.ok(interiorSamples>100);assert.equal(interpolations,interiorSamples);
});

test('route projection computes geographic progress only for the winning leg and preserves ties',()=>{
 const {context}=setup();
 const route=context.buildRhumbRoute([[12,55],[12.1,55],[12.2,55],[12.3,55]]);
 const original=context.rhumbLeg;let calculations=0;
 context.rhumbLeg=(...args)=>{calculations++;return original(...args);};
 const projected=context.projectOnRhumbRoute([12.25,55],route);
 assert.equal(calculations,1);assert.equal(projected.leg,2);
 near(projected.progress,route.legs[2].start+original([12.2,55],[12.25,55]).distance);
 const joined=context.projectOnRhumbRoute([12.1,55],route);
 assert.equal(joined.leg,0);assert.equal(joined.outside,false);
 assert.equal(context.projectOnRhumbRoute([11.9,55],route).outside,true);
 assert.equal(context.projectOnRhumbRoute([12.4,55],route).outside,true);
 assert.equal(context.projectOnRhumbRoute([12,55],{legs:[],total:0}),null);
});

test('source station indices survive Float32 rounding at a nearest-node boundary',()=>{
 const {context:c,boat}=setup(100000);
 const indices=[],progress=[];
 for(const meters of [90004.99999,90005.00001]){
  const source=boat([meters,meters+20],[6,6]);
  const sample=c.projectedTrackSample(source,start);
  const prepared=c.prepareProjectedTrack(source);
  assert.equal(prepared[0],c.referenceStationIndex(sample.progress));
  indices.push(prepared[0]);progress.push(prepared[1]);
 }
 assert.deepEqual(indices,[9000,9001]);
 assert.equal(progress[0],progress[1]);
});

test('generator VM exposes only the nominal profile API and strict bundled v6 format validation',()=>{
 const generator=require('./prepare_track_profiles.cjs');
 const math=generator.loadNominalMath();
 assert.ok(math.D&&Array.isArray(math.boats));
 for(const name of ['prepareReferenceProfile','prepareProjectedTrack','prepareTimeProfiles','referenceStationCount'])assert.equal(typeof math[name],'function');
 assert.equal(math.prepareReferencePassages,undefined);
 assert.equal(math.packReferenceStations,undefined);
 assert.equal(Object.prototype.toString.call(math.prepareReferenceProfile({points:[],speeds:[]})),'[object Uint16Array]');
 const state={sourceFingerprint:'test'},prefix='track-profiles/test/';
 const manifest={version:6,sourceFingerprint:'test',stationCount:22,stationSpacingMeters:10,profileEncoding:'uint10-packed',speedMaximum:25,speedCodes:1022,missingValue:1023,sampleMissingValue:-1e20,sampleWords:3,samplePositionBytes:8,speedBits:10,sampleEncoding:'uint10-speed-planar',speedSignEncoding:'signed-station-index',stationWords:1,timeEncoding:'uint10-block-scaled-seconds-per-meter',timeBits:10,timeBlockSize:256,timeCodes:1021,timeInfinity:1022,timeSampleWords:2,timeStationWords:1,byteOrder:'little-endian',bundleFile:prefix+'fleet.bin',bundleBytes:103,boats:[{id:'one',pointCount:2,stationCount:22,sampleOffset:0,timeSampleOffset:28,profileOffset:43,timeProfileOffset:71}]};
 const saved={existsSync:fs.existsSync,readFileSync:fs.readFileSync,statSync:fs.statSync};
 let current=manifest,bundleSize=103;
 try{
  fs.existsSync=()=>true;
  fs.readFileSync=()=>JSON.stringify(current);
  fs.statSync=()=>({size:bundleSize});
  assert.deepEqual(generator.currentManifest(state),manifest);
  for(const [key,value] of Object.entries({version:4,stationSpacingMeters:5,profileEncoding:'float16',speedMaximum:15,speedCodes:1023,missingValue:-1e20,sampleMissingValue:1023,sampleWords:2,samplePositionBytes:12,sampleEncoding:'float32',speedSignEncoding:'none',stationWords:8,timeEncoding:'uint10',timeBits:8,timeBlockSize:128,timeCodes:1022,timeInfinity:1023,timeSampleWords:1,timeStationWords:2,byteOrder:'big-endian',stationCount:0})){
   current={...manifest,[key]:value};assert.equal(generator.currentManifest(state),null,key);
  }
  for(const [key,value] of Object.entries({sampleOffset:1,timeSampleOffset:29,profileOffset:26,timeProfileOffset:81,pointCount:Number.MAX_SAFE_INTEGER})){
   current={...manifest,boats:[{...manifest.boats[0],[key]:value}]};assert.equal(generator.currentManifest(state),null,key);
  }
  for(const [key,value] of Object.entries({bundleFile:prefix+'../fleet.bin',bundleBytes:104})){
   current={...manifest,[key]:value};assert.equal(generator.currentManifest(state),null,key);
  }
  current=manifest;bundleSize=102;
  assert.equal(generator.currentManifest(state),null);
  bundleSize=104;
  assert.equal(generator.currentManifest(state),null);
 }finally{Object.assign(fs,saved);}
});


test('bundled loader fetches once, decodes unaligned ranges and rejects corrupt data atomically',async()=>{
 const crypto=require('node:crypto'),{packProjectedTrack}=require('./prepare_track_profiles.cjs');
 async function run(mutate=()=>{}){
  const {context,boat}=setup();
  const fleet=[boat([24,66,180],[4,7,6]),{...boat([180,80,20],[8,7,6]),id:'second'}];
  const definition={version:1,points:context.routePoints},fingerprint='a'.repeat(64),chunks=[],entries=[];
  let offset=0;
  for(const source of fleet){
   const samples=packProjectedTrack(context.prepareProjectedTrack(source)),profile=context.prepareReferenceProfile(source);
   const {timeSamples,timeStations}=context.prepareTimeProfiles(source),packedTimes=context.packTimeSamples(timeSamples),packedTimeProfile=context.packTimeValues(timeStations);
   const timeSampleOffset=offset+samples.byteLength,profileOffset=timeSampleOffset+packedTimes.byteLength;
   const packedProfile=context.packSpeedCodes(profile);
   entries.push({id:source.id,pointCount:source.points.length,stationCount:profile.length,sampleOffset:offset,timeSampleOffset,profileOffset,timeProfileOffset:profileOffset+packedProfile.byteLength});
   chunks.push(Buffer.from(samples),Buffer.from(packedTimes),Buffer.from(packedProfile),Buffer.from(packedTimeProfile));offset=profileOffset+packedProfile.byteLength+packedTimeProfile.byteLength;
  }
  const manifest={version:6,sourceFingerprint:fingerprint,dataDigest:'b'.repeat(64),rhumblineDigest:crypto.createHash('sha256').update(JSON.stringify(definition)).digest('hex'),start,byteOrder:'little-endian',stationCount:context.referenceStationCount(),stationSpacingMeters:10,profileEncoding:'uint10-packed',speedMaximum:25,speedCodes:1022,missingValue:1023,sampleMissingValue:-1e20,sampleWords:3,samplePositionBytes:8,speedBits:10,sampleEncoding:'uint10-speed-planar',speedSignEncoding:'signed-station-index',stationWords:1,timeEncoding:'uint10-block-scaled-seconds-per-meter',timeBits:10,timeBlockSize:256,timeCodes:1021,timeInfinity:1022,timeSampleWords:2,timeStationWords:1,bundleFile:`track-profiles/${fingerprint}/fleet.bin`,bundleBytes:offset,boats:entries};
  const state={manifest,body:Buffer.concat(chunks)},requests=[];
  mutate(state);
  Object.assign(context,{boats:fleet,window:{SR_RHUMBLINE:definition},crypto:crypto.webcrypto,TextEncoder,fetch:async name=>{
   requests.push(name);
   return {ok:true,json:async()=>state.manifest,arrayBuffer:async()=>Uint8Array.from(state.body).buffer};
  }});
  context.D.toJSON=()=>{throw Error('Full DATA must not be serialized');};
  vm.runInContext(fs.readFileSync(path.join(root,'viewer','track-profiles.js'),'utf8'),context);
  let error;
  try{await context.loadTrackProfiles();}catch(caught){error=caught;}
  context.fixtureFleet=fleet;
  const profiles=vm.runInContext('fixtureFleet.map(boat=>trackProfileCache.get(boat.points))',context);
  return {context,fleet,profiles,requests,error};
 }
 const valid=await run();
 assert.equal(valid.error,undefined);assert.equal(valid.requests.length,2);
 for(const [index,source] of valid.fleet.entries()){
  const profile=valid.profiles[index];
  assert.deepEqual(Array.from(profile.samples),Array.from(valid.context.prepareProjectedTrack(source)));
  assert.deepEqual(Array.from(profile.stations),Array.from(valid.context.prepareReferenceProfile(source)));
  const times=valid.context.prepareTimeProfiles(source);
  assert.deepEqual(Array.from(profile.timeSamples),Array.from(valid.context.unpackTimeSamples(valid.context.packTimeSamples(times.timeSamples),source.points.length)));
  assert.deepEqual(Array.from(profile.timeStations),Array.from(valid.context.unpackTimeValues(valid.context.packTimeValues(times.timeStations),times.timeStations.length)));
  assert.equal(profile.stations.buffer.byteLength,profile.stations.byteLength);
 }
 for(const mutate of [
  state=>{state.manifest.version=2;},
  state=>{state.manifest.bundleFile='../fleet.bin';},
  state=>{state.manifest.bundleBytes++;},
  state=>{state.manifest.boats[1].sampleOffset--;},
  state=>{state.manifest.boats[1].profileOffset++;},
  state=>{state.manifest.boats[1].timeSampleOffset++;},
  state=>{state.manifest.boats[1].timeProfileOffset++;},
  state=>{state.body=state.body.subarray(1);},
  state=>{state.body=Buffer.concat([state.body,Buffer.alloc(1)]);},
  state=>{state.body.writeFloatLE(NaN,state.manifest.boats[1].sampleOffset);},
  state=>{state.body.writeFloatLE(999,state.manifest.boats[1].sampleOffset);},
  state=>{state.body.writeFloatLE(0,state.manifest.boats[1].sampleOffset+24);},
  state=>{state.body[state.manifest.boats[1].profileOffset+Math.ceil(state.manifest.stationCount*10/8)-1]|=128;},
  state=>{state.body.writeFloatLE(NaN,state.manifest.boats[1].timeProfileOffset);},
  state=>{state.body.writeFloatLE(-Infinity,state.manifest.boats[1].timeProfileOffset);},
  state=>{state.body.writeFloatLE(-1,state.manifest.boats[1].timeSampleOffset+4);},
  state=>{state.body.writeFloatLE(999,state.manifest.boats[1].timeSampleOffset);},
  state=>{state.body[state.manifest.boats[1].profileOffset-1]|=128;},
  state=>{state.manifest.speedBits=8;},
  state=>{state.manifest.sampleEncoding='uint8-speed-planar';}
 ]){
  const invalid=await run(mutate);
  assert.ok(invalid.error);assert.ok(invalid.profiles.every(profile=>profile===undefined));
 }
});

test('shared source speed quantization preserves sign, clips magnitudes and stays within .013 kn',()=>{
 const {context:c,boat}=setup();
 for(const speed of [-100,-25,-24.99,-12.5,-8,-.03,-0,0,.03,8,12.5,24.99,25,100]){
  const expected=Math.sign(speed)*encode(Math.abs(speed))*25/1022;
  assert.equal(c.quantizeProjectedSpeed(speed),expected);
  near(c.quantizeProjectedSpeed(speed),Math.max(-25,Math.min(25,speed)),.013);
 }
 for(const speed of [NaN,Infinity,-Infinity,null,undefined])assert.throws(()=>c.quantizeProjectedSpeed(speed),/finite/);
 for(const speed of [.03,8,24.99,25,100]){
  for(const meters of [[20,180],[180,20]]){
   const source=boat(meters,[speed,speed]);
   const sample=c.projectedTrackSample(source,start);
   const prepared=c.prepareProjectedTrack(source);
   assert.equal(prepared[2],Math.fround(c.quantizeProjectedSpeed(sample.vmg)));
   near(prepared[2],Math.max(-25,Math.min(25,sample.vmg)),.013);
  }
 }
});

test('planar source packing uses 8 position bytes plus packed 10-bit speeds and roundtrips through nominal browser decoder',()=>{
 const {packProjectedTrack}=require('./prepare_track_profiles.cjs');
 const {context:c,boat}=setup();
 for(const source of [boat([24,66,180],[4,7,6]),boat([180,80,20],[100,8,.03]),boat([10,180],[6,6],[0,301]),boat([],[])]){
  const samples=c.prepareProjectedTrack(source),bytes=packProjectedTrack(samples),count=source.points.length+1;
  assert.equal(Object.prototype.toString.call(bytes),'[object Uint8Array]');
  assert.equal(bytes.byteLength,count*8+Math.ceil(count*10/8));
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let i=0;i<count;i++){
   const index=samples[i*3],speed=samples[i*3+2],negative=speed<0||Object.is(speed,-0);
   assert.equal(view.getFloat32(i*8,true),index===-1?-1:negative?-index-2:index);
   assert.equal(view.getFloat32(i*8+4,true),samples[i*3+1]);
   assert.equal(c.unpackSpeedCodes(bytes.subarray(count*8),count)[i],index===-1?1023:encode(Math.abs(speed)));
  }
  const decoded=c.unpackProjectedTrack(bytes);
  assert.deepEqual(Array.from(decoded),Array.from(samples));
  assert.equal(decoded.BYTES_PER_ELEMENT,4);
  const offsetBytes=new Uint8Array(bytes.length+7);offsetBytes.set(bytes,3);
  assert.deepEqual(Array.from(c.unpackProjectedTrack(offsetBytes.subarray(3,3+bytes.length))),Array.from(samples));
 }
 const signedZero=new Float32Array([0,0,-0,0,0,0,1,.1,-.03,1,.1,100,2,.2,-100,-1,0,-1e20]);
 const bytes=packProjectedTrack(signedZero),count=signedZero.length/3,view=new DataView(bytes.buffer);
 assert.equal(view.getFloat32(0,true),-2);
 assert.deepEqual(Array.from(c.unpackSpeedCodes(bytes.subarray(count*8),count)),[0,0,1,1022,1022,1023]);
 const decoded=c.unpackProjectedTrack(bytes);
 assert.ok(Object.is(decoded[2],-0));
 near(decoded[8],-25/1022,1e-8);
 assert.equal(decoded[11],25);
 assert.equal(decoded[14],-25);
 assert.equal(decoded[15],-1);
 assert.ok(decoded[17]<-1e19);
 assert.equal(c.unpackProjectedTrack(new Uint8Array()).length,0);
});

test('nominal source decoder rejects malformed bytes and inconsistent missing markers',()=>{
 const {context:c}=setup();
 const {packProjectedTrack}=require('./prepare_track_profiles.cjs');
 for(const input of [new Uint8Array(8),new Uint8Array(9),new Float32Array(9),[],null])assert.throws(()=>c.unpackProjectedTrack(input),/length or type/);
 function packed(index,progress,code){
  const bytes=new Uint8Array(10),view=new DataView(bytes.buffer);
  view.setFloat32(0,index,true);view.setFloat32(4,progress,true);bytes.set(c.packSpeedCodes([code]),8);return bytes;
 }
 for(const index of [NaN,Infinity,-Infinity,.5,-2.5])assert.throws(()=>c.unpackProjectedTrack(packed(index,0,10)),/position/);
 for(const progress of [NaN,Infinity,-Infinity,-.1])assert.throws(()=>c.unpackProjectedTrack(packed(0,progress,10)),/position/);
 for(const [index,code] of [[-1,0],[-1,1022],[0,1023],[-2,1023]])assert.throws(()=>c.unpackProjectedTrack(packed(index,0,code)),/mismatch/);
 for(const [index,code,expected] of [[0,0,0],[0,1022,25],[-2,1022,-25],[-3,511,-12.5]]){
  const decoded=c.unpackProjectedTrack(packed(index,0,code));
  assert.equal(decoded[0],index< -1?-index-2:index);assert.equal(decoded[2],expected);
 }
 for(const samples of [[0,0],[.5,0,8],[-2,0,8],[0,-1,8],[0,Infinity,8],[0,0,NaN]])assert.throws(()=>packProjectedTrack(samples));
});

test('time profiles add every forward and reverse passage, without changing speed profiles',()=>{
 const {context,boat}=setup();
 const source=boat([20,180,20,180],[4,4,4,4]);
 const before=context.prepareReferenceProfile(source),profile=context.prepareTimeProfiles(source),density=3600/(1852*4);
 for(const index of [3,8,10,15,17])near(profile.timeStations[index],3*density,1e-6);
 for(let index=0;index<profile.timeSamples.length;index+=2){
  assert.ok(profile.timeSamples[index]>=0);near(profile.timeSamples[index+1],density,1e-7);
 }
 assert.deepEqual(Array.from(profile.timeSamples.slice(-2)),Array.from(profile.timeSamples.slice(-4,-2)));
 assert.deepEqual(Array.from(context.prepareReferenceProfile(source)),Array.from(before));
 const reverse=context.prepareTimeProfiles(boat([180,20],[4,4]));
 near(reverse.timeStations[10],density,1e-7);
 assert.ok(reverse.timeSamples[1]>0);
 assert.ok(profile.timeStations[0]< -1e19);
});

test('time projection uses measured SOG and finite difference direction, not positional speed',()=>{
 const {context,boat}=setup();
 const source=boat([20,180],[4,4],[0,1]),slowPositions=boat([20,180],[4,4],[0,300]);
 assert.deepEqual(Array.from(context.prepareTimeProfiles(source).timeStations),Array.from(context.prepareTimeProfiles(slowPositions).timeStations));
 source.points[1][1]+=.001;
 const sample=context.projectedTimeSample(source,start),east=(source.points[1][0]-source.points[0][0])*Math.cos(source.points[0][1]*rad),north=.001;
 near(sample.secondsPerMeter,3600/(1852*4*east/Math.hypot(east,north)),1e-9);
 const turning=boat([20,180,20],[4,4,4]);
 assert.equal(context.projectedTrackSample(turning,start+60),null);
 near(context.projectedTimeSample(turning,start+60).secondsPerMeter,3600/(1852*4));
});

test('station density does not depend on observation count and short revisits add separately',()=>{
 const {context,boat}=setup();
 const sparse=context.prepareTimeProfiles(boat([20,180],[4,4],[0,160]));
 const meters=Array.from({length:17},(_,index)=>20+10*index);
 const dense=context.prepareTimeProfiles(boat(meters,meters.map(()=>4),meters.map((_,index)=>10*index)));
 assert.deepEqual(Array.from(sparse.timeStations),Array.from(dense.timeStations));
 const short=context.prepareTimeProfiles(boat([27,29,27,29],[4,4,4,4]));
 near(short.timeStations[3],3*3600/(1852*4),1e-6);
 assert.equal(Array.from(short.timeStations).filter(value=>value>=0).length,1);
});

test('time profiles retain holes and missing SOG; stationary time is localized to its station',()=>{
 const {context,boat}=setup();
 const source=boat([10,40,100,140],[6,6,9,9],[0,60,361,421]),profile=context.prepareTimeProfiles(source);
 near(profile.timeStations[3],3600/(1852*6),1e-7);
 near(profile.timeStations[12],3600/(1852*9),1e-7);
 for(let index=5;index<=9;index++)assert.ok(profile.timeStations[index]< -1e19);
 for(const source of [boat([10,180],[null,null]),boat([10,180],[6,6],[0,301]),boat([-100,-20],[6,6]),boat([30,30],[6,6])]){
  assert.ok(Array.from(context.prepareTimeProfiles(source).timeStations).every(value=>value< -1e19));
 }
 const stopped=context.prepareTimeProfiles(boat([80,80],[0,0]));
 near(stopped.timeStations[8],6);
 assert.equal(stopped.timeSamples[1],Infinity);
 assert.equal(context.timeGainPer100Meters(stopped.timeSamples[1],stopped.timeStations[8])< -1e16,true);
 assert.equal(Array.from(stopped.timeStations).filter(value=>value>=0).length,1);
 const empty=context.prepareTimeProfiles(boat([],[]));
 assert.deepEqual(Array.from(empty.timeSamples),[-1,Math.fround(-1e20)]);
});

test('time densities use scaled packed 10-bit blocks, preserving infinity and missing values',()=>{
 const {context}=setup();
 for(const count of [0,1,2,3,4,255,256,257,511,512,513]){
  const values=Float32Array.from({length:count},(_,index)=>index%17===0?Infinity:index%19===0?-1e20:(index%256+.5)*(index<256?.01:100));
  const bytes=context.packTimeValues(values),unaligned=new Uint8Array(bytes.length+1);unaligned.set(bytes,1);
  assert.equal(bytes.length,Math.ceil(count/256)*4+Math.ceil(count*10/8));
  const decoded=context.unpackTimeValues(unaligned.subarray(1),count);
  for(let index=0;index<count;index++){
   if(!Number.isFinite(values[index])||values[index]<0){assert.equal(decoded[index],values[index]);continue;}
   const block=Math.floor(index/256),scale=new DataView(bytes.buffer).getFloat32(block*4,true);
   near(decoded[index],values[index],scale*.5001+Math.abs(values[index])*1e-7);
  }
  if(count%4&&count){
   bytes[bytes.length-1]|=1<<(count*10%8);
   assert.throws(()=>context.unpackTimeValues(bytes,count),/padding/);
  }
 }
 for(const value of [NaN,-Infinity,-1])assert.throws(()=>context.packTimeValues([value]),/density/);
 for(const scale of [0,-1,NaN,Infinity]){
  const bytes=context.packTimeValues([1]);new DataView(bytes.buffer).setFloat32(0,scale,true);
  assert.throws(()=>context.unpackTimeValues(bytes,1),/scale/);
 }
 assert.throws(()=>context.unpackTimeValues(new Uint8Array(3),1),/length or type/);
 assert.throws(()=>context.unpackTimeValues(new Float32Array(2),1),/length or type/);
});

test('time sample codec preserves station indices and restores identical terminal padding across block boundaries',()=>{
 const {context}=setup();
 for(const count of [0,1,255,256,257,511,512]){
  const samples=new Float32Array((count+1)*2);
  for(let index=0;index<count;index++){samples[index*2]=100000+index;samples[index*2+1]=index%2?Infinity:1+index/100;}
  if(count)samples.set(samples.subarray((count-1)*2,count*2),count*2);
  else {samples[0]=-1;samples[1]=-1e20;}
  const bytes=context.packTimeSamples(samples),decoded=context.unpackTimeSamples(bytes,count);
  assert.equal(bytes.length,count*4+context.packedTimeBytes(count));
  for(let index=0;index<count;index++)assert.equal(decoded[index*2],samples[index*2]);
  if(count)assert.deepEqual(Array.from(decoded.slice(-2)),Array.from(decoded.slice(-4,-2)));
  else assert.deepEqual(Array.from(decoded),Array.from(samples));
 }
});
