// Build native source data and per-boat route profiles. No pairwise assets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {gzipSync}=require('node:zlib');
const {filterTrack}=require('./kalman_track_filter.cjs');
const ROOT=path.resolve(__dirname,'..');
const readJson=file=>JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));
const catalog=()=>readJson('viewer/events/catalog.json');
function eventConfiguration(id=catalog().default){
 if(!catalog().events.some(event=>event.id===id))throw Error('Unknown event: '+id);
 return catalog().events.find(event=>event.id===id);
}
const SOURCES=['scripts/prepare_track_profiles.cjs','scripts/kalman_track_filter.cjs','viewer/track-source-codec.js','viewer/tracks.js','viewer/track-local-data.js','viewer/track-time.js','viewer/rhumbline-geometry.js','viewer/track-preparation-math.js','viewer/prepared-track-codec.js'];
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const {packSourceTrack,unpackSourceTrack,sourceTrackBytes}=vm.runInContext(fs.readFileSync(path.join(ROOT,'viewer','track-source-codec.js'),'utf8')+'\n({packSourceTrack,unpackSourceTrack,sourceTrackBytes});',vm.createContext(vm.constants.DONT_CONTEXTIFY));
function sourceState(event=eventConfiguration()){
 const hash=crypto.createHash('sha256'),sources={};
 for(const name of [...SOURCES,event.nativeFile,event.backgroundFile]){const value=fs.readFileSync(path.join(ROOT,name));sources[name]=digest(value);hash.update(name+'\0').update(value).update('\0');}
 hash.update(JSON.stringify(event));
 return {sourceFingerprint:hash.digest('hex'),sources,eventId:event.id};
}
function currentManifest(state){
 const event=eventConfiguration(state.eventId),MANIFEST=path.join(ROOT,'viewer',event.profileRoot,'manifest.json');
 if(!fs.existsSync(MANIFEST))return null;
 let m;try{m=JSON.parse(fs.readFileSync(MANIFEST,'utf8'));}catch(error){if(error instanceof SyntaxError)return null;throw error;}
 if(m?.version!==13||m.sourceFingerprint!==state.sourceFingerprint||m.replayEncoding!=='source-integers-xor-byteplanes-v1'||m.compression!=='gzip'||m.coordinateScale!==1e7||m.speedScaleKmh!==10||m.sourcePointBytes!==18||m.byteOrder!=='little-endian'||!Array.isArray(m.boats)||m.prepared?.version!==4)return null;
 const prefix=event.profileRoot+state.sourceFingerprint+'/';
 if(m.replayFile!==prefix+'source.bin.gz'||m.dataFile!==prefix+'data.json.gz'||!Number.isSafeInteger(m.dataBytes)||m.dataBytes<=0||!Number.isSafeInteger(m.dataCompressedBytes)||m.dataCompressedBytes<=0||!fs.existsSync(path.join(ROOT,'viewer',m.dataFile))||fs.statSync(path.join(ROOT,'viewer',m.dataFile)).size!==m.dataCompressedBytes)return null;
 const ids=new Set();let offset=0;
 for(const boat of m.boats){if(typeof boat.id!=='string'||ids.has(boat.id)||!Number.isSafeInteger(boat.pointCount)||boat.pointCount<0||!Number.isSafeInteger(boat.pointCount*18)||boat.sourceOffset!==offset)return null;ids.add(boat.id);offset+=sourceTrackBytes(boat.pointCount);}
 for(const asset of [m.prepared.common]){
  if(!asset||!asset.file?.startsWith(prefix)||!Number.isSafeInteger(asset.bytes)||asset.bytes<4||!Number.isSafeInteger(asset.compressedBytes)||asset.compressedBytes<=0)return null;
  const packed=path.join(ROOT,'viewer',asset.file);if(!fs.existsSync(packed)||fs.statSync(packed).size!==asset.compressedBytes)return null;
 }
 const file=path.join(ROOT,'viewer',m.replayFile);
 return offset===m.replayBytes&&Number.isSafeInteger(m.replayCompressedBytes)&&m.replayCompressedBytes>0&&fs.existsSync(file)&&fs.statSync(file).size===m.replayCompressedBytes?m:null;
}
function writeAtomic(filename,value){const temporary=filename+'.'+process.pid+'.tmp';try{fs.writeFileSync(temporary,value);fs.renameSync(temporary,filename);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}}
function gzip(bytes){return execFileSync(process.platform==='win32'?'python':'python3',['-c','import gzip,sys;sys.stdout.buffer.write(gzip.compress(sys.stdin.buffer.read(),compresslevel=9,mtime=0))'],{input:bytes,maxBuffer:bytes.byteLength+1048576,windowsHide:true});}
function nativeSourceTracks(source,policy){
 if(source.version!==1||!Array.isArray(source.boats)||!source.boats.length)throw Error('Invalid native event input');
 const seen=new Set();
 return source.boats.map(({points:rawPoints,details,...info})=>{
  if(seen.has(info.id))throw Error('Duplicate boat ID: '+info.id);seen.add(info.id);
  const filtered=filterTrack(rawPoints,policy),points=filtered.points;
  const positions=points.map(p=>p.slice(0,3)),speeds=points.map(p=>p[3]);
  const bytes=packSourceTrack(positions,speeds),decoded=unpackSourceTrack(bytes,positions.length);
  for(let i=0;i<positions.length;i++)if(decoded.points[i][0]!==positions[i][0]||decoded.points[i][1]!==positions[i][1]||decoded.points[i][2]!==positions[i][2]/1000||decoded.speeds[i]!==(speeds[i]===null?null:speeds[i]/1.852))throw Error('Native round trip failed: '+info.id);
  return {bytes,boat:{...info,...details,...decoded},details,filtering:{id:info.id,name:info.name,sourcePoints:rawPoints.length,removed:filtered.removed,fit:filtered.fit}};
 });
}

function prepareArtifacts(context,native,prefix,start,event){
 context.TextEncoder=TextEncoder;context.TextDecoder=TextDecoder;
 for(const name of ['track-time.js','tracks.js','track-local-data.js','rhumbline-geometry.js','track-preparation-math.js','prepared-track-codec.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,'viewer',name),'utf8'),context);
 vm.runInContext('const boatDetails=window.DATA.boatDetails;',context);
 const api=vm.runInContext('({prepareTrackData,buildRhumbRoute,packPreparedTracks,getTrackModel,prepareTrackTimeIndex,boatDetails})',context);
 const routePoints=Object.fromEntries(Object.entries(event.courses).map(([id,course])=>[id,course.points]));
 const routes=Object.fromEntries(Object.entries(routePoints).map(([course,points])=>[course,api.buildRhumbRoute(points)])),prepared=[];
 const asset=(name,kind,entries)=>{
  const bytes=api.packPreparedTracks(kind,entries),compressed=gzipSync(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),{level:6,mtime:0}),file=prefix+name+'.bin.gz';
  writeAtomic(path.join(ROOT,'viewer',file),compressed);return {file,bytes:bytes.byteLength,compressedBytes:compressed.byteLength};
 };
 for(const [index,{boat}] of native.entries()){
  const byCourse=Object.fromEntries(Object.entries(routes).map(([course,route])=>[course,api.prepareTrackData(boat,route,start,false)]));
  prepared.push({id:boat.id,course:boat.course,byCourse,handicap:api.boatDetails[boat.id]?.handicapSecondsPerNm||0});
  for(const result of Object.values(byCourse)){result.geometry=null;result.lineGeometry=null;result.caps=null;result.knots=null;result.profile=null;result.speed=null;result.bounds=null;}
  if((index+1)%10===0||index+1===native.length)console.log('Prepared source tracks '+(index+1)+'/'+native.length);
 }
 const common=asset('common','common',prepared.map(p=>({id:p.id,arrays:Object.fromEntries(Object.entries(p.byCourse).flatMap(([course,result])=>Object.entries(result.mirror).filter(([name])=>name!=='timeSamples').map(([name,value])=>[course+'_'+name,value])))})));
 const result={version:4,routePoints,handicaps:prepared.map(p=>({id:p.id,value:p.handicap})),common};
 console.log('Prepared profiles: '+(common.compressedBytes/1048576).toFixed(1)+' MiB; no pairwise reference files');
 return result;
}
function generate({ifStale=false,eventId}={}){
 const event=eventConfiguration(eventId),OUTPUT=path.join(ROOT,'viewer',event.profileRoot),MANIFEST=path.join(OUTPUT,'manifest.json');
 const started=performance.now(),state=sourceState(event);if(ifStale&&currentManifest(state)){console.log(event.id+' profiles are current');return;}
 const nativeInput=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(ROOT,event.nativeFile)))),native=nativeSourceTracks(nativeInput,event.trackFilter);
 const filtering={method:event.trackFilter.method,sourcePoints:native.reduce((n,b)=>n+b.filtering.sourcePoints,0),removedPoints:native.reduce((n,b)=>n+b.filtering.removed.length,0)};
 console.log(`${event.id}: Kalman removed ${filtering.removedPoints}/${filtering.sourcePoints} source points`);
 const background=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(ROOT,event.backgroundFile))));
 const context=vm.createContext(vm.constants.DONT_CONTEXTIFY);context.window={DATA:{...background,start:event.start,end:event.end,boats:native.map(p=>p.boat),boatDetails:Object.fromEntries(native.map(p=>[p.boat.id,p.details]))}};
 const D=context.window.DATA,prefix=event.profileRoot+state.sourceFingerprint+'/',chunks=[],entries=[],metadata=[];let offset=0;
 for(const {bytes,boat} of native){
  entries.push({id:boat.id,pointCount:boat.points.length,sourceOffset:offset});chunks.push(Buffer.from(bytes));offset+=bytes.byteLength;
  const {points,speeds,...details}=boat,trackSegments=[];
  for(const point of points){if(!trackSegments.length||point[2]-trackSegments.at(-1)[1]>300)trackSegments.push([point[2],point[2]]);else trackSegments.at(-1)[1]=point[2];}
  metadata.push({...details,trackSegments});
 }
 const compressed=gzip(Buffer.concat(chunks,offset));
 if(sourceState(event).sourceFingerprint!==state.sourceFingerprint)throw Error('Source data changed during preparation. Run the generator again.');
 fs.mkdirSync(path.join(OUTPUT,state.sourceFingerprint),{recursive:true});
 writeAtomic(path.join(OUTPUT,state.sourceFingerprint,'filter-report.json'),JSON.stringify({eventId:event.id,policy:event.trackFilter,summary:filtering,boats:native.map(b=>b.filtering)},null,2)+'\n');
 const replayFile=prefix+'source.bin.gz',dataFile=prefix+'data.json.gz';
 const data=Buffer.from(JSON.stringify({...D,boats:metadata})),compressedData=gzip(data);
 writeAtomic(path.join(ROOT,'viewer',replayFile),compressed);writeAtomic(path.join(ROOT,'viewer',dataFile),compressedData);
 const prepared=prepareArtifacts(context,native,prefix,D.start,event);
 const manifest={prepared,filtering,eventId:event.id,profileRoot:event.profileRoot,version:13,replayEncoding:'source-integers-xor-byteplanes-v1',compression:'gzip',coordinateScale:1e7,speedScaleKmh:10,sourcePointBytes:18,byteOrder:'little-endian',sourceFingerprint:state.sourceFingerprint,sources:state.sources,start:D.start,dataFile,dataBytes:data.byteLength,dataCompressedBytes:compressedData.byteLength,replayFile,replayBytes:offset,replayCompressedBytes:compressed.byteLength,boats:entries};
 if(sourceState(event).sourceFingerprint!==state.sourceFingerprint)throw Error('Sources changed during preparation; rebuild before publishing.');
 writeAtomic(MANIFEST,JSON.stringify(manifest,null,2)+'\n');
 console.log(`Source data: ${native.length} boats, ${entries.reduce((n,b)=>n+b.pointCount,0)} original points, ${compressed.byteLength} gzip bytes, ${((performance.now()-started)/1000).toFixed(2)} s`);return manifest;
}
if(require.main===module){try{
 const args=process.argv.slice(2),index=args.indexOf('--event'),eventId=index>=0?args[index+1]:null;
 if(args.some((arg,i)=>arg!=='--if-stale'&&arg!=='--event'&&i!==index+1))throw Error('Usage: node scripts/prepare_track_profiles.cjs [--if-stale] [--event ID]');
 for(const event of eventId?[{id:eventId}]:catalog().events)generate({ifStale:args.includes('--if-stale'),eventId:event.id});
}catch(error){console.error('Event preparation failed: '+error.message);process.exitCode=1;}}
module.exports={generate,sourceState,currentManifest};
