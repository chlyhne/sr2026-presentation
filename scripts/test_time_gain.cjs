const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../viewer/navigation-math.js'),'utf8'),context);
const gain=context.timeGainPer100ReferenceMeters,knots=metersPerSecond=>metersPerSecond*3600/1852;
const near=(actual,expected)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-9,`${actual} ≈ ${expected}`);
// Integrate the displayed rate by the reference distance, not the boat's own
// travelled distance. Expected totals below come directly from arrival times.
function lossForVoyage(legs,referenceMetersPerSecond){
 return legs.reduce((loss,{seconds,speed})=>loss-gain(knots(speed),knots(referenceMetersPerSecond))*referenceMetersPerSecond*seconds/100,0);
}
test('5 kn reference: forward, stopped and backwards all have finite, ordered values',()=>{
 near(gain(5,5),0);near(gain(2.5,5),-100/(5*1852/3600)*.5);
 near(gain(0,5),-100/(5*1852/3600));
 near(gain(-2.5,5),-100/(5*1852/3600)*1.5);
 near(gain(-5,5),-100/(5*1852/3600)*2);
 assert.ok(gain(-5,5)<gain(-2.5,5)&&gain(-2.5,5)<gain(0,5));
 near(gain(8,5),-gain(2,5));
 assert.ok(Math.abs(gain(-1e-8,5)-gain(1e-8,5))<1e-6,'No singularity when own progress crosses zero');
});
test('A–B in 100 s versus A–B–A–B in 300 s loses exactly 200 s',()=>{
 const outward={seconds:100,speed:1},backward={seconds:100,speed:-1};
 near(lossForVoyage([outward],1),0);
 near(lossForVoyage([backward],1),200);
 near(lossForVoyage([outward,backward,outward],1),300-100);
});
test('a minute stopped costs a minute, and is counted once when progress resumes',()=>{
 near(lossForVoyage([{seconds:60,speed:0}],1),60);
 near(lossForVoyage([{seconds:50,speed:2},{seconds:60,speed:0},{seconds:50,speed:2}],2),160-100);
});
test('different sampling intervals and reverse speeds preserve total arrival-time difference',()=>{
 const legs=[{seconds:20,speed:3},{seconds:30,speed:-2},{seconds:15,speed:0},{seconds:80,speed:1.25}];
 const total=legs.reduce((sum,leg)=>sum+leg.seconds,0),progress=legs.reduce((sum,leg)=>sum+leg.speed*leg.seconds,0);
 near(lossForVoyage(legs,2),total-progress/2);
 const subdivided=legs.flatMap(leg=>Array.from({length:5},()=>({...leg,seconds:leg.seconds/5})));
 near(lossForVoyage(subdivided,2),total-progress/2);
});
test('missing or non-positive reference speeds remain missing; negative own speeds are valid',()=>{
 for(const [speed,reference] of [[1,0],[0,0],[-1,0],[1,-1],[NaN,5],[Infinity,5],[-Infinity,5],[1,NaN],[1,Infinity]])
  assert.equal(gain(speed,reference),null);
 assert.ok(Number.isFinite(gain(-3,5)));
});
