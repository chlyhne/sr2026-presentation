async function fetchReplayGzip(file,expectedBytes){
 const response=await fetch(file);
 if(!response.ok)throw Error('Opstartsdata kunne ikke hentes: '+file+' ('+response.status+').');
 if(typeof DecompressionStream!=='function')throw Error('Browseren understøtter ikke gzip-afkodning af opstartsdata.');
 const buffer=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 if(buffer.byteLength!==expectedBytes)throw Error('Opstartsdata har forkert filstørrelse: '+file+'.');
 return buffer;
}
async function loadReplayData(){
 const fail=message=>{throw Error('Sporenes kildedata kunne ikke indlæses: '+message);};
 const response=await fetch('track-profiles/manifest.json',{cache:'no-store'});
 if(!response.ok)fail('manifest ('+response.status+').');
 const manifest=await response.json();
 if(manifest?.version!==10||manifest.replayEncoding!=='source-integers-xor-byteplanes-v1'
  ||manifest.compression!=='gzip'||manifest.coordinateScale!==1e7||manifest.speedScaleKmh!==10||manifest.sourcePointBytes!==SOURCE_POINT_BYTES
  ||manifest.byteOrder!=='little-endian'||!/^[a-f0-9]{64}$/.test(manifest.sourceFingerprint)
  ||manifest.dataFile!==`track-profiles/${manifest.sourceFingerprint}/data.json.gz`
  ||manifest.replayFile!==`track-profiles/${manifest.sourceFingerprint}/source.bin.gz`
  ||!Number.isSafeInteger(manifest.dataBytes)||manifest.dataBytes<=0
  ||!Number.isFinite(manifest.start)
  ||!Number.isSafeInteger(manifest.replayBytes)||manifest.replayBytes<0||!Array.isArray(manifest.boats))fail('ugyldigt manifest. Genbyg dataene.');
 const [dataBytes,source]=await Promise.all([
  fetchReplayGzip(manifest.dataFile,manifest.dataBytes),fetchReplayGzip(manifest.replayFile,manifest.replayBytes)
 ]);
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(dataBytes));
 if(data.start!==manifest.start||!Array.isArray(data.boats)||data.boats.length!==manifest.boats.length)fail('forkert starttid eller bådantal.');
 const entries=new Map(manifest.boats.map(entry=>[entry.id,entry])),seen=new Set(),bytes=new Uint8Array(source);
 if(entries.size!==manifest.boats.length)fail('gentagne båd-ID i manifestet.');
 let sourceOffset=0;
 for(const entry of manifest.boats){
  if(typeof entry.id!=='string'||!Number.isSafeInteger(entry.pointCount)||entry.pointCount<0||entry.sourceOffset!==sourceOffset)fail('ugyldig båd eller kildeposition.');
  sourceOffset+=sourceTrackBytes(entry.pointCount);
  if(sourceOffset>bytes.byteLength)fail('kildedata er afkortet.');
 }
 if(sourceOffset!==bytes.byteLength)fail('forkert samlet kildestørrelse.');
 const prepared=[];
 for(const boat of data.boats){
  const entry=entries.get(boat.id);
  if(!entry||seen.has(boat.id)||!Array.isArray(boat.trackSegments))fail('ugyldig båd eller sporsegmenter.');
  seen.add(boat.id);
  const raw=unpackSourceTrack(bytes.subarray(entry.sourceOffset,entry.sourceOffset+sourceTrackBytes(entry.pointCount)),entry.pointCount),segments=[];
  for(const point of raw.points){if(!segments.length||point[2]-segments.at(-1)[1]>TRACK_MAX_GAP)segments.push([point[2],point[2]]);else segments.at(-1)[1]=point[2];}
  if(JSON.stringify(segments)!==JSON.stringify(boat.trackSegments))fail('kildedata stemmer ikke med sporsegmenterne.');
  prepareTrackTimeIndex(raw.points);getTrackModel(raw.points);
  prepared.push({...boat,...raw});
 }
 data.boats=prepared;
 window.DATA=data;
}
