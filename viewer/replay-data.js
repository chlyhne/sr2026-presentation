function validatePreparedAsset(asset,fingerprint,profileRoot){
 const prefix=profileRoot+fingerprint+'/';
 if(!asset||typeof asset.file!=='string'||!asset.file.startsWith(prefix)||!/^common\.bin\.gz$/.test(asset.file.slice(prefix.length))||!Number.isSafeInteger(asset.bytes)||asset.bytes<8||!Number.isSafeInteger(asset.compressedBytes)||asset.compressedBytes<=0)throw Error(srText('De forberedte sporfilers manifest er ugyldigt. Genbyg siden.'));
}
async function fetchReplayGzip(file,expectedBytes){
 const response=await fetch(file);
 if(!response.ok)throw Error(srText('Opstartsdata kunne ikke hentes: ')+file+' ('+response.status+').');
 if(typeof DecompressionStream!=='function')throw Error(srText('Browseren understøtter ikke gzip-afkodning af opstartsdata.'));
 const buffer=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 if(buffer.byteLength!==expectedBytes)throw Error(srText('Opstartsdata har forkert filstørrelse: ')+file+'.');
 return buffer;
}
async function loadReplayBoatCountries(file){
 const response=await fetch(file);
 if(!response.ok)throw new SRMessageError('Nationaliteter kunne ikke hentes ({0}).',response.status);
 return response.json();
}
function applyReplayBoatCountries(countries,data){
 for(const boat of data.boats){
  const details=data.boatDetails?.[boat.id],country=countries?.[details?.startNumber];
  if(typeof country!=='string'||!/^[A-Z]{2}$/.test(country))throw new SRMessageError('Nationalitet mangler for {0}.',boat.name);
  details.country=country;
 }
}
async function loadReplayData(){
 const fail=message=>{throw Error(srText('Sporenes kildedata kunne ikke indlæses: ')+message);};
 const response=await fetch(window.SR_EVENT.profileRoot+'manifest.json',{cache:'no-store'});
 if(!response.ok)fail('manifest ('+response.status+').');
 const manifest=await response.json();
 if(manifest?.version!==13||manifest.eventId!==window.SR_EVENT.id||manifest.replayEncoding!=='source-integers-xor-byteplanes-v1'
  ||manifest.compression!=='gzip'||manifest.coordinateScale!==1e7||manifest.speedScaleKmh!==10||manifest.sourcePointBytes!==SOURCE_POINT_BYTES
  ||manifest.byteOrder!=='little-endian'||!/^[a-f0-9]{64}$/.test(manifest.sourceFingerprint)
  ||manifest.dataFile!==`${window.SR_EVENT.profileRoot}${manifest.sourceFingerprint}/data.json.gz`
  ||manifest.replayFile!==`${window.SR_EVENT.profileRoot}${manifest.sourceFingerprint}/source.bin.gz`
  ||!Number.isSafeInteger(manifest.dataBytes)||manifest.dataBytes<=0
  ||!Number.isFinite(manifest.start)
  ||!Number.isSafeInteger(manifest.replayBytes)||manifest.replayBytes<0||!Array.isArray(manifest.boats))fail(srText('ugyldigt manifest. Genbyg dataene.'));
 if(manifest.prepared?.version!==4)fail(srText('færdige sporfiler mangler. Genbyg siden.'));
 validatePreparedAsset(manifest.prepared.common,manifest.sourceFingerprint,window.SR_EVENT.profileRoot);
 const countryFile=window.SR_EVENT.boatCountryFile;
 const [dataBytes,source,commonBytes,countries]=await Promise.all([
  fetchReplayGzip(manifest.dataFile,manifest.dataBytes),fetchReplayGzip(manifest.replayFile,manifest.replayBytes),fetchReplayGzip(manifest.prepared.common.file,manifest.prepared.common.bytes),
  countryFile?loadReplayBoatCountries(countryFile):null
 ]);
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(dataBytes));
 if(data.start!==manifest.start||!Array.isArray(data.boats)||data.boats.length!==manifest.boats.length)fail(srText('forkert starttid eller bådantal.'));
 if(countryFile)applyReplayBoatCountries(countries,data);
 const entries=new Map(manifest.boats.map(entry=>[entry.id,entry])),seen=new Set(),bytes=new Uint8Array(source);
 if(entries.size!==manifest.boats.length)fail(srText('gentagne båd-ID i manifestet.'));
 let sourceOffset=0;
 for(const entry of manifest.boats){
  if(typeof entry.id!=='string'||!Number.isSafeInteger(entry.pointCount)||entry.pointCount<0||entry.sourceOffset!==sourceOffset)fail(srText('ugyldig båd eller kildeposition.'));
  sourceOffset+=sourceTrackBytes(entry.pointCount);
  if(sourceOffset>bytes.byteLength)fail(srText('kildedata er afkortet.'));
 }
 if(sourceOffset!==bytes.byteLength)fail(srText('forkert samlet kildestørrelse.'));
 const common=unpackPreparedTracks(commonBytes,'common');if(common.size!==manifest.boats.length)fail(srText('forkert antal forberedte både.'));
 const prepared=[];
 for(const boat of data.boats){
  const entry=entries.get(boat.id);
  if(!entry||seen.has(boat.id)||!Array.isArray(boat.trackSegments))fail(srText('ugyldig båd eller sporsegmenter.'));
  seen.add(boat.id);
  const raw=unpackSourceTrack(bytes.subarray(entry.sourceOffset,entry.sourceOffset+sourceTrackBytes(entry.pointCount)),entry.pointCount),segments=[];
  for(const point of raw.points){if(!segments.length||point[2]-segments.at(-1)[1]>TRACK_MAX_GAP)segments.push([point[2],point[2]]);else segments.at(-1)[1]=point[2];}
  if(JSON.stringify(segments)!==JSON.stringify(boat.trackSegments))fail(srText('kildedata stemmer ikke med sporsegmenterne.'));
  if(!common.has(boat.id))fail(srText('manglende stationsprofil.'));
  const arrays=common.get(boat.id).arrays;
  for(const course of Object.keys(manifest.prepared.routePoints))arrays[course+'_timeSamples']=restoreTrackTimeSamples(arrays[course+'_samples']);
  getTrackModel(raw.points);prepareTrackTimeIndex(raw.points);
  prepared.push({...boat,...raw});
 }
 data.boats=prepared;
 window.SR_TRACK_SOURCE_FINGERPRINT=manifest.sourceFingerprint;
 window.SR_TRACK_MANIFEST=manifest;
 window.SR_PREPARED_COMMON=common;
 window.DATA=data;
}
