// Read-only build artifacts. There is no client-side preparation or IndexedDB.
class TrackFiles {
 constructor(simple=false){this.simple=simple;this.reads=0;}
 async open(){
  this.manifest=window.SR_TRACK_MANIFEST?.prepared;
  if(this.manifest?.version!==2||!Array.isArray(this.manifest.references)||!Array.isArray(this.manifest.handicaps)||!window.SR_PREPARED_COMMON)throw Error('De færdige sporfiler mangler. Genbyg siden.');
  for(const [course,definition] of Object.entries(window.SR_RHUMBLINES)){
   if(JSON.stringify(this.manifest.routePoints[course])!==JSON.stringify(definition.points))throw Error('Sporfilerne er bygget til en anden rhumbline for '+course+'. Genbyg siden.');
  }
  for(const asset of [this.manifest.line,this.manifest.cubic,...this.manifest.references])validatePreparedAsset(asset,window.SR_TRACK_SOURCE_FINGERPRINT);
  this.common=window.SR_PREPARED_COMMON;this.references=new Map(this.manifest.references.map(entry=>[entry.id,entry]));
  const handicaps=new Map(this.manifest.handicaps.map(entry=>[entry.id,entry.value]));
  if(this.common.size!==boats.length||this.references.size!==boats.length)throw Error('Sporfilernes bådliste stemmer ikke med kildedata.');
  for(const boat of boats){
   if(!this.common.has(boat.id)||!this.references.has(boat.id)||handicaps.get(boat.id)!==(boat.handicapSecondsPerNm||0))throw Error('Sporfilerne matcher ikke bådens handicap: '+boat.name);
  }
 }
 async bundle(asset,kind){
  validatePreparedAsset(asset,window.SR_TRACK_SOURCE_FINGERPRINT);
  const buffer=await fetchReplayGzip(asset.file,asset.bytes);
  if(this.closed)throw Error('Indlæsningen af sporfiler blev afbrudt.');
  const entries=unpackPreparedTracks(buffer,kind);
  if(entries.size!==this.common.size||[...this.common.keys()].some(id=>!entries.has(id)))throw Error('Sporfilens bådliste er ugyldig.');
  this.reads++;return entries;
 }
 descriptor(id){return this.common.get(id)?.record[this.simple?'line':'cubic'];}
 mirror(id,course=referenceBoat().course){
  const a=this.common.get(id).arrays;
  return Object.fromEntries(['samples','stations','timeSamples','timeStations'].map(name=>[name,a[course+'_'+name]]));
 }
 async reference(id){
  if(this.referenceId===id)return this.referenceEntries;
  const asset=this.references.get(id);if(!asset)throw Error('Referencebådens forberedte farvefil mangler.');
  const entries=await this.bundle(asset,'reference');
  for(const [boatId,entry] of entries){
   const record=this.descriptor(boatId),count=record.comparisonWidth*record.comparisonHeight;
   for(const mode of ['absolute','handicap','time'])if(!(entry.arrays[mode] instanceof Float32Array)||entry.arrays[mode].length!==count)throw Error('Referencefilens farvekanal har forkert størrelse.');
  }
  this.referenceId=id;this.referenceEntries=entries;return entries;
 }
 async get(id,kind,bytes){
  let values;
  if(kind==='speed')values=this.common.get(id)?.arrays.speed;
  else if(kind==='geometry-line'||kind==='geometry-cubic'||kind==='caps'){
   if(!this.geometry)this.geometry=await this.bundle(this.manifest[this.simple?'line':'cubic'],this.simple?'line':'cubic');
   values=this.geometry.get(id)?.arrays[kind==='caps'?'caps':'geometry'];
  }else throw Error('Ukendt forberedt sporfil: '+kind);
  if(!values||values.byteLength!==bytes)throw Error('Den færdige sporfil mangler eller har forkert størrelse: '+id+'/'+kind);
  return values;
 }
 releaseGeometry(){this.geometry=null;}
 close(){this.closed=true;this.common=null;this.geometry=null;this.referenceEntries=null;}
}
