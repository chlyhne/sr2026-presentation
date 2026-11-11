const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..');
function fixture(){
 const fingerprint='a'.repeat(64),bundle=new ArrayBuffer(48),view=new DataView(bundle);
 for(let index=0;index<4;index++){
  view.setFloat32(index*12,.5+index*.001,true);view.setFloat32(index*12+4,-2,true);view.setFloat32(index*12+8,index===1?NaN:4,true);
 }
 return {
  manifest:{version:7,sampleSeconds:10,replayOrigin:[9.5,57],replayEncoding:'float32-local-xy-speed',byteOrder:'little-endian',sourceFingerprint:fingerprint,
   dataFile:`track-profiles/${fingerprint}/data.json`,bundleFile:`track-profiles/${fingerprint}/fleet.bin`,bundleBytes:48,start:1000,boats:[{id:'one',pointCount:4,replayOffset:0,sampleOffset:48}]},
  data:{start:1000,boats:[{id:'one',trackSegments:[[1003,1027]]}]},bundle
 };
}
function load(input){
 const requests=[],context=vm.createContext({window:{},fetch:async url=>{
  requests.push(url);
  return {ok:true,json:async()=>structuredClone(url.endsWith('manifest.json')?input.manifest:input.data),arrayBuffer:async()=>input.bundle};
 }});
 for(const name of ['track-time','replay-data'])vm.runInContext(fs.readFileSync(path.join(root,'viewer',name+'.js'),'utf8'),context);
 return {context,requests,promise:context.loadReplayData()};
}
test('one binary download reconstructs common times, measured speed and prepared time indexes',async()=>{
 const {context,requests,promise}=load(fixture());await promise;
 const boat=context.window.DATA.boats[0];
 assert.deepEqual(Array.from(boat.points,point=>point[2]),[1003,1010,1020,1027]);
 assert.equal(boat.points[0][0],10);assert.equal(boat.points[0][1],55);
 assert.deepEqual(Array.from(boat.speeds),[4,null,4,4]);assert.equal(requests.length,3);
 assert.equal(vm.runInContext('trackTimeIndexes.has(window.DATA.boats[0].points)',context),true);
 assert.equal(vm.runInContext('replayResources.bundle.byteLength',context),48);
});
for(const [name,mutate] of [
 ['old format',input=>input.manifest.version=6],
 ['wrong sample interval',input=>input.manifest.sampleSeconds=5],
 ['unsafe metadata path',input=>input.manifest.dataFile='track-profiles/../data.json'],
 ['unsafe bundle path',input=>input.manifest.bundleFile='track-profiles/../fleet.bin'],
 ['wrong boat id',input=>input.data.boats[0].id='other'],
 ['wrong sample count',input=>input.manifest.boats[0].pointCount=5],
 ['wrong replay offset',input=>input.manifest.boats[0].replayOffset=1],
 ['truncated binary',input=>input.bundle=input.bundle.slice(1)],
 ['nonfinite position',input=>new DataView(input.bundle).setFloat32(0,NaN,true)],
 ['negative speed',input=>new DataView(input.bundle).setFloat32(8,-1,true)],
 ['infinite speed',input=>new DataView(input.bundle).setFloat32(8,Infinity,true)],
 ['invalid times',input=>input.data.boats[0].trackSegments=[[1027,1003]]],
 ['overlapping segments',input=>input.data.boats[0].trackSegments=[[1003,1010],[1009,1027]]]
])test('replay rejects '+name+' without publishing partial data',async()=>{
 const input=fixture();mutate(input);
 const {context,promise}=load(input);await assert.rejects(promise);
 assert.equal(context.window.DATA,undefined);assert.equal(vm.runInContext('replayResources',context),null);
});
