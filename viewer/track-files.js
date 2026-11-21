// Profiles are deployed once per boat; cheap buffers are prepared at startup.
class TrackFiles {
 constructor(simple=false){this.simple=simple;this.reads=0;}
 async open(){
  this.manifest=window.SR_TRACK_MANIFEST?.prepared;
  if(this.manifest?.version!==4||!Array.isArray(this.manifest.handicaps)||!window.SR_PREPARED_COMMON)throw Error(srText('De nye sporprofiler mangler. Genbyg siden.'));
  for(const [course,definition] of Object.entries(window.SR_RHUMBLINES)){
   if(JSON.stringify(this.manifest.routePoints[course])!==JSON.stringify(definition.points))throw Error(srText('Sporprofilerne matcher ikke rhumblinen for ')+course+'.');
  }
  this.common=window.SR_PREPARED_COMMON;
  const handicaps=new Map(this.manifest.handicaps.map(entry=>[entry.id,entry.value]));
  if(this.common.size!==boats.length)throw Error(srText('Sporprofilernes bådliste stemmer ikke med kildedata.'));
  this.local=new Map();
  for(const boat of boats){
   if(!this.common.has(boat.id)||handicaps.get(boat.id)!==(boat.handicapSecondsPerNm||0))throw Error(srText('Sporprofilerne matcher ikke ')+boat.name);
   const local=prepareLocalTrackData(boat,D.start,this.simple);
   local.lineGeometry=null;local.bounds=null;
   this.local.set(boat.id,local);
  }
 }
 descriptor(id){return this.local.get(id)?.record;}
 mirror(id,course=referenceBoat().course){
  const a=this.common.get(id).arrays;
  return Object.fromEntries(['samples','stations','timeSamples','timeStations'].map(name=>[name,a[course+'_'+name]]));
 }
 async reference(id){
  if(!this.common.has(id))throw Error(srText('Referencebådens profil mangler.'));
  this.referenceId=id;
 }
 async get(id,kind,bytes){
  const local=this.local.get(id),values=kind==='speed'?local?.speed:kind==='caps'?local?.caps:local?.geometry;
  if(!values||values.byteLength!==bytes)throw Error(srText('Den lokale sporbuffer har forkert størrelse: ')+id+'/'+kind);
  return values;
 }
 releaseGeometry(){for(const local of this.local.values()){local.geometry=null;local.caps=null;}this.geometry=null;}
 close(){this.closed=true;this.common=null;this.local=null;}
}
