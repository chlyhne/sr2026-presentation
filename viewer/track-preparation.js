const trackProfileCache=new WeakMap();
class GPUTrackResources {
 constructor(gl,preparation){this.gl=gl;this.preparation=preparation;this.objects=new Map();}
 create(kind,...args){return this.own(kind,this.gl['create'+kind](...args));}
 own(kind,object){if(!object)throw Error(srText('Kunne ikke oprette GPU-')+kind+'.');this.objects.set(object,kind);return object;}
 release(object){const kind=this.objects.get(object);if(!kind)return;if(!this.preparation.contextLost&&!this.gl.isContextLost())this.gl['delete'+kind](object);this.objects.delete(object);}
 transfer(object,owner){const kind=this.objects.get(object);if(!kind)throw Error(srText('GPU-objektet mangler ejer.'));owner.objects.set(object,kind);this.objects.delete(object);}
 dispose(){if(!this.preparation.contextLost&&!this.gl.isContextLost())for(const [object,kind] of this.objects)this.gl['delete'+kind](object);this.objects.clear();}
}
class TrackPreparation {
 constructor(renderer){
  this.renderer=renderer;this.records=renderer.buffers;this.files=new TrackFiles(renderer.simpleTracks);this.denseSamples=0;
 }
 attachGraphics(gl){this.gl=gl;this.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);this.resources=new GPUTrackResources(gl,this);this.scope=this.resources;}
 assertLive(){if(this.disposed||this.gl?.isContextLost())throw Error(srText('Sporklargøringen blev afbrudt af konteksttab eller geninitialisering.'));}
 dispose(){
  if(this.disposed)return;this.contextLost=!!this.gl?.isContextLost();this.disposed=true;
  for(const points of this.records.keys())trackProfileCache.delete(points);
  this.records.clear();this.resources?.dispose();this.files.close();
 }
 finishSourcePreparation(){this.assertLive();this.sourceFinished=true;this.renderer.phase=srText('Færdige sporfiler indlæst');}
 async prepare(boat){
  this.assertLive();
  const descriptor=this.files.descriptor(boat.id),mirror=this.files.mirror(boat.id);
  if(!descriptor||descriptor.pointCount!==boat.points.length)throw Error(srText('Den færdige sporfil har forkert punktantal: ')+boat.name);
  if(mirror.samples.length!==(boat.points.length+1)*3||mirror.timeSamples.length!==(boat.points.length+1)*2||mirror.stations.length!==referenceStationCount()||mirror.timeStations.length!==referenceStationCount())throw Error(srText('Sporfilens opslag har forkert størrelse: ')+boat.name);
  const record={...descriptor,boatId:boat.id,boat,courseTextures:new Map(),stationTextures:new Map(),texture:null,capTexture:null,comparisonTexture:null,comparisonSamples:new Map(),styleBytes:0,bytes:0};
  this.records.set(boat.points,record);trackProfileCache.set(boat.points,mirror);this.renderer.uploads++;this.denseSamples+=record.denseSamples||0;
 }
 async compare(reference){
  this.assertLive();await this.files.reference(reference.id);
  for(const boat of boats){
   const record=this.records.get(boat.points);record.comparisonSamples.clear();
   trackProfileCache.set(boat.points,this.files.mirror(boat.id,reference.course));
  }
  this.renderer.comparisonReference=reference.points;this.renderer.comparisonEpoch=this.renderer.uploads;
 }
 texture(width,height,data=null,integer=false){
  this.assertLive();const gl=this.gl;
  if(!gl)throw Error(srText('GPU-upload blev forsøgt før rendererinitialisering.'));
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||Math.max(width,height)>this.maxTextureSize)throw Error(srText('Spordata overskrider GPU-teksturgrænsen.'));
  const texture=this.scope.create('Texture');gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texStorage2D(gl.TEXTURE_2D,1,integer?gl.RG32I:gl.RGBA32F,width,height);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  if(data)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,integer?gl.RG_INTEGER:gl.RGBA,integer?gl.INT:gl.FLOAT,data);
  return texture;
 }
 check(label){this.stage=label;const error=this.gl.getError();if(error)throw Error(label+': '+error);}
 releaseStyle(){}
 async loadStyle(mode,reference){
  const referenceRecord=this.records.get(reference.points);
  this.referenceTexture=referenceRecord.stationTextures.get(reference.course);
  if(!this.referenceTexture)throw Error(srText('Referenceprofilen er ikke uploadet.'));
  for(const record of this.records.values())record.comparisonTexture=record.courseTextures.get(reference.course);
 }
 uploadProfiles(boat,record){
  const gl=this.gl,speed=this.files.local.get(boat.id).speed;
  for(const course of Object.keys(this.files.manifest.routePoints)){
   const mirror=this.files.mirror(boat.id,course),values=new Float32Array(record.comparisonWidth*record.comparisonHeight*4);
   for(let i=0;i<=boat.points.length;i++)values.set([Math.max(mirror.samples[i*3],mirror.timeSamples[i*2]),mirror.samples[i*3+2],mirror.timeSamples[i*2+1],speed[i]],i*4);
   const texture=this.texture(record.comparisonWidth,record.comparisonHeight,values);record.courseTextures.set(course,texture);record.bytes+=values.byteLength;
   const width=Math.min(1024,mirror.stations.length),height=Math.ceil(mirror.stations.length/width),stations=new Float32Array(width*height*2);
   for(let i=0;i<mirror.stations.length;i++)stations.set([mirror.stations[i],mirror.timeStations[i]],i*2);
   const stationTexture=this.resources.create('Texture');gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,stationTexture);
   gl.texStorage2D(gl.TEXTURE_2D,1,gl.RG32F,width,height);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RG,gl.FLOAT,stations);
   record.stationTextures.set(course,stationTexture);record.bytes+=stations.byteLength;
  }
  this.check(srText('Upload profiles ')+boat.name);
 }
 async loadGeometry(){
  const gl=this.gl;
  for(const boat of boats){
   const record=this.records.get(boat.points);if(record.texture)continue;
   this.renderer.phase=srText('Indlæser sporgeometri · ')+boat.name;setViewerLoadingStage(this.renderer.phase);
   const geometry=await this.files.get(boat.id,record.geometryFile,record.geometryBytes);this.assertLive();
   const caps=record.capBytes?await this.files.get(boat.id,'caps',record.capBytes):null;this.assertLive();
   this.uploadProfiles(boat,record);
   const transaction=new GPUTrackResources(gl,this);this.scope=transaction;
   try{
    const texture=this.texture(record.geometryWidth,record.geometryHeight,geometry);
    const capTexture=caps?this.texture(record.capWidth,record.capHeight,new Int32Array(caps.buffer,caps.byteOffset,caps.length),true):null;
    this.check(srText('Load track geometry ')+boat.name);
    transaction.transfer(texture,this.resources);if(capTexture)transaction.transfer(capTexture,this.resources);
    record.texture=texture;record.capTexture=capTexture;record.bytes+=record.geometryBytes+record.capBytes;
   }finally{transaction.dispose();this.scope=this.resources;}
  }
  this.files.releaseGeometry();
 }
 comparisonValues(record,index,connects){
  const values=new Float32Array(connects?8:4),reference=referenceBoat(),own=this.files.mirror(record.boatId,reference.course),ref=this.files.mirror(reference.id,reference.course);
  for(let point=0;point<(connects?2:1);point++)values.set(trackComparisonAt(own,ref,index+point,record.boat.handicapSecondsPerNm||0,reference.handicapSecondsPerNm||0),point*4);
  return values;
 }
 async ready(label=srText('Vent på GPU-upload')){
  this.renderer.phase=label;await waitForGpu(this.gl,label,()=>this.disposed);this.assertLive();this.check(srText('Finish track upload'));
  this.renderer.phase=srText('GPU-upload færdig');window.SRClientDiagnostics?.report('gpu-ready',label);
 }
}
