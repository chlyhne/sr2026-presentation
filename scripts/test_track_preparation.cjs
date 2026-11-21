const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test');
const source=['track-time.js','tracks.js','track-local-data.js','rhumbline-geometry.js','track-preparation-math.js'].map(name=>fs.readFileSync(path.resolve(__dirname,'../viewer',name),'utf8')).join('\n');
const api=vm.runInNewContext(source+'\n;({prepareTrackData,prepareLocalTrackData,restoreTrackTimeSamples,trackComparisonAt,buildRhumbRoute});');
const route=api.buildRhumbRoute([[12,55.6],[12.1,55.6]]),start=1780000000;
const boat=(points,speeds)=>({id:'fixture',name:'Fixture',points:points.map((p,i)=>[...p,start+i*240]),speeds});
const straight=speed=>boat([[12,55.6],[12.1,55.6]],[speed,speed]);
const prepare=(value,simple=false)=>api.prepareTrackData(value,route,start,simple);
const near=(actual,expected,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<=tolerance,actual+' != '+expected);

test('different course directions have distinct projections; an undefined route stays missing',()=>{
 const input=straight(6),forward=prepare(input),reverse=api.prepareTrackData(input,api.buildRhumbRoute([[12.1,55.6],[12,55.6]]),start,false);
 near(forward.knots[1],6);near(reverse.knots[1],-6);
 const absent=api.prepareTrackData(input,api.buildRhumbRoute([]),start,false);
 assert.equal(absent.record.denseSamples,0);assert.ok(absent.knots[1]<-1e19);assert.equal(absent.speed[0],6);
 assert.deepEqual([...absent.geometry],[...forward.geometry],'The display geometry is independent of the comparison route');
});
test('CPU preparation preserves straight-line VMG, time density and source SOG',()=>{
 const result=prepare(straight(6)),station=Math.floor((result.mirror.stations.length-1)/2);
 near(result.profile[station*4],6);near(result.profile[station*4+1],3600/(1852*6));
 near(result.knots[1],6);near(result.knots[2],3600/(1852*6));assert.equal(result.speed[0],6);
 const fast=prepare(straight(31.5));assert.equal(fast.speed[0],31.5);near(fast.knots[1],31.5);
});
test('CPU profiles sum forward and backward passages while keeping the first forward speed',()=>{
 const result=prepare(boat([[12,55.6],[12.1,55.6],[12,55.6]],[6,6,6])),station=Math.floor(result.mirror.stations.length/2);
 near(result.profile[station*4],6);near(result.profile[station*4+1],2*3600/(1852*6));
 assert.ok(result.knots[9]<0,'Return passage has negative VMG');
});
test('CPU profiles retain stationary dwell time and mark infinite point density',()=>{
 const result=prepare(boat([[12.05,55.6],[12.05,55.6]],[0,0])),station=result.knots[6];
 assert.ok(result.knots[2]>=1e15-1e8);near(result.profile[station*4+1],24);
 assert.ok(result.profile[station*4]<-1e19,'Stationary time is not a forward speed passage');
});
test('CPU preparation keeps gaps and missing measurements missing',()=>{
 const missing=prepare(straight(null));assert.equal(missing.speed[0],-1);assert.ok(missing.profile[4*100]<-1e19);assert.ok(missing.profile[4*100+1]<-1e19);
 const input=straight(6);input.points[1][2]=start+600;
 const gap=prepare(input,true);assert.equal(gap.record.denseSamples,0);assert.equal(gap.geometry[7],3);assert.equal(gap.geometry[15],3);
 assert.ok(gap.knots[1]<-1e19);assert.ok(gap.profile[4*100+1]<-1e19);
});
test('Stored Float32 overflow markers remain infinite during preparation and comparison',()=>{
 const reference=prepare(straight(6)),input=straight(6);input.speeds[0]=0;
 const result=prepare(input),station=Math.floor(result.mirror.stations.length/2),infinity=Math.fround(1e15);
 assert.equal(result.profile[station*4+1],infinity);
 reference.mirror.timeStations[0]=infinity;
 assert.ok(api.trackComparisonAt(result.mirror,reference.mirror,0,600,500)[2]<-1e19,'Two infinite densities remain missing');
 reference.mirror.timeStations[0]=1;
 assert.ok(api.trackComparisonAt(result.mirror,reference.mirror,0,600,500)[2]<-1e15);
});
test('Straight and cubic presentations use identical prepared comparison profiles',()=>{
 const input=boat([[12,55.6],[12.04,55.603],[12.1,55.6]],[5,9,7]),line=prepare(input,true),curve=prepare(input,false);
 assert.deepEqual([...line.profile],[...curve.profile]);assert.deepEqual([...line.knots],[...curve.knots]);
 assert.equal(line.geometry.length*2,curve.geometry.length);assert.equal(line.record.capBytes,0);assert.ok(curve.record.capCount>0);
});
test('CPU comparison prepares all three bases with handicap and overflow semantics',()=>{
 const reference=prepare(straight(6)).mirror,own=prepare(straight(9)).mirror;
 const result=api.trackComparisonAt(own,reference,0,600,500);
 near(result[0],3);near(result[1],6);
 near(result[2],100*(3600/(1852*6)-3600/(1852*9)));
 assert.ok(api.trackComparisonAt(own,reference,0,0,500)[1]<-1e19);
 reference.stations.fill(-1e20);reference.timeStations.fill(-1e20);
 assert.ok(api.trackComparisonAt(own,reference,0,600,500).every(value=>value< -1e19));
});

test('startup geometry preserves gap caps, precision splits and interpolation without route work',()=>{
 const input=boat([[12,55.6],[12.02,55.61],[12.03,55.62]],[6,7,null]);input.points[2][2]+=600;
 for(const simple of [false,true]){
  const local=api.prepareLocalTrackData(input,start,simple);
  assert.equal(local.record.pointCount,3);assert.equal(local.speed[2],-1);assert.equal(local.speed[3],-1);
  const stride=simple?8:16,timing=simple?4:12;
  assert.equal(local.geometry[timing+1],240);assert.equal(local.geometry[stride+timing+1],0);
  assert.ok(Math.abs(local.geometry[0]+(simple?0:local.geometry[2])-(12-9.5)*1000/4.5)<.0001);
  assert.equal(local.record.capCount,simple?0:4);
 }
});
test('direct station lookup covers both knots and the terminal slot',()=>{
 const own=prepare(straight(7)).mirror,reference=prepare(straight(6)).mirror;
 for(let i=0;i<=2;i++){
  const direct=api.trackComparisonAt(own,reference,i,450,500);
  near(direct[0],1);near(direct[1],7/(1+50*7/3600)-6);
  near(direct[2],100*(3600/(1852*6)-3600/(1852*7)));
 }
});

test('startup time samples restore reciprocal VMG including zero, reverse and missing values',()=>{
 for(const speed of [0,6,31.5,null]){
  const built=prepare(straight(speed)),restored=api.restoreTrackTimeSamples(built.mirror.samples);
  for(let i=0;i<restored.length;i++){
   const expected=built.mirror.timeSamples[i];
   if(expected< -1e19)assert.ok(restored[i]< -1e19);
   else near(restored[i],expected,Math.max(1e-6,Math.abs(expected)*2e-7));
  }
 }
 const restored=api.restoreTrackTimeSamples(prepare(straight(6)).mirror.samples);assert.ok(restored[1]>0);
 const returning=prepare(boat([[12,55.6],[12.1,55.6],[12,55.6]],[6,6,6]));
 const time=api.restoreTrackTimeSamples(returning.mirror.samples);assert.ok(time[3]>0,'reverse VMG has positive time density');
});
