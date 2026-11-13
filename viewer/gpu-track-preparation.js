const trackProfileCache=new WeakMap();

// Every WebGL object has one owner. A boat's preparation is a transaction:
// publish its retained textures only after readback/validation; release everything
// else on success AND failure. Context loss abandons invalid driver handles.
class GPUTrackResources {
 constructor(gl){this.gl=gl;this.objects=new Map();}
 create(kind,...args){return this.own(kind,this.gl['create'+kind](...args));}
 own(kind,object){
  if(!object)throw Error('Could not allocate GPU '+kind+'.');
  this.objects.set(object,kind);return object;
 }
 release(object){
  const kind=this.objects.get(object);if(!kind)return;
  this.gl['delete'+kind](object);this.objects.delete(object);
 }
 transfer(object,owner){
  const kind=this.objects.get(object);if(!kind)throw Error('Unowned GPU resource.');
  owner.objects.set(object,kind);this.objects.delete(object);
 }
 dispose(){
  if(!this.gl.isContextLost())for(const [object,kind] of this.objects)this.gl['delete'+kind](object);
  this.objects.clear();
 }
}

// RGBA32F, row width <=1024 texels, nearest sampling. Units/layout per record:
// source (temporary), 2 texels: [mapX,mapY,timeHi,SOG_kn], [dx,dy,dt_s,timeLo].
// geometry (retained), 4 texels: [originXY,0,0], [deltaXY,m0XY],
//   [m1XY,SOG0,SOG1], [timeHi,dt,timeLo,capFlags]. Renderer evaluates PCHIP.
// knots/dense, 2 texels: [legLocal_m,VMG_kn,secondsPerMeter,legIndex],
//   [time_s,sourceIndex,stationIndex OR connectedFlag,legStart_m].
// bounds (temporary): two [minProgress_m,maxProgress_m] pairs per texel.
// profile (retained), per 10m station: [firstForwardVMG,sumPassageSecondsPerMeter,
//   firstPassageTime_s,samplingSpan_s]. Last two lanes describe sampling provenance.
// comparison (retained): [absoluteGain_kn,handicapGain_kn,timeGain_sPer100m,missing].
// Native deltas and split times are formed before Float32 conversion. No 10-bit
// packing or CPU profile generation. Dense samples/bounds are released per boat.
class GPUTrackPreparation {
 constructor(renderer){
  this.renderer=renderer;this.gl=renderer.gl;this.records=renderer.buffers;
  this.resources=new GPUTrackResources(this.gl);this.scope=this.resources;
  this.denseSamples=0;this.legs=rhumbRoute.legs;this.stationCount=referenceStationCount();
  this.maxTextureSize=this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
  try{this.initialize();}catch(error){this.dispose();throw error;}
 }
 initialize(){
  const gl=this.gl;if(!gl.getExtension('EXT_color_buffer_float'))throw Error('RGBA32F rendering unavailable');
  this.vao=this.scope.create('VertexArray');this.feedback=this.scope.create('TransformFeedback');this.fbo=this.scope.create('Framebuffer');
  for(const [name,stage] of Object.entries(GPU_TRACK_SHADERS))this[name]=this.program(stage);
  // Route legs: local Mercator XY/delta, start/distance/bearing/exp(latitude),
  // exact shared endpoint/end-progress. Origin is (12E,55N), distances in metres.
  const route=new Float32Array(Math.max(1,this.legs.length)*12),originY=mercatorLatitude(55);
  for(const leg of this.legs)route.set([
   (leg.a[0]-12)*NAV_RAD*6371008.8,(mercatorLatitude(leg.a[1])-originY)*6371008.8,leg.dx*6371008.8,leg.dy*6371008.8,
   leg.start*1852,leg.distance*1852,leg.bearing*NAV_RAD,Math.exp(mercatorLatitude(leg.a[1])),
   (leg.b[0]-12)*NAV_RAD*6371008.8,(mercatorLatitude(leg.b[1])-originY)*6371008.8,(leg.start+leg.distance)*1852,0
  ],leg.index*12);
  this.route=this.texture(3,Math.max(1,this.legs.length),route);this.check('Initialize GPU preparation');
 }
 dispose(){
  for(const points of this.records.keys())trackProfileCache.delete(points);
  if(!this.gl.isContextLost()&&this.resources.objects.has(this.gl.getParameter(this.gl.CURRENT_PROGRAM)))this.gl.useProgram(null);
  this.records.clear();this.resources.dispose();this.disposed=true;
 }
 program({vertex,varyings,fragment}){
  const gl=this.gl,program=this.scope.create('Program'),prefix='#version 300 es\nprecision highp float;precision highp int;\n';
  for(const [type,body] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment||'out vec4 colour;void main(){colour=vec4(0.0); }']]){
   const shader=this.scope.create('Shader',type);gl.shaderSource(shader,prefix+body);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
   gl.attachShader(program,shader);this.scope.release(shader);
  }
  if(varyings)gl.transformFeedbackVaryings(program,varyings,gl.INTERLEAVED_ATTRIBS);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));return program;
 }
 uniform(program,name,value){this.gl.uniform1i(this.gl.getUniformLocation(program,name),value);}
 check(label){const error=this.gl.getError();if(error)throw Error(label+': '+error);}
 bind(program,name,texture,unit){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);this.uniform(program,name,unit);}
 texture(width,height,data=null,integer=false){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||Math.max(width,height)>this.maxTextureSize)throw Error('Track data exceeds the GPU texture limit.');
  const gl=this.gl,texture=this.scope.create('Texture');gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texStorage2D(gl.TEXTURE_2D,1,integer?gl.RG32I:gl.RGBA32F,width,height);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  if(data)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,integer?gl.RG_INTEGER:gl.RGBA,integer?gl.INT:gl.FLOAT,data);
  return texture;
 }
 feedbackRun(program,count,bytes,setup=()=>{}){
  const gl=this.gl,buffer=this.scope.create('Buffer');let begun=false;
  try{
   this.check('Before feedback');gl.useProgram(program);gl.bindVertexArray(this.vao);setup();
   gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,bytes,program===this.counts?gl.STREAM_READ:gl.STATIC_COPY);
   gl.bindBuffer(gl.ARRAY_BUFFER,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,this.feedback);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,buffer);
   gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);begun=true;this.check('Begin feedback');
   gl.drawArrays(gl.POINTS,0,count);this.check('Draw feedback');return buffer;
  }finally{
   if(begun)gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
   gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.bindVertexArray(null);
  }
 }
 fromBuffer(buffer,texels){
  const gl=this.gl,width=Math.min(1024,Math.max(1,texels)),height=Math.max(1,Math.ceil(texels/width)),texture=this.texture(width,height);
  // Feedback buffers include zeroed row padding; no intermediate CPU readback.
  try{gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,buffer);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.FLOAT,0);this.check('Buffer to texture');}
  finally{gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,null);}
  return texture;
 }
 padded(texels){const width=Math.min(1024,Math.max(1,texels));return width*Math.max(1,Math.ceil(texels/width))*16;}
 withTarget(target,run){
  const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);
  try{
   gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete float framebuffer');
   return run();
  }finally{
   gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,null,0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
 }
 draw(program,target,width,height,setup){
  const gl=this.gl;
  try{return this.withTarget(target,()=>{
   gl.useProgram(program);gl.bindVertexArray(this.vao);gl.viewport(0,0,width,height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);setup();gl.drawArrays(gl.TRIANGLES,0,3);
  });}finally{gl.bindVertexArray(null);}
 }
 prepare(boat){
  if(this.disposed||this.legs!==rhumbRoute.legs)throw Error('GPU preparation route is no longer valid.');
  const transaction=new GPUTrackResources(this.gl);this.scope=transaction;
  try{
   const record=boat.points.length?this.prepareSource(boat):this.prepareEmpty(),profile=this.readProfile(boat,record);
   this.check('GPU prepare '+boat.name);
   for(const texture of [record.texture,record.knots,record.profile,record.capTexture,record.comparisonTexture])transaction.transfer(texture,this.resources);
   this.records.set(boat.points,record);trackProfileCache.set(boat.points,profile);this.renderer.uploads++;this.denseSamples+=record.denseSamples||0;
  }finally{
   const gl=this.gl;gl.bindVertexArray(null);
   for(const target of [gl.ARRAY_BUFFER,gl.COPY_READ_BUFFER,gl.PIXEL_UNPACK_BUFFER])gl.bindBuffer(target,null);
   transaction.dispose();this.scope=this.resources;
  }
 }
 sourceData(boat){
  const n=boat.points.length,width=Math.min(1024,n*2),height=Math.ceil(n*2/width),raw=new Float32Array(width*height*4),caps=[];
  const connects=i=>i>=0&&i+1<n&&boat.points[i+1][2]>boat.points[i][2]&&boat.points[i+1][2]-boat.points[i][2]<=TRACK_MAX_GAP;
  for(let i=0;i<n;i++){
   const point=boat.points[i],next=boat.points[i+1]||point,[x,y]=xy(point),stamp=point[2]-D.start;
   raw.set([x,y,stamp,boat.speeds[i]??-1,(next[0]-point[0])*1000/4.5,-(next[1]-point[1])*1180/3,next[2]-point[2],stamp-Math.fround(stamp)],i*8);
   const flags=connects(i)?(connects(i-1)?0:1)+(connects(i+1)?0:2):(connects(i-1)?0:3);
   if(flags&1)caps.push(i,-1);if(flags&2)caps.push(i,1);
  }
  return {input:this.texture(width,height,raw),caps};
 }
 capTexture(caps){
  const width=Math.max(1,Math.min(1024,caps.length/2)),height=Math.max(1,Math.ceil(caps.length/2/width)),data=new Int32Array(width*height*2);data.set(caps);
  return {texture:this.texture(width,height,data,true),bytes:data.byteLength};
 }
 record(geometry,knots,profile,caps,curvature,n){
  const cap=this.capTexture(caps),comparisonHeight=Math.max(1,Math.ceil((n+1)/1024));
  return {texture:geometry,knots,profile,capTexture:cap.texture,capCount:caps.length/2,curvature,
   comparisonTexture:this.texture(1024,comparisonHeight),comparisonWidth:1024,comparisonHeight,comparisonSamples:new Map(),
   bytes:this.padded(Math.max(4,n*4))+this.padded(Math.max(2,n*2))+cap.bytes+1024*comparisonHeight*16+1024*Math.ceil(this.stationCount/1024)*16};
 }
 prepareSource(boat){
  const gl=this.gl,n=boat.points.length,{input,caps}=this.sourceData(boat);
  const setSource=program=>{this.bind(program,'sourceData',input,5);this.uniform(program,'sourceCount',n);};
  const countBuffer=this.feedbackRun(this.counts,n,n*8,()=>setSource(this.counts)),counts=new Float32Array(n*2);
  gl.bindBuffer(gl.COPY_READ_BUFFER,countBuffer);gl.getBufferSubData(gl.COPY_READ_BUFFER,0,counts);gl.bindBuffer(gl.COPY_READ_BUFFER,null);this.scope.release(countBuffer);
  let count=0,curvature=0;
  for(let i=0;i<n;i++){
   if(!Number.isSafeInteger(counts[i*2])||counts[i*2]<0||!Number.isFinite(counts[i*2+1])||counts[i*2+1]<0)throw Error('Invalid GPU curve subdivision: '+boat.name);
   count+=counts[i*2]>0?counts[i*2]+1:0;curvature=Math.max(curvature,counts[i*2+1]);
  }
  if(count*2>1024*this.maxTextureSize)throw Error('Curve samples exceed the GPU texture limit: '+boat.name);
  const address=new Float32Array(count*2),divisions=new Float32Array(count);let at=0;
  for(let i=0;i<n;i++)for(let step=0;counts[i*2]>0&&step<=counts[i*2];step++){address[at*2]=i;address[at*2+1]=step;divisions[at++]=counts[i*2];}
  // Projection owns a separate VAO, so attribute bindings cannot retain temporary
  // dense-address buffers in the persistent procedural draw VAO after deletion.
  const projectionVao=this.scope.create('VertexArray');
  const setAddresses=(addresses,steps)=>{
   gl.bindVertexArray(projectionVao);
   for(const [index,values,size] of [[0,addresses,2],[1,steps,1]]){
    const buffer=this.scope.create('Buffer');gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,0,0);
   }
  };
  let knots;
  const setProjection=denseMode=>{
   setSource(this.projection);this.bind(this.projection,'routeData',this.route,6);this.uniform(this.projection,'legCount',this.legs.length);
   this.uniform(this.projection,'denseMode',denseMode?1:0);this.bind(this.projection,'knotData',denseMode?knots:input,7);
  };
  const knotAddress=new Float32Array(n*2);for(let i=0;i<n;i++)knotAddress[i*2]=i;
  const knotBuffer=this.feedbackRun(this.projection,n,this.padded(n*2),()=>{setProjection(false);setAddresses(knotAddress,new Float32Array(n).fill(1));});
  knots=this.fromBuffer(knotBuffer,n*2);this.scope.release(knotBuffer);
  const denseBuffer=this.feedbackRun(this.projection,count,this.padded(count*2),()=>{setProjection(true);setAddresses(address,divisions);});
  const dense=this.fromBuffer(denseBuffer,count*2);this.scope.release(denseBuffer);
  const blockCount=Math.ceil(count/64),boundBuffer=this.feedbackRun(this.bounds,blockCount,this.padded(Math.ceil(blockCount/2)),()=>{
   this.bind(this.bounds,'denseData',dense,5);this.uniform(this.bounds,'denseCount',count);
  });
  const bounds=this.fromBuffer(boundBuffer,Math.ceil(blockCount/2));this.scope.release(boundBuffer);
  const profile=this.texture(1024,Math.ceil(this.stationCount/1024));
  this.draw(this.profile,profile,1024,Math.ceil(this.stationCount/1024),()=>{
   this.bind(this.profile,'denseData',dense,5);this.bind(this.profile,'boundsData',bounds,6);
   this.uniform(this.profile,'denseCount',count);this.uniform(this.profile,'blockCount',blockCount);this.uniform(this.profile,'stationCount',this.stationCount);
  });
  this.scope.release(dense);this.scope.release(bounds);
  const geoBuffer=this.feedbackRun(this.geometry,n,this.padded(n*4),()=>setSource(this.geometry)),geometry=this.fromBuffer(geoBuffer,n*4);this.scope.release(geoBuffer);
  const record=this.record(geometry,knots,profile,caps,curvature,n);record.denseSamples=count;return record;
 }
 prepareEmpty(){
  const gl=this.gl,profile=this.texture(1024,Math.ceil(this.stationCount/1024));
  this.withTarget(profile,()=>gl.clearBufferfv(gl.COLOR,0,new Float32Array([-1e20,-1e20,0,0])));
  return this.record(this.texture(4,1),this.texture(2,1),profile,[],0,0);
 }
 compare(){
  const gl=this.gl,reference=referenceBoat(),referenceRecord=this.records.get(reference.points);
  for(const boat of boats){const record=this.records.get(boat.points);this.draw(this.comparison,record.comparisonTexture,1024,record.comparisonHeight,()=>{
   this.bind(this.comparison,'knotData',record.knots,5);this.bind(this.comparison,'referenceData',referenceRecord.profile,6);
   this.uniform(this.comparison,'pointCount',boat.points.length);this.uniform(this.comparison,'stationCount',this.stationCount);
   gl.uniform2f(gl.getUniformLocation(this.comparison,'handicaps'),boat.handicapSecondsPerNm||0,reference.handicapSecondsPerNm||0);
  });}
  this.check('GPU comparison');this.renderer.comparisonReference=reference.points;gl.activeTexture(gl.TEXTURE0);
 }
 readProfile(boat,record){
  const count=boat.points.length,stationCount=this.stationCount;
  const knots=count?this.read(record.knots,Math.min(1024,count*2),Math.ceil(count*2/Math.min(1024,count*2))):null;
  const reference=this.read(record.profile,1024,Math.ceil(stationCount/1024));
  const samples=new Float32Array((count+1)*3),timeSamples=new Float32Array((count+1)*2),stations=new Float32Array(stationCount),timeStations=new Float32Array(stationCount);
  for(let index=0;index<count;index++){
   const offset=index*8,station=knots[offset+6],progress=(knots[offset]+knots[offset+7])/1852,speed=knots[offset+1],time=knots[offset+2];
   const valid=station>=0&&station<stationCount,hasSpeed=valid&&speed> -1e19,hasTime=valid&&time>=0;
   samples.set([hasSpeed?station:-1,valid?progress:0,hasSpeed?speed:-1e20],index*3);timeSamples.set([hasTime?station:-1,hasTime?time:-1e20],index*2);
  }
  if(count){samples.set(samples.subarray((count-1)*3,count*3),count*3);timeSamples.set(timeSamples.subarray((count-1)*2,count*2),count*2);}
  else{samples.set([-1,0,-1e20]);timeSamples.set([-1,-1e20]);}
  for(let i=0;i<stationCount;i++){
   stations[i]=reference[i*4];timeStations[i]=reference[i*4+1];
   if(!Number.isFinite(stations[i])||!Number.isFinite(timeStations[i]))throw Error('Invalid GPU profile: '+boat.name);
  }
  return {samples,stations,timeSamples,timeStations};
 }
 comparisonValues(record,index,connects){
  const gl=this.gl,values=new Float32Array(connects?8:4);
  this.withTarget(record.comparisonTexture,()=>{
   for(let sample=0;sample<(connects?2:1);sample++){
    const at=index+sample;gl.readPixels(at%1024,Math.floor(at/1024),1,1,gl.RGBA,gl.FLOAT,values.subarray(sample*4,sample*4+4));
   }
  });this.check('Read comparison');return values;
 }
 async ready(){
  const gl=this.gl,sync=this.resources.own('Sync',gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0));gl.flush();
  try{
   for(;;){
    const status=gl.clientWaitSync(sync,0,0);
    if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)break;
    if(status===gl.WAIT_FAILED)throw Error('GPU preparation failed.');
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }finally{this.resources.release(sync);}
  this.check('Finish GPU preparation');
 }
 read(texture,width,height){
  const gl=this.gl,pixels=new Float32Array(width*height*4);
  this.withTarget(texture,()=>gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,pixels));return pixels;
 }
}
