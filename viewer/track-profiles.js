const trackProfileCache=new WeakMap();
let maxReferenceStations=0;
async function loadTrackProfiles(){
 const fail=message=>{throw Error('Sporprofiler kunne ikke indlæses: '+message);};
 if(!validRhumbline(window.SR_RHUMBLINE))fail('ugyldig permanent rhumbline.');
 if(!globalThis.crypto?.subtle)fail('SHA-256 kræver localhost eller HTTPS.');
 if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1)fail('Denne platform understøtter ikke little-endian Float32.');
 const response=await fetch('track-profiles/manifest.json',{cache:'no-store'});
 if(!response.ok)fail('manifest ('+response.status+').');
 const manifest=await response.json(),hex=/^[a-f0-9]{64}$/;
 if(!manifest||manifest.version!==3||!hex.test(manifest.sourceFingerprint)||!hex.test(manifest.dataDigest)||!hex.test(manifest.rhumblineDigest)
  ||manifest.start!==D.start||manifest.byteOrder!=='little-endian'||manifest.sampleWords!==3||manifest.stationWords!==1
  ||manifest.stationSpacingMeters!==REFERENCE_STATION_METERS||manifest.profileEncoding!=='uint8'
  ||manifest.stationCount!==referenceStationCount()
  ||manifest.sampleBytes!==9||manifest.sampleEncoding!=='uint8-speed-planar'||manifest.speedSignEncoding!=='signed-station-index'
  ||manifest.speedMaximum!==REFERENCE_SPEED_MAX||manifest.speedCodes!==254||manifest.missingValue!==REFERENCE_MISSING||manifest.sampleMissingValue!==-1e20
  ||!Array.isArray(manifest.boats)||manifest.boats.length!==boats.length)fail('ugyldigt manifestformat.');
 async function digest(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 }
 const rhumblineDigest=await digest(window.SR_RHUMBLINE);
 if(rhumblineDigest!==manifest.rhumblineDigest)fail('rhumbline stemmer ikke med de forberedte profiler. Genbyg profilerne og genindlæs siden.');
 if(manifest.bundleFile!==`track-profiles/${manifest.sourceFingerprint}/fleet.bin`||!Number.isSafeInteger(manifest.bundleBytes)||manifest.bundleBytes<0)fail('ugyldig samlet profilfil.');
 const byId=new Map(boats.map(boat=>[boat.id,boat])),seen=new Set(),pending=[];
 let offset=0;
 for(const entry of manifest.boats){
  const boat=byId.get(entry?.id);
  if(!boat||seen.has(entry.id)||entry.pointCount!==boat.points.length||entry.stationCount!==referenceStationCount())fail('ugyldig båd eller antal i manifestet.');
  seen.add(entry.id);
  if(entry.sampleOffset!==offset)fail('ugyldig kildeposition i manifestet.');
  offset+=(entry.pointCount+1)*9;
  if(!Number.isSafeInteger(offset)||entry.profileOffset!==offset)fail('ugyldig profilposition i manifestet.');
  offset+=entry.stationCount;
  if(!Number.isSafeInteger(offset)||offset>manifest.bundleBytes)fail('ugyldig profilstørrelse i manifestet.');
  pending.push({boat,entry});
 }
 async function load(name,byteLength){
  const response=await fetch(name);
  if(!response.ok)fail(name+' ('+response.status+').');
  const buffer=await response.arrayBuffer();
  if(buffer.byteLength!==byteLength)fail('forkert filstørrelse: '+name+'.');
  return new Uint8Array(buffer);
 }
 if(offset!==manifest.bundleBytes)fail('forkert samlet profilstørrelse i manifestet.');
 const bundle=await load(manifest.bundleFile,manifest.bundleBytes);
 let maximum=0;
 const prepared=new Map();
 for(const {boat,entry} of pending){
  const packed=bundle.subarray(entry.sampleOffset,entry.profileOffset),stations=bundle.slice(entry.profileOffset,entry.profileOffset+entry.stationCount);
  const samples=unpackProjectedTrack(packed);
  for(let index=0;index<samples.length;index+=3){
   if(!Number.isInteger(samples[index])||samples[index]<-1||samples[index]>=entry.stationCount)fail('ugyldigt stationsindeks: '+boat.name+'.');
  }
  if(entry.pointCount)for(let i=0;i<3;i++)if(samples[entry.pointCount*3+i]!==samples[(entry.pointCount-1)*3+i])fail('manglende slutprøve: '+boat.name+'.');
  maximum=Math.max(maximum,entry.stationCount);prepared.set(boat.points,{samples,stations});
 }
 for(const [points,profile] of prepared)trackProfileCache.set(points,profile);
 maxReferenceStations=maximum;
}
