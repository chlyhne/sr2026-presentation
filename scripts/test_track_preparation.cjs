const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test');
const source=['track-time.js','tracks.js','rhumbline-geometry.js','track-preparation-math.js'].map(name=>fs.readFileSync(path.resolve(__dirname,'../viewer',name),'utf8')).join('\n');
const api=vm.runInNewContext(source+'\n;({prepareTrackData,compareTrackData,buildRhumbRoute});');
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
 reference.profile[1]=infinity;result.knots[2]=infinity;
 const compared=api.compareTrackData(result.knots,2,reference.profile,600,500,result.mirror.stations.length);
 assert.ok(compared.colours[2][0]<-1e19,'Two infinite densities must stay missing, not appear equal');
 reference.profile[1]=1;const finite=api.compareTrackData(result.knots,2,reference.profile,600,500,result.mirror.stations.length);
 assert.ok(finite.colours[2][0]<-1e15);
});
test('Straight and cubic presentations use identical prepared comparison profiles',()=>{
 const input=boat([[12,55.6],[12.04,55.603],[12.1,55.6]],[5,9,7]),line=prepare(input,true),curve=prepare(input,false);
 assert.deepEqual([...line.profile],[...curve.profile]);assert.deepEqual([...line.knots],[...curve.knots]);
 assert.equal(line.geometry.length*2,curve.geometry.length);assert.equal(line.record.capBytes,0);assert.ok(curve.record.capCount>0);
});
test('CPU comparison prepares all three bases with handicap and overflow semantics',()=>{
 const reference=prepare(straight(6)),own=prepare(straight(9)),count=own.mirror.stations.length;
 const result=api.compareTrackData(own.knots,2,reference.profile,600,500,count);
 near(result.colours[0][0],3);near(result.colours[1][0],6);
 near(result.colours[2][0],100*(3600/(1852*6)-3600/(1852*9)));
 const noHandicap=api.compareTrackData(own.knots,2,reference.profile,0,500,count);assert.ok(noHandicap.colours[1][0]<-1e19);
 const absent=api.compareTrackData(own.knots,2,new Float32Array(reference.profile.length).fill(-1e20),600,500,count);
 assert.ok(absent.colours.every(values=>values[0]<-1e19));
});
