const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {gzipSync}=require('node:zlib'),{test}=require('node:test');
const root=path.resolve(__dirname,'..');
const source=name=>fs.readFileSync(path.join(root,'viewer',name+'.js'),'utf8');
function codec(){const c=vm.createContext({});vm.runInContext(source('track-source-codec'),c);return c;}

test('native integer XOR byte planes preserve signed coordinates, 64-bit timestamps and missing SOG',()=>{
 const c=codec(),points=[[.0000001,-.0000001,4294967295],[.0000003,-.0000003,4294967296],[.0000002,-.0000002,1781161679123]],speeds=[0,null,3276.7];
 const packed=c.packSourceTrack(points,speeds);
 assert.equal(packed.length,54);
 // Independent known words: 1,3,2 -> XOR 1,2,1, in the low byte plane.
 assert.deepEqual(Array.from(packed.slice(0,12)),[1,2,1,0,0,0,0,0,0,0,0,0]);
 // Negative int32 words keep their sign bits in the high byte planes.
 assert.deepEqual(Array.from(packed.slice(12,24)),[255,2,3,255,0,0,255,0,0,255,0,0]);
 const decoded=c.unpackSourceTrack(packed,3);
 assert.deepEqual(Array.from(decoded.points,p=>Array.from(p)),points.map(p=>[p[0],p[1],p[2]/1000]));
 assert.deepEqual(Array.from(decoded.speeds),[0,null,3276.7/1.852]);
 const unaligned=vm.runInContext('new Uint8Array(55)',c);unaligned.set(packed,1);
 assert.deepEqual(Array.from(c.unpackSourceTrack(unaligned.subarray(1),3).speeds),Array.from(decoded.speeds));
 assert.equal(c.unpackSourceTrack(c.packSourceTrack([],[]),0).points.length,0);
});
test('source encoding rejects precision loss, bad timestamps and unrepresentable speed',()=>{
 const c=codec();
 for(const point of [[12.00000001,55,1000],[12,85,1000],[181,55,1000],[12,55,-1],[12,55,1000.5],[NaN,55,1000]])assert.throws(()=>c.packSourceTrack([point],[1]));
 for(const speed of [-1,NaN,Infinity,1.01,3276.8])assert.throws(()=>c.packSourceTrack([[12,55,1000]],[speed]));
 assert.throws(()=>c.packSourceTrack([[12,55,1000],[12,55,1000]],[1,1]));
 for(const count of [-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>c.sourceTrackBytes(count));
 const bytes=c.packSourceTrack([[12,55,1000]],[1]);
 assert.throws(()=>c.unpackSourceTrack(bytes.subarray(1),1));
 bytes[17]=255;assert.throws(()=>c.unpackSourceTrack(bytes,1),/speed/);
});
function fixture(){
 const fingerprint='a'.repeat(64),c=codec();
 return {
  manifest:{version:9,replayEncoding:'source-integers-xor-byteplanes-v1',compression:'gzip',coordinateScale:1e7,speedScaleKmh:10,sourcePointBytes:18,byteOrder:'little-endian',sourceFingerprint:fingerprint,
   dataFile:`track-profiles/${fingerprint}/data.json`,replayFile:`track-profiles/${fingerprint}/source.bin.gz`,replayBytes:54,start:1000,
   boats:[{id:'one',pointCount:3,sourceOffset:0}]},
  data:{start:1000,boats:[{id:'one',trackSegments:[[1003,1027],[1501,1501]]}]},
  source:c.packSourceTrack([[12,55,1003000],[12.01,55.02,1027000],[13,56,1501000]],[7.4,null,18.5]),bundle:Buffer.alloc(7)
 };
}
function load(input){
 const requests=[],context=vm.createContext({Response,DecompressionStream,window:{},fetch:async url=>{
  requests.push(url);
  if(url===input.missing)return new Response('',{status:404});
  if(url.endsWith('manifest.json'))return new Response(JSON.stringify(input.manifest));
  if(url.endsWith('data.json'))return new Response(JSON.stringify(input.data));
  return new Response(url.endsWith('source.bin.gz')?(input.sourceGzip??gzipSync(input.source)):gzipSync(input.bundle));
 }});
 const boot=source('boot'),files=boot.match(/const files=\[(.*?)\];/)[1].match(/'[^']+'/g).map(name=>name.slice(1,-1));
 for(const name of files){vm.runInContext(source(name),context);if(name==='replay-data')break;}
 return {context,requests,promise:context.loadReplayData()};
}
test('gzip source load preserves original times, gaps and native SOG before publishing data',async()=>{
 const input=fixture(),{context,requests,promise}=load(input);await promise;
 const boat=context.window.DATA.boats[0];
 assert.deepEqual(Array.from(boat.points,p=>p[2]),[1003,1027,1501]);
 assert.deepEqual(Array.from(boat.points[0]),[12,55,1003]);
 assert.deepEqual(Array.from(boat.speeds),[7.4/1.852,null,18.5/1.852]);
 assert.equal(requests.length,3);assert.ok(requests.includes(input.manifest.replayFile));
 assert.equal(vm.runInContext('trackTimeIndexes.has(window.DATA.boats[0].points)',context),true);
 assert.equal(vm.runInContext('trackModelCache.has(window.DATA.boats[0].points)',context),true);
});
for(const [name,mutate] of [
 ['old format',input=>input.manifest.version=8],
 ['wrong encoding',input=>input.manifest.replayEncoding='float32-local-xy-speed'],
 ['wrong compression',input=>input.manifest.compression='none'],
 ['wrong coordinate scale',input=>input.manifest.coordinateScale=1e6],
 ['unsafe metadata path',input=>input.manifest.dataFile='track-profiles/../data.json'],
 ['unsafe source path',input=>input.manifest.replayFile='track-profiles/../source.bin.gz'],
 ['missing source file',input=>input.missing=input.manifest.replayFile],
 ['wrong boat id',input=>input.data.boats[0].id='other'],
 ['duplicate manifest id',input=>{input.manifest.boats.push({...input.manifest.boats[0]});input.data.boats.push({...input.data.boats[0]});}],
 ['wrong sample count',input=>input.manifest.boats[0].pointCount=4],
 ['wrong source offset',input=>input.manifest.boats[0].sourceOffset=1],
 ['truncated source',input=>input.source=input.source.subarray(1)],
 ['broken gzip',input=>input.sourceGzip=Buffer.from('not gzip')],
 ['bad gzip checksum',input=>{input.sourceGzip=gzipSync(input.source);input.sourceGzip[input.sourceGzip.length-8]^=1;}],
 ['out of range coordinate',input=>{input.source[6]=255;input.source[9]=127;}],
 ['invalid times',input=>input.data.boats[0].trackSegments=[[1027,1003]]],
 ['different segment boundary',input=>input.data.boats[0].trackSegments[0][0]=1004]
])test('source replay rejects '+name+' without publishing partial data',async()=>{
 const input=fixture();mutate(input);
 const {context,promise}=load(input);await assert.rejects(promise);
 assert.equal(context.window.DATA,undefined);
});
