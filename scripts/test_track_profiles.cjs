const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const context=vm.createContext({rhumbRoute:{total:1}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../viewer/navigation-math.js'),'utf8'),context);

test('Float32 profiles retain speeds above 25 knots without speed codes',()=>{
 const values=new Float32Array([0,6.789,31.125,-1e20]);
 for(let index=0;index<3;index++)assert.equal(context.referenceAtStation(index,values).vmg,values[index]);
 for(const index of [-1,.5,3,4,NaN])assert.equal(context.referenceAtStation(index,values),null);
});

test('reference lookup uses physical ten metre stations and rejects positions outside the route',()=>{
 assert.equal(context.referenceStationCount(),187);
 assert.equal(context.referenceStationIndex(100/1852),10);
 assert.equal(context.referenceStationIndex(105.1/1852),11);
 for(const progress of [-1,1.01,NaN,Infinity])assert.equal(context.referenceStationIndex(progress),-1);
});
