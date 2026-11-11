const trackProfileCache=new WeakMap();
let maxReferenceStations=0;
async function loadTrackProfiles(){
 const fail=message=>{throw Error('Sporprofiler kunne ikke indlæses: '+message);};
 if(!validRhumbline(window.SR_RHUMBLINE))fail('ugyldig permanent rhumbline.');
 if(!globalThis.crypto?.subtle)fail('SHA-256 kræver localhost eller HTTPS.');
 if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1)fail('Denne platform understøtter ikke little-endian Float32.');
 if(!replayResources)fail('de fælles spordata er ikke indlæst.');
 const {manifest,bundle:buffer}=replayResources,hex=/^[a-f0-9]{64}$/;
 if(!manifest||manifest.version!==7||manifest.sampleSeconds!==TRACK_SAMPLE_SECONDS||!hex.test(manifest.sourceFingerprint)||!hex.test(manifest.dataDigest)||!hex.test(manifest.rhumblineDigest)
  ||manifest.start!==D.start||manifest.byteOrder!=='little-endian'||manifest.sampleWords!==3||manifest.stationWords!==1
  ||manifest.stationSpacingMeters!==REFERENCE_STATION_METERS||manifest.profileEncoding!=='uint10-packed'
  ||manifest.stationCount!==referenceStationCount()
  ||manifest.samplePositionBytes!==8||manifest.sampleEncoding!=='uint10-speed-planar'||manifest.speedSignEncoding!=='signed-station-index'
  ||manifest.timeEncoding!=='uint10-block-scaled-seconds-per-meter'||manifest.timeBits!==10||manifest.timeBlockSize!==TRACK_TIME_BLOCK_SIZE||manifest.timeCodes!==TRACK_TIME_CODES||manifest.timeInfinity!==TRACK_TIME_INFINITY||manifest.timeSampleWords!==2||manifest.timeStationWords!==1
  ||manifest.speedMaximum!==REFERENCE_SPEED_MAX||manifest.speedBits!==10||manifest.speedCodes!==REFERENCE_SPEED_CODES||manifest.missingValue!==REFERENCE_MISSING||manifest.sampleMissingValue!==-1e20
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
  if(entry.replayOffset!==offset)fail('ugyldig sporposition i manifestet.');
  offset+=entry.pointCount*12;
  if(entry.sampleOffset!==offset)fail('ugyldig kildeposition i manifestet.');
  offset+=(entry.pointCount+1)*8+packedSpeedBytes(entry.pointCount+1);
  if(!Number.isSafeInteger(offset)||entry.timeSampleOffset!==offset)fail('ugyldig tidsprøveposition i manifestet.');
  offset+=entry.pointCount*4+packedTimeBytes(entry.pointCount);
  if(!Number.isSafeInteger(offset)||entry.profileOffset!==offset)fail('ugyldig profilposition i manifestet.');
  offset+=packedSpeedBytes(entry.stationCount);
  if(!Number.isSafeInteger(offset)||entry.timeProfileOffset!==offset)fail('ugyldig tidsprofilposition i manifestet.');
  offset+=packedTimeBytes(entry.stationCount);
  if(!Number.isSafeInteger(offset)||offset>manifest.bundleBytes)fail('ugyldig profilstørrelse i manifestet.');
  pending.push({boat,entry});
 }
 if(offset!==manifest.bundleBytes)fail('forkert samlet profilstørrelse i manifestet.');
 if(buffer.byteLength!==manifest.bundleBytes)fail('forkert samlet sporfilstørrelse.');
 const bundle=new Uint8Array(buffer);
 let maximum=0;
 const prepared=new Map();
 for(const {boat,entry} of pending){
  const packed=bundle.subarray(entry.sampleOffset,entry.timeSampleOffset),stations=unpackSpeedCodes(bundle.subarray(entry.profileOffset,entry.timeProfileOffset),entry.stationCount);
  const samples=unpackProjectedTrack(packed);
  const timeSamples=unpackTimeSamples(bundle.subarray(entry.timeSampleOffset,entry.profileOffset),entry.pointCount),timeStations=unpackTimeValues(bundle.subarray(entry.timeProfileOffset,entry.timeProfileOffset+packedTimeBytes(entry.stationCount)),entry.stationCount);
  const validTime=value=>value>=0||value===Math.fround(TRACK_TIME_MISSING);
  for(let index=0;index<timeSamples.length;index+=2){
   const station=timeSamples[index],value=timeSamples[index+1];
   if(!Number.isInteger(station)||station< -1||station>=entry.stationCount||!validTime(value)||(station===-1)!==(value<0))fail('ugyldig tidsprøve: '+boat.name+'.');
  }
  for(const value of timeStations)if(!validTime(value))fail('ugyldig tidsprofil: '+boat.name+'.');
  for(let index=0;index<samples.length;index+=3){
   if(!Number.isInteger(samples[index])||samples[index]<-1||samples[index]>=entry.stationCount)fail('ugyldigt stationsindeks: '+boat.name+'.');
  }
  if(entry.pointCount)for(let i=0;i<3;i++)if(samples[entry.pointCount*3+i]!==samples[(entry.pointCount-1)*3+i])fail('manglende slutprøve: '+boat.name+'.');
  if(entry.pointCount)for(let index=0;index<2;index++)if(timeSamples[entry.pointCount*2+index]!==timeSamples[(entry.pointCount-1)*2+index])fail('manglende tids-slutprøve: '+boat.name+'.');
  maximum=Math.max(maximum,entry.stationCount);prepared.set(boat.points,{samples,stations,timeSamples,timeStations});
 }
 for(const [points,profile] of prepared)trackProfileCache.set(points,profile);
 maxReferenceStations=maximum;
 replayResources=null;
}
