const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test');
const source=name=>fs.readFileSync(path.join(__dirname,'../viewer',name+'.js'),'utf8');
const api=vm.runInNewContext(source('prepared-track-codec')+';({packPreparedTracks,unpackPreparedTracks});',{TextEncoder,TextDecoder});
test('prepared bundles preserve typed Float64, Float32 and integer bytes with aligned views',()=>{
 const arrays={a:new Float32Array([1.25,-1e20,Infinity,-Infinity,-0]),b:new Float64Array([Math.PI,1/3,1e-17]),c:new Int32Array([-1,0,2147483647]),d:new Uint32Array([0,4294967295])};
 const packed=api.packPreparedTracks('common',[{id:'båd',record:{pointCount:2},arrays}]),decoded=api.unpackPreparedTracks(packed.buffer,'common').get('båd');
 assert.equal(decoded.record.pointCount,2);
 for(const [name,value] of Object.entries(arrays)){
  const result=decoded.arrays[name];assert.equal(result.constructor.name,value.constructor.name);assert.equal(result.byteOffset%8,0);
  assert.deepEqual(Buffer.from(result.buffer,result.byteOffset,result.byteLength),Buffer.from(value.buffer,value.byteOffset,value.byteLength));
 }
});
test('prepared bundles reject wrong type, truncation, trailing bytes and invalid offsets',()=>{
 const packed=api.packPreparedTracks('line',[{id:'one',arrays:{geometry:new Float32Array([1,2,3])}}]);
 assert.throws(()=>api.unpackPreparedTracks(packed.buffer,'reference'));
 for(const size of [0,3,packed.byteLength-1])assert.throws(()=>api.unpackPreparedTracks(packed.buffer.slice(0,size),'line'));
 const extra=new Uint8Array(packed.byteLength+1);extra.set(packed);assert.throws(()=>api.unpackPreparedTracks(extra.buffer,'line'));
 const bad=packed.slice(),size=new DataView(bad.buffer).getUint32(0,true),header=new TextDecoder().decode(bad.subarray(4,4+size)).replace('"offset":0','"offset":8');
 bad.set(new TextEncoder().encode(header),4);assert.throws(()=>api.unpackPreparedTracks(bad.buffer,'line'));
});
test('prepared asset paths are bound to the exact source fingerprint',()=>{
 const context=vm.createContext({});vm.runInContext(source('replay-data'),context);
 const fingerprint='a'.repeat(64),asset={file:'track-profiles/'+fingerprint+'/common.bin.gz',bytes:8,compressedBytes:20};
 context.validatePreparedAsset(asset,fingerprint);
 for(const value of [{...asset,file:'track-profiles/'+fingerprint+'/../common.bin.gz'},{...asset,bytes:-1},{...asset,file:asset.file.replace(fingerprint,'b'.repeat(64))}])assert.throws(()=>context.validatePreparedAsset(value,fingerprint));
});
