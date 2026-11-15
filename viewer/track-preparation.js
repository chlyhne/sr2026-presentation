const trackProfileCache=new WeakMap();
class GPUTrackResources {
 constructor(gl,preparation){this.gl=gl;this.preparation=preparation;this.objects=new Map();}
 create(kind,...args){return this.own(kind,this.gl['create'+kind](...args));}
 own(kind,object){if(!object)throw Error('Kunne ikke oprette GPU-'+kind+'.');this.objects.set(object,kind);return object;}
 release(object){const kind=this.objects.get(object);if(!kind)return;if(!this.preparation.contextLost&&!this.gl.isContextLost())this.gl['delete'+kind](object);this.objects.delete(object);}
 transfer(object,owner){const kind=this.objects.get(object);if(!kind)throw Error('GPU-objektet mangler ejer.');owner.objects.set(object,kind);this.objects.delete(object);}
 dispose(){if(!this.preparation.contextLost&&!this.gl.isContextLost())for(const [object,kind] of this.objects)this.gl['delete'+kind](object);this.objects.clear();}
}
class TrackPreparation {
 constructor(renderer){
  this.renderer=renderer;this.records=renderer.buffers;this.files=new TrackFiles(renderer.simpleTracks);this.denseSamples=0;
 }
 attachGraphics(gl){this.gl=gl;this.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);this.resources=new GPUTrackResources(gl,this);this.scope=this.resources;}
 assertLive(){if(this.disposed||this.gl?.isContextLost())throw Error('Sporklargøringen blev afbrudt af konteksttab eller geninitialisering.');}
 dispose(){
  if(this.disposed)return;this.contextLost=!!this.gl?.isContextLost();this.disposed=true;
  for(const points of this.records.keys())trackProfileCache.delete(points);
  this.records.clear();this.resources?.dispose();this.files.close();
 }
 finishSourcePreparation(){this.assertLive();this.sourceFinished=true;this.renderer.phase='Færdige sporfiler indlæst';}
 async prepare(boat){
  this.assertLive();
  const descriptor=this.files.descriptor(boat.id),mirror=this.files.mirror(boat.id);
  if(!descriptor||descriptor.pointCount!==boat.points.length)throw Error('Den færdige sporfil har forkert punktantal: '+boat.name);
  if(mirror.samples.length!==(boat.points.length+1)*3||mirror.timeSamples.length!==(boat.points.length+1)*2||mirror.stations.length!==referenceStationCount()||mirror.timeStations.length!==referenceStationCount())throw Error('Sporfilens opslag har forkert størrelse: '+boat.name);
  const record={...descriptor,boatId:boat.id,texture:null,capTexture:null,comparisonTexture:null,comparisonSamples:new Map(),styleBytes:0,bytes:0};
  this.records.set(boat.points,record);trackProfileCache.set(boat.points,mirror);this.renderer.uploads++;this.denseSamples+=record.denseSamples;
 }
 async compare(reference){
  this.renderer.phase='Henter færdige farver til '+reference.name;setViewerLoadingStage(this.renderer.phase);
  const entries=await this.files.reference(reference.id);this.assertLive();
  for(const boat of boats){const record=this.records.get(boat.points);record.colourValues=entries.get(boat.id).arrays;record.comparisonSamples.clear();}
  this.renderer.comparisonReference=reference.points;this.renderer.comparisonEpoch=this.renderer.uploads;
 }
 texture(width,height,data=null,integer=false){
  this.assertLive();const gl=this.gl;
  if(!gl)throw Error('GPU-upload blev forsøgt før rendererinitialisering.');
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||Math.max(width,height)>this.maxTextureSize)throw Error('Spordata overskrider GPU-teksturgrænsen.');
  const texture=this.scope.create('Texture');gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texStorage2D(gl.TEXTURE_2D,1,integer?gl.RG32I:gl.RGBA32F,width,height);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  if(data)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,integer?gl.RG_INTEGER:gl.RGBA,integer?gl.INT:gl.FLOAT,data);
  return texture;
 }
 check(label){this.stage=label;const error=this.gl.getError();if(error)throw Error(label+': '+error);}
 releaseStyle(){
  const gl=this.gl;gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,null);
  for(const record of this.records.values()){
   if(record.comparisonTexture)this.resources.release(record.comparisonTexture);
   record.comparisonTexture=null;record.bytes-=record.styleBytes;record.styleBytes=0;
  }
 }
 async loadStyle(mode,reference){
  this.releaseStyle();if(mode==='boat')return;
  const gl=this.gl;
  for(const boat of boats){
   const record=this.records.get(boat.points),bytes=record.comparisonWidth*record.comparisonHeight*4;
   setViewerLoadingStage('Indlæser sportype '+mode+' · '+boat.name);
   const values=mode==='speed'?await this.files.get(boat.id,'speed',bytes):record.colourValues[mode];this.assertLive();
   const texture=this.resources.create('Texture');gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,texture);
   gl.texStorage2D(gl.TEXTURE_2D,1,gl.R32F,record.comparisonWidth,record.comparisonHeight);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,record.comparisonWidth,record.comparisonHeight,gl.RED,gl.FLOAT,values);
   this.check('Load track colour '+boat.name);record.comparisonTexture=texture;record.styleBytes=bytes;record.bytes+=bytes;
  }
 }
 async loadGeometry(){
  const gl=this.gl;
  for(const boat of boats){
   const record=this.records.get(boat.points);if(record.texture)continue;
   this.renderer.phase='Indlæser sporgeometri · '+boat.name;setViewerLoadingStage(this.renderer.phase);
   const geometry=await this.files.get(boat.id,record.geometryFile,record.geometryBytes);this.assertLive();
   const caps=record.capBytes?await this.files.get(boat.id,'caps',record.capBytes):null;this.assertLive();
   const transaction=new GPUTrackResources(gl,this);this.scope=transaction;
   try{
    const texture=this.texture(record.geometryWidth,record.geometryHeight,geometry);
    const capTexture=caps?this.texture(record.capWidth,record.capHeight,new Int32Array(caps.buffer,caps.byteOffset,caps.length),true):null;
    this.check('Load track geometry '+boat.name);
    transaction.transfer(texture,this.resources);if(capTexture)transaction.transfer(capTexture,this.resources);
    record.texture=texture;record.capTexture=capTexture;record.bytes+=record.geometryBytes+record.capBytes;
   }finally{transaction.dispose();this.scope=this.resources;}
  }
  this.files.releaseGeometry();
 }
 comparisonValues(record,index,connects){
  const values=new Float32Array(connects?8:4);
  for(let point=0;point<(connects?2:1);point++)for(const [component,mode] of ['absolute','handicap','time'].entries())values[point*4+component]=record.colourValues[mode][index+point];
  return values;
 }
 async ready(label='Vent på GPU-upload'){
  this.renderer.phase=label;await waitForGpu(this.gl,label,()=>this.disposed);this.assertLive();this.check('Finish track upload');
  this.renderer.phase='GPU-upload færdig';window.SRClientDiagnostics?.report('gpu-ready',label);
 }
}
