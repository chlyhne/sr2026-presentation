const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..');
function setup(){
 const context=vm.createContext({});
 for(const file of ['viewer/track-time.js','viewer/tracks.js','scripts/track-resampling.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 return context;
}
test('boats share the ten second lattice while retaining exact endpoints and data holes',()=>{
 const context=setup(),origin=1000,coordinateOrigin=[9.5,57];
 const source={id:'one',points:[[12,55,1003],[12.01,55.01,1027],[12.02,55.02,1058],[13,56,1501],[13.01,56.01,1524]],speeds:[3,7,5,8,9]};
 const result=context.resampleBoatTrack(source,origin,coordinateOrigin);
 assert.deepEqual(Array.from(result.points,point=>point[2]),[1003,1010,1020,1030,1040,1050,1058,1501,1510,1520,1524]);
 assert.deepEqual(Array.from(result.trackSegments,segment=>Array.from(segment)),[[1003,1058],[1501,1524]]);
 const other=context.resampleBoatTrack({...source,id:'two',points:source.points.map(point=>[point[0],point[1],point[2]+2])},origin,coordinateOrigin);
 assert.deepEqual(Array.from(other.points,point=>point[2]).filter(time=>time>1005&&time<1060),[1010,1020,1030,1040,1050]);
 assert.equal(context.trackPosition(result.points,1400),null);
 assert.deepEqual(source.speeds,[3,7,5,8,9]);assert.equal(source.points.length,5);
});
test('resampling uses nominal cubic PCHIP for positions and measured speed',()=>{
 const context=setup(),source={id:'cubic',points:[[12,55,0],[12.01,55.03,17],[12.05,55.04,49]],speeds:[3,9,10]};
 const result=context.resampleBoatTrack(source,0,[12,55]);
 const expected=context.trackValue(source.points,0,10).point;
 const speedPoints=source.points.map((point,index)=>[source.speeds[index],0,point[2]]);
 const speed=context.trackValue(speedPoints,0,10).point[0];
 const sample=result.points.find(point=>point[2]===10),sampleIndex=result.points.indexOf(sample);
 assert.ok(Math.abs(sample[0]-expected[0])<1e-8);assert.ok(Math.abs(sample[1]-expected[1])<1e-8);
 assert.ok(Math.abs(result.speeds[sampleIndex]-speed)<1e-6);
 assert.ok(Math.abs(sample[0]-(12+.01*10/17))>1e-5);
 const between=context.trackPosition(result.points,5).point,linear=(result.points[0][0]+sample[0])/2;
 assert.ok(Math.abs(between[0]-linear)>1e-7,'Rendering still evaluates a cubic between resampled points');
});
test('missing SOG is not fabricated and isolated positions survive resampling',()=>{
 const context=setup();
 const source={id:'missing',points:[[12,55,3],[12.01,55.01,23],[12.02,55.02,43],[13,56,500]],speeds:[3,null,9,4]};
 const result=context.resampleBoatTrack(source,0,[12,55]);
 for(let index=1;index<result.speeds.length-2;index++)assert.equal(result.speeds[index],null);
 assert.equal(result.points.at(-1)[2],500);assert.equal(result.speeds.at(-1),4);
 assert.throws(()=>context.resampleBoatTrack({...source,points:[[12,55,5],[12,55,4]],speeds:[1,2]},0,[12,55]),/timestamp/);
});
test('indexed boundaries equal exact lower and upper bounds at knots, duplicates and gaps',()=>{
 const context=setup(),times=[3,10,10,20,27,400,410,421],points=times.map(time=>[12,55,time]);
 context.prepareTrackTimeIndex(points);
 for(const time of [-Infinity,-1,3,3.01,9.999,10,10.001,20,25,27,28,300,399,400,410,421,422,Infinity])for(const after of [false,true]){
  let expected=times.findIndex(stamp=>after?stamp>time:stamp>=time);if(expected<0)expected=times.length;
  assert.equal(context.timeBoundary(points,time,after),expected,`${time}, after=${after}`);
 }
 assert.equal(context.timeBoundary([],12),0);
});
