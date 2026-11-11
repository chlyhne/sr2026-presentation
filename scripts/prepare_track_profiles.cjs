const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const os=require('node:os');

const ROOT=path.resolve(__dirname,'..');
const OUTPUT=path.join(ROOT,'viewer','track-profiles');
const MANIFEST=path.join(OUTPUT,'manifest.json');
const SOURCES=['viewer/data.js','viewer/track-time.js','viewer/tracks.js','viewer/rhumbline-geometry.js','viewer/navigation-math.js','viewer/rhumbline.json','scripts/prepare_track_profiles.cjs'];
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const {packProjectedTrack,packSpeedCodes,packedSpeedBytes,packTimeValues,packTimeSamples,packedTimeBytes}=vm.runInContext(fs.readFileSync(path.join(ROOT,'viewer','navigation-math.js'),'utf8')+'\n({packProjectedTrack,packSpeedCodes,packedSpeedBytes,packTimeValues,packTimeSamples,packedTimeBytes});',vm.createContext(vm.constants.DONT_CONTEXTIFY));

function sourceState(){
 const hash=crypto.createHash('sha256'),sources={};
 for(const name of SOURCES){
  const value=fs.readFileSync(path.join(ROOT,name));
  sources[name]=digest(value);hash.update(name+'\0').update(value).update('\0');
 }
 return {sourceFingerprint:hash.digest('hex'),sources};
}

function currentManifest(state){
 if(!fs.existsSync(MANIFEST))return null;
 let manifest;
 try{manifest=JSON.parse(fs.readFileSync(MANIFEST,'utf8'));}catch(error){
  if(error instanceof SyntaxError)return null;
  throw error;
 }
 if(manifest.version!==6||manifest.sourceFingerprint!==state.sourceFingerprint||!Array.isArray(manifest.boats)
  ||manifest.stationSpacingMeters!==10||manifest.profileEncoding!=='uint10-packed'||manifest.speedMaximum!==25
  ||manifest.speedCodes!==1022||manifest.speedBits!==10||manifest.missingValue!==1023||manifest.sampleMissingValue!==-1e20
  ||manifest.sampleWords!==3||manifest.samplePositionBytes!==8||manifest.sampleEncoding!=='uint10-speed-planar'
  ||manifest.speedSignEncoding!=='signed-station-index'||manifest.stationWords!==1||manifest.byteOrder!=='little-endian'
  ||manifest.timeEncoding!=='uint10-block-scaled-seconds-per-meter'||manifest.timeBits!==10||manifest.timeBlockSize!==256||manifest.timeCodes!==1021||manifest.timeInfinity!==1022||manifest.timeSampleWords!==2||manifest.timeStationWords!==1)return null;
 if(!Number.isSafeInteger(manifest.stationCount)||manifest.stationCount<1)return null;
 if(manifest.bundleFile!==`track-profiles/${state.sourceFingerprint}/fleet.bin`||!Number.isSafeInteger(manifest.bundleBytes)||manifest.bundleBytes<0)return null;
 const ids=new Set();let offset=0;
 for(const boat of manifest.boats){
  if(typeof boat.id!=='string'||ids.has(boat.id)||!Number.isSafeInteger(boat.pointCount)||boat.pointCount<0||boat.stationCount!==manifest.stationCount)return null;
  ids.add(boat.id);
  if(boat.sampleOffset!==offset)return null;
  offset+=(boat.pointCount+1)*8+packedSpeedBytes(boat.pointCount+1);
  if(!Number.isSafeInteger(offset)||boat.timeSampleOffset!==offset)return null;
  offset+=boat.pointCount*4+packedTimeBytes(boat.pointCount);
  if(!Number.isSafeInteger(offset)||boat.profileOffset!==offset)return null;
  offset+=packedSpeedBytes(boat.stationCount);
  if(!Number.isSafeInteger(offset)||boat.timeProfileOffset!==offset)return null;
  offset+=packedTimeBytes(boat.stationCount);
  if(!Number.isSafeInteger(offset))return null;
 }
 const file=path.join(ROOT,'viewer',manifest.bundleFile);
 if(offset!==manifest.bundleBytes||!fs.existsSync(file)||fs.statSync(file).size!==offset)return null;
 return manifest;
}

function loadNominalMath(){
 const context=vm.createContext(vm.constants.DONT_CONTEXTIFY);
 context.window={};
 for(const name of ['data','track-time','tracks','rhumbline-geometry','navigation-math']){
  vm.runInContext(fs.readFileSync(path.join(ROOT,'viewer',name+'.js'),'utf8'),context,{filename:name+'.js'});
  if(name==='data')vm.runInContext('const D=window.DATA;const boats=D.boats;',context);
 }
 const definition=JSON.parse(fs.readFileSync(path.join(ROOT,'viewer','rhumbline.json'),'utf8'));
 context.routeDefinition=definition;
 vm.runInContext("if(!validRhumbline(routeDefinition))throw Error('Invalid permanent rhumbline.');const rhumbRoute=buildRhumbRoute(routeDefinition.points);",context);
 return {definition,...vm.runInContext('({D,boats,prepareReferenceProfile,prepareProjectedTrack,prepareTimeProfiles,referenceStationCount})',context)};
}

function writeAtomic(filename,value){
 const temporary=filename+'.'+process.pid+'.tmp';
 try{fs.writeFileSync(temporary,value);fs.renameSync(temporary,filename);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}

function generate({ifStale=false}={}){
 if(os.endianness()!=='LE')throw Error('Track profile generation requires a little-endian Node.js host.');
 const started=performance.now(),state=sourceState();
 if(ifStale&&currentManifest(state)){console.log('Track profiles are current: '+state.sourceFingerprint);return;}
 const {definition,D,boats,prepareReferenceProfile,prepareProjectedTrack,prepareTimeProfiles,referenceStationCount}=loadNominalMath();
 const directory=path.join(OUTPUT,state.sourceFingerprint);
 fs.mkdirSync(directory,{recursive:true});
 const entries=[],chunks=[],ids=new Set();let byteLength=0,stationCount=0,pointCount=0;
 for(const [index,boat] of boats.entries()){
  if(typeof boat.id!=='string'||ids.has(boat.id))throw Error('Track profile boats must have unique string IDs.');
  ids.add(boat.id);
  const samples=packProjectedTrack(prepareProjectedTrack(boat)),stations=prepareReferenceProfile(boat),profile=packSpeedCodes(stations);
  const {timeSamples,timeStations}=prepareTimeProfiles(boat),packedTimes=packTimeSamples(timeSamples),packedTimeProfile=packTimeValues(timeStations);
  const sampleOffset=byteLength,timeSampleOffset=sampleOffset+samples.byteLength,profileOffset=timeSampleOffset+packedTimes.byteLength,timeProfileOffset=profileOffset+profile.byteLength;
  for(const values of [samples,packedTimes,profile,packedTimeProfile])chunks.push(Buffer.from(values.buffer,values.byteOffset,values.byteLength));
  byteLength=timeProfileOffset+packedTimeProfile.byteLength;
  entries.push({id:boat.id,pointCount:boat.points.length,stationCount:stations.length,sampleOffset,timeSampleOffset,profileOffset,timeProfileOffset});
  stationCount+=stations.length;pointCount+=boat.points.length;
  if((index+1)%10===0||index+1===boats.length)console.log(`Prepared ${index+1}/${boats.length} boats`);
 }
 if(sourceState().sourceFingerprint!==state.sourceFingerprint)throw Error('Track profile sources changed during generation; run the generator again.');
 const bundleFile=`track-profiles/${state.sourceFingerprint}/fleet.bin`;
 writeAtomic(path.join(ROOT,'viewer',bundleFile),Buffer.concat(chunks,byteLength));
 const manifest={version:6,sourceFingerprint:state.sourceFingerprint,sources:state.sources,dataDigest:digest(JSON.stringify(D)),rhumblineDigest:digest(JSON.stringify(definition)),start:D.start,byteOrder:'little-endian',stationCount:referenceStationCount(),stationSpacingMeters:10,profileEncoding:'uint10-packed',speedMaximum:25,speedCodes:1022,speedBits:10,missingValue:1023,sampleMissingValue:-1e20,sampleWords:3,samplePositionBytes:8,sampleEncoding:'uint10-speed-planar',speedSignEncoding:'signed-station-index',stationWords:1,timeEncoding:'uint10-block-scaled-seconds-per-meter',timeBits:10,timeBlockSize:256,timeCodes:1021,timeInfinity:1022,timeSampleWords:2,timeStationWords:1,bundleFile,bundleBytes:byteLength,boats:entries};
 writeAtomic(MANIFEST,JSON.stringify(manifest,null,2)+'\n');
 console.log(`Track profiles: ${boats.length} boats, ${pointCount} points, ${stationCount} stations, ${byteLength} bytes (${(byteLength/1048576).toFixed(2)} MiB), ${((performance.now()-started)/1000).toFixed(2)} s`);
 return manifest;
}

if(require.main===module){
 try{
  const args=process.argv.slice(2);
  if(args.some(arg=>arg!=='--if-stale'))throw Error('Usage: node scripts/prepare_track_profiles.cjs [--if-stale]');
  generate({ifStale:args.includes('--if-stale')});
 }catch(error){console.error('Track profile preparation failed: '+error.message);process.exitCode=1;}
}

module.exports={generate,sourceState,currentManifest,loadNominalMath,packProjectedTrack};
