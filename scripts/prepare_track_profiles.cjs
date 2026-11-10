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
 if(manifest.version!==1||manifest.sourceFingerprint!==state.sourceFingerprint||!Array.isArray(manifest.boats))return null;
 for(const boat of manifest.boats){
  for(const [name,size] of [[boat.sampleFile,(boat.pointCount+1)*12],[boat.profileFile,boat.stationCount*32]]){
   if(typeof name!=='string'||!name.startsWith('track-profiles/'+state.sourceFingerprint+'/')||name.includes('..'))return null;
   const file=path.join(ROOT,'viewer',name);
   if(!fs.existsSync(file)||fs.statSync(file).size!==size)return null;
  }
 }
 return manifest;
}

function loadNominalMath(){
 const context=vm.createContext({window:{}});
 for(const name of ['data','track-time','tracks','rhumbline-geometry','navigation-math']){
  vm.runInContext(fs.readFileSync(path.join(ROOT,'viewer',name+'.js'),'utf8'),context,{filename:name+'.js'});
  if(name==='data')vm.runInContext('const D=window.DATA;const boats=D.boats;',context);
 }
 const definition=JSON.parse(fs.readFileSync(path.join(ROOT,'viewer','rhumbline.json'),'utf8'));
 context.routeDefinition=definition;
 vm.runInContext("if(!validRhumbline(routeDefinition))throw Error('Invalid permanent rhumbline.');const rhumbRoute=buildRhumbRoute(routeDefinition.points);",context);
 return {definition,...vm.runInContext('({D,boats,prepareReferencePassages,packReferenceStations,prepareProjectedTrack})',context)};
}

function writeAtomic(filename,value){
 const temporary=filename+'.'+process.pid+'.tmp';
 try{fs.writeFileSync(temporary,value);fs.renameSync(temporary,filename);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}

function generate({ifStale=false}={}){
 if(os.endianness()!=='LE')throw Error('Track profile generation requires a little-endian Node.js host.');
 const started=performance.now(),state=sourceState();
 if(ifStale&&currentManifest(state)){console.log('Track profiles are current: '+state.sourceFingerprint);return;}
 const {definition,D,boats,prepareReferencePassages,packReferenceStations,prepareProjectedTrack}=loadNominalMath();
 const directory=path.join(OUTPUT,state.sourceFingerprint);
 fs.mkdirSync(directory,{recursive:true});
 const entries=[],ids=new Set();let byteLength=0,stationCount=0,pointCount=0;
 for(const [index,boat] of boats.entries()){
  if(typeof boat.id!=='string'||ids.has(boat.id))throw Error('Track profile boats must have unique string IDs.');
  ids.add(boat.id);
  const samples=prepareProjectedTrack(boat),profile=packReferenceStations(prepareReferencePassages(boat).stations);
  const stem=String(index).padStart(3,'0'),sampleFile=`track-profiles/${state.sourceFingerprint}/${stem}.samples.bin`,profileFile=`track-profiles/${state.sourceFingerprint}/${stem}.profile.bin`;
  for(const [name,values] of [[sampleFile,samples],[profileFile,profile]]){
   writeAtomic(path.join(ROOT,'viewer',name),Buffer.from(values.buffer,values.byteOffset,values.byteLength));
   byteLength+=values.byteLength;
  }
  entries.push({id:boat.id,pointCount:boat.points.length,stationCount:profile.length/8,sampleFile,profileFile});
  stationCount+=profile.length/8;pointCount+=boat.points.length;
  if((index+1)%10===0||index+1===boats.length)console.log(`Prepared ${index+1}/${boats.length} boats`);
 }
 if(sourceState().sourceFingerprint!==state.sourceFingerprint)throw Error('Track profile sources changed during generation; run the generator again.');
 const manifest={version:1,sourceFingerprint:state.sourceFingerprint,sources:state.sources,dataDigest:digest(JSON.stringify(D)),rhumblineDigest:digest(JSON.stringify(definition)),start:D.start,byteOrder:'little-endian',sampleWords:3,stationWords:8,missingValue:-1e20,boats:entries};
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

module.exports={generate,sourceState,currentManifest,loadNominalMath};
