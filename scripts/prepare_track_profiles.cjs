// Prepare native source data only; all track/profile mathematics runs on the GPU.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),OUTPUT=path.join(ROOT,'viewer','track-profiles'),MANIFEST=path.join(OUTPUT,'manifest.json');
const SOURCES=['viewer/data.js','data/tractrac/combined_tracks.json','data/tractrac/speeds_groensund.json','data/tractrac/speeds_boegestroemmen.json','viewer/track-source-codec.js','scripts/prepare_track_profiles.cjs'];
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const {packSourceTrack,unpackSourceTrack,sourceTrackBytes}=vm.runInContext(fs.readFileSync(path.join(ROOT,'viewer','track-source-codec.js'),'utf8')+'\n({packSourceTrack,unpackSourceTrack,sourceTrackBytes});',vm.createContext(vm.constants.DONT_CONTEXTIFY));
function sourceState(){
 const hash=crypto.createHash('sha256'),sources={};
 for(const name of SOURCES){const value=fs.readFileSync(path.join(ROOT,name));sources[name]=digest(value);hash.update(name+'\0').update(value).update('\0');}
 return {sourceFingerprint:hash.digest('hex'),sources};
}
function currentManifest(state){
 if(!fs.existsSync(MANIFEST))return null;
 let m;try{m=JSON.parse(fs.readFileSync(MANIFEST,'utf8'));}catch(error){if(error instanceof SyntaxError)return null;throw error;}
 if(m?.version!==10||m.sourceFingerprint!==state.sourceFingerprint||m.replayEncoding!=='source-integers-xor-byteplanes-v1'||m.compression!=='gzip'||m.coordinateScale!==1e7||m.speedScaleKmh!==10||m.sourcePointBytes!==18||m.byteOrder!=='little-endian'||!Array.isArray(m.boats))return null;
 const prefix='track-profiles/'+state.sourceFingerprint+'/';
 if(m.replayFile!==prefix+'source.bin.gz'||m.dataFile!==prefix+'data.json.gz'||!Number.isSafeInteger(m.dataBytes)||m.dataBytes<=0||!Number.isSafeInteger(m.dataCompressedBytes)||m.dataCompressedBytes<=0||!fs.existsSync(path.join(ROOT,'viewer',m.dataFile))||fs.statSync(path.join(ROOT,'viewer',m.dataFile)).size!==m.dataCompressedBytes)return null;
 const ids=new Set();let offset=0;
 for(const boat of m.boats){if(typeof boat.id!=='string'||ids.has(boat.id)||!Number.isSafeInteger(boat.pointCount)||boat.pointCount<0||!Number.isSafeInteger(boat.pointCount*18)||boat.sourceOffset!==offset)return null;ids.add(boat.id);offset+=sourceTrackBytes(boat.pointCount);}
 const file=path.join(ROOT,'viewer',m.replayFile);
 return offset===m.replayBytes&&Number.isSafeInteger(m.replayCompressedBytes)&&m.replayCompressedBytes>0&&fs.existsSync(file)&&fs.statSync(file).size===m.replayCompressedBytes?m:null;
}
function writeAtomic(filename,value){const temporary=filename+'.'+process.pid+'.tmp';try{fs.writeFileSync(temporary,value);fs.renameSync(temporary,filename);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}}
function gzip(bytes){return execFileSync(process.platform==='win32'?'python':'python3',['-c','import gzip,sys;sys.stdout.buffer.write(gzip.compress(sys.stdin.buffer.read(),compresslevel=9,mtime=0))'],{input:bytes,maxBuffer:bytes.byteLength+1048576,windowsHide:true});}
function nativeSourceTracks(boats){
 const read=file=>JSON.parse(fs.readFileSync(path.join(ROOT,'data','tractrac',file),'utf8'));
 const source=read('combined_tracks.json'),speeds=Object.fromEntries(['groensund','boegestroemmen'].map(course=>[course,read('speeds_'+course+'.json')]));
 if(Object.keys(source.tracks).length!==boats.length)throw Error('Native boat count changed; regenerate viewer/data.js.');
 const key=point=>JSON.stringify(point.slice(0,3));
 return boats.map(boat=>{
  const competitor=source.competitors[boat.id],points=source.tracks[boat.id];
  if(!competitor||!points||points.length!==boat.points.length)throw Error('Native source does not match viewer: '+boat.id);
  const records=speeds[competitor.source_course].tracks[competitor.source_id],lookup=new Map(records.map(row=>[key(row),row[3]]));
  const values=points.map((point,index)=>{
   if(!lookup.has(key(point)))throw Error('Missing native source speed: '+boat.id);
   const value=lookup.get(key(point)),speed=typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
   if(point[0]!==boat.points[index][0]||point[1]!==boat.points[index][1]||point[2]/1000!==boat.points[index][2]
    ||(speed===null?null:speed/1.852)!==boat.speeds[index])throw Error('Native source changed; regenerate viewer/data.js: '+boat.id);
   return speed;
  });
  const bytes=packSourceTrack(points,values),decoded=unpackSourceTrack(bytes,points.length);
  for(let index=0;index<points.length;index++){
   if(decoded.points[index].some((value,axis)=>value!==boat.points[index][axis])||decoded.speeds[index]!==boat.speeds[index])throw Error('Source integer round trip failed: '+boat.id);
  }
  return {bytes,boat:{...boat,...decoded}};
 });
}

function generate({ifStale=false}={}){
 const started=performance.now(),state=sourceState();if(ifStale&&currentManifest(state)){console.log('Source data are current: '+state.sourceFingerprint);return;}
 const context=vm.createContext(vm.constants.DONT_CONTEXTIFY);context.window={};vm.runInContext(fs.readFileSync(path.join(ROOT,'viewer','data.js'),'utf8'),context);
 const D=context.window.DATA,native=nativeSourceTracks(D.boats),prefix='track-profiles/'+state.sourceFingerprint+'/',chunks=[],entries=[],metadata=[];let offset=0;
 for(const {bytes,boat} of native){
  entries.push({id:boat.id,pointCount:boat.points.length,sourceOffset:offset});chunks.push(Buffer.from(bytes));offset+=bytes.byteLength;
  const {points,speeds,...details}=boat,trackSegments=[];
  for(const point of points){if(!trackSegments.length||point[2]-trackSegments.at(-1)[1]>300)trackSegments.push([point[2],point[2]]);else trackSegments.at(-1)[1]=point[2];}
  metadata.push({...details,trackSegments});
 }
 const compressed=gzip(Buffer.concat(chunks,offset));
 if(sourceState().sourceFingerprint!==state.sourceFingerprint)throw Error('Source data changed during preparation. Run the generator again.');
 fs.mkdirSync(path.join(OUTPUT,state.sourceFingerprint),{recursive:true});
 const replayFile=prefix+'source.bin.gz',dataFile=prefix+'data.json.gz';
 const data=Buffer.from(JSON.stringify({...D,boats:metadata})),compressedData=gzip(data);
 writeAtomic(path.join(ROOT,'viewer',replayFile),compressed);writeAtomic(path.join(ROOT,'viewer',dataFile),compressedData);
 const manifest={version:10,replayEncoding:'source-integers-xor-byteplanes-v1',compression:'gzip',coordinateScale:1e7,speedScaleKmh:10,sourcePointBytes:18,byteOrder:'little-endian',sourceFingerprint:state.sourceFingerprint,sources:state.sources,start:D.start,dataFile,dataBytes:data.byteLength,dataCompressedBytes:compressedData.byteLength,replayFile,replayBytes:offset,replayCompressedBytes:compressed.byteLength,boats:entries};
 writeAtomic(MANIFEST,JSON.stringify(manifest,null,2)+'\n');
 console.log(`Source data: ${native.length} boats, ${entries.reduce((n,b)=>n+b.pointCount,0)} original points, ${compressed.byteLength} gzip bytes, ${((performance.now()-started)/1000).toFixed(2)} s`);return manifest;
}
if(require.main===module){try{const args=process.argv.slice(2);if(args.some(a=>a!=='--if-stale'))throw Error('Usage: node scripts/prepare_track_profiles.cjs [--if-stale]');generate({ifStale:args.includes('--if-stale')});}catch(error){console.error('Source preparation failed: '+error.message);process.exitCode=1;}}
module.exports={generate,sourceState,currentManifest};
