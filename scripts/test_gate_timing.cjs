const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({window:{},$:()=>({addEventListener(){}})});
vm.runInContext(`const D={start:0,end:10000},boats=[],ghostClocks=new Map();
function mapBoundsIntersect(a,b){return a.east>=b.west&&a.west<=b.east&&a.north>=b.south&&a.south<=b.north;}
function eventToolPoints(note,field,count){const p=note[field]??[];if(![0,count].includes(p.length))throw Error('Invalid gate');return p;}
function displayedTrackTime(boat,time){return time;}`,context);
for(const file of ['track-time','tracks','rhumbline-geometry','timeline','gate-timing'])vm.runInContext(fs.readFileSync('viewer/'+file+'.js','utf8'),context);
const api=vm.runInContext('({boats,prepareGateTrack,gateCurveCrossings,prepareGateTiming,preparedGateTiming,gatePassageAtTime,formatGateDuration,gatePolynomialRoots,trackValue,getTrackModel})',context);
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} ~= ${b}`);
const gate=x=>[[x,-1],[x,1]],gates=[...gate(1),...gate(3)];
function boat(points){const b={id:'test',points};api.boats.splice(0,api.boats.length,b);api.prepareGateTrack(points);return b;}
function crossings(b,g){return api.gateCurveCrossings(b.points,g);}
let b=boat([[0,0,0],[2,0,100],[4,0,200]]);
near(crossings(b,gate(1))[0].time,50);near(crossings(b,gate(2))[0].time,100);assert.equal(crossings(b,gate(2)).length,1,'Deduplicate a crossing at a shared source knot');
let results=api.prepareGateTiming(gates),record=results.get(b.id);
assert.equal(record.passages.length,1);near(record.passages[0].elapsed,100);
assert.equal(api.gatePassageAtTime(record,b,149),null);near(api.gatePassageAtTime(record,b,150).elapsed,100);
assert.equal(api.preparedGateTiming(gates),results);assert.equal(api.prepareGateTiming(gates),results,'Prepared results are reused');
assert.equal(crossings(b,[[1,2],[1,3]]).length,0,'The finite gate does not include the rest of its infinite line');
assert.equal(crossings(b,[[1,0],[1,1]]).length,1,'Gate endpoints are included');
b=boat([[4,0,0],[2,0,100],[0,0,200]]);assert.equal(api.prepareGateTiming(gates).get(b.id).passages.length,0,'Gate 2 before gate 1 is not a completed passage');
b=boat([[0,0,0],[1,0,50],[0,0,100]]);assert.equal(crossings(b,gate(1)).length,0,'A touch and turn is not a crossing');
b=boat([[1,-.5,0],[1,.5,50]]);assert.equal(crossings(b,gate(1)).length,0,'Running along a gate is not a crossing');
b=boat([[0,0,0],[2,0,100],[2.5,0,1000],[4,0,1100]]);assert.equal(api.prepareGateTiming(gates).get(b.id).passages.length,0,'Do not join a passage across a source data gap');
b=boat([[0,0,0],[2,0,100],[4,0,200],[2,0,300],[0,0,400],[2,0,500],[4,0,600]]);
record=api.prepareGateTiming(gates).get(b.id);assert.equal(record.passages.length,2);assert.ok(api.gatePassageAtTime(record,b,600).end>500,'Use the latest completed passage');
// Nonlinear cubic crossing: independently solve its x coordinate by bisection.
b=boat([[0,0,0],[.2,.1,100],[2,.3,200],[3,.4,300]]);
let lo=100,hi=200;for(let i=0;i<55;i++){const mid=(lo+hi)/2;if(api.trackValue(b.points,1,mid).point[0]<1)lo=mid;else hi=mid;}
near(crossings(b,gate(1))[0].time,(lo+hi)/2);assert.ok(Math.abs(crossings(b,gate(1))[0].time-(100+100*.8/1.8))>1,'Use the cubic, not a straight observation chord');
// A monotone x and y can cross an oblique gate three times in one interval.
b=boat([[0,.08,0],[1,.92,100]]);
const model=api.getTrackModel(b.points);model.slopes[0].fill(.01);model.slopes[1].fill(.0034);
const oblique=[[0,0],[1,1]],three=crossings(b,oblique);
assert.equal(three.length,3);for(const [i,t] of [20,50,80].entries())near(three[i].time,t);
assert.equal(api.formatGateDuration(125.4),'02:05,4');assert.equal(api.formatGateDuration(3725.4),'1:02:05,4');
console.log('Gate timing: exact cubic crossings, three roots per interval, finite endpoints, knot deduplication, tangencies, collinearity, gaps, ordering, repeated passages, historical lookup and prepared-data reuse.');
