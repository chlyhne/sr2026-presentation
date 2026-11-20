const {test}=require('node:test'),assert=require('node:assert/strict');
const {filterTrack}=require('./kalman_track_filter.cjs');
const policy={method:'bidirectional-kalman-v1',gapSeconds:300,minInnovationMetres:80,gateSquared:100,minNoiseMetres:3,maxNoiseMetres:50,minProcessNoise:.02,maxProcessNoise:.5};
const fix=(x,y,t)=>[10+x/(111195*Math.cos(55*Math.PI/180)),55+y/111195,1700000000000+t*1000,12.3];
function line(){return Array.from({length:80},(_,i)=>fix(i*15,0,i*3));}
test('Kalman removes kilometre spikes including endpoints and retains original native rows',()=>{
 for(const index of [0,1,35,78,79]){
  const points=line();points[index]=fix(index*15+5000,5000,index*3);
  const source=JSON.stringify(points),filtered=filterTrack(points,policy);
  assert.deepEqual(filtered.removed.map(p=>p.index),[index]);
  assert.equal(JSON.stringify(points),source);
  for(const p of filtered.points)assert.ok(points.includes(p));
 }
});
test('Kalman preserves tacks, smooth turns, sparse sampling and time gaps',()=>{
 const tack=Array.from({length:100},(_,i)=>fix(i<50?i*15:750,(i<50?0:i-50)*15,i*3));
 const circle=Array.from({length:100},(_,i)=>fix(100*Math.cos(i*.15),100*Math.sin(i*.15),i*3));
 const sparse=Array.from({length:80},(_,i)=>fix(i*120,i>40?(i-40)*300:0,i*120));
 const gap=line().concat(line().map(p=>[p[0]+1,p[1],p[2]+1000000,p[3]]));
 for(const points of [line(),tack,circle,sparse,gap])assert.equal(filterTrack(points,policy).removed.length,0);
});
test('Kalman fits GPS noise and leaves short disconnected segments unchanged',()=>{
 const points=Array.from({length:100},(_,i)=>fix(i*15+6*Math.sin(i*2.4),6*Math.cos(i*2.7),i*3));
 const result=filterTrack(points,policy);assert.equal(result.removed.length,0);
 assert.ok(result.fit.measurementNoiseMetres>=3&&result.fit.measurementNoiseMetres<20);
 const short=[fix(0,0,0),fix(5000,0,3),fix(10,0,6)];
 assert.deepEqual(filterTrack(short,policy).points,short);
 const isolated=Array.from({length:8},(_,i)=>fix(i*10000,0,i*1000));
 assert.deepEqual(filterTrack(isolated,policy).points,isolated);
 assert.throws(()=>filterTrack(line(),{}),/configuration/);
});
test('irregular timestamps and consecutive bad fixes are handled without rounding coordinates',()=>{
 const points=Array.from({length:80},(_,i)=>fix(i*i,0,i*i/5));
 points[35]=fix(5000,5000,35*35/5);points[36]=fix(5000,5000,36*36/5);
 assert.deepEqual(filterTrack(points,policy).removed.map(p=>p.index),[35,36]);
});
