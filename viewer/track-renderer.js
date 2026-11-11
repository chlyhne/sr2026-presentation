// The GPU evaluates the original Hermite cubics. Source intervals stay in static
// textures; playback changes time limits and instance ranges, not bindings.
class WebGLTrackRenderer {
 constructor(layer){
  this.layer=layer;this.buffers=new Map();this.uploads=0;this.active=false;
  this.host=el('foreignObject',{'data-webgl-tracks':'','pointer-events':'none'},layer);
  this.canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');
  this.canvas.style.cssText='display:block;width:100%;height:100%;pointer-events:none';
  this.host.append(this.canvas);
  this.canvas.addEventListener('webglcontextlost',e=>{
   e.preventDefault();this.fail(Error('WebGL-konteksten er mistet.'));
  });
  this.canvas.addEventListener('webglcontextrestored',()=>{
   this.buffers.clear();this.initialize();if(this.active){try{for(const boat of boats)this.prepare(boat);this.prepareComparison();requestRender();}catch(error){this.fail(error);}}
  });
  this.initialize();
 }
 initialize(){
  try{
   const gl=this.canvas.getContext('webgl2',{alpha:true,antialias:true,depth:true,premultipliedAlpha:true});
   if(!gl)throw Error('WebGL 2 unavailable');
   this.gl=gl;
   const debug=gl.getExtension('WEBGL_debug_renderer_info');
   this.renderer=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'';
   const shader=(type,source)=>{
    const result=gl.createShader(type);gl.shaderSource(result,source);gl.compileShader(result);
    if(!gl.getShaderParameter(result,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(result);gl.deleteShader(result);throw Error(message);}
    return result;
   };
   const vertex=shader(gl.VERTEX_SHADER,`#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec4 shape;
uniform highp sampler2D trackData;
uniform highp sampler2D comparisonData;
uniform int firstInstance;
uniform bool relativeMode;
uniform vec4 origin;
uniform mat2 screen;
uniform vec2 size;
uniform vec4 windowTime;
uniform float radius;
out float sourceU;
out vec2 strokeOffset;
flat out vec2 speeds;
flat out vec3 gainsStart;
flat out vec3 gainsEnd;
void main(){
 int sampleIndex=firstInstance+gl_InstanceID;
 int trackWidth=textureSize(trackData,0).x;
 int texel=sampleIndex*4;
 ivec2 address=ivec2(texel%trackWidth,texel/trackWidth);
 vec4 timing=texelFetch(trackData,address+ivec2(3,0),0);
 float duration=timing.y;
 float age=(timing.x-windowTime.y)+(timing.z-windowTime.w);
 float tail=windowTime.x;
 float from=duration>0.0?clamp((-tail-age)/duration,0.0,1.0):0.0;
 float to=duration>0.0?clamp(-age/duration,0.0,1.0):1.0;
 bool visible=duration>0.0?age+duration>-tail&&age<0.0:timing.w>0.0&&age>=-tail&&age<=0.0;
 // Adjacent cubics share an edge, not overlapping round caps. A newer start
 // cap would otherwise paint its dark rim across the preceding coloured body.
 bool startCap=mod(timing.w,2.0)>0.5||age<=-tail;
 bool endCap=timing.w>=2.0||age+duration>=0.0;
 if((shape.w<0.0&&!startCap)||(shape.w>0.0&&!endCap))visible=false;
 if(!visible){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
 vec4 position=texelFetch(trackData,address,0);
 vec4 curve=texelFetch(trackData,address+ivec2(1,0),0);
 vec4 ending=texelFetch(trackData,address+ivec2(2,0),0);
 float u=mix(from,to,shape.x),u2=u*u,u3=u2*u;
 vec2 delta=curve.xy,m0=curve.zw,m1=ending.xy;
 vec2 p=(position.xy-origin.xy)+(position.zw-origin.zw)
  +delta*(3.0*u2-2.0*u3)+m0*(u3-2.0*u2+u)+m1*(u3-u2);
 vec2 derivative=screen*(delta*(6.0*u-6.0*u2)+m0*(3.0*u2-4.0*u+1.0)+m1*(3.0*u2-2.0*u));
 if(length(derivative)<0.000001)derivative=screen*delta;
 vec2 tangent=length(derivative)>0.000001?normalize(derivative):vec2(1.0,0.0);
 vec2 normal=vec2(-tangent.y,tangent.x);
 vec2 pixel=screen*p+radius*(normal*shape.y+tangent*shape.z);
 // Time is interpolated by the rasterizer. Newer samples have smaller depth.
 // Keeping depth in gl_Position allows early depth rejection on the GPU.
 float depth=0.1-0.8*(age+duration*u)/tail;
 gl_Position=vec4(pixel.x*2.0/size.x-1.0,1.0-pixel.y*2.0/size.y,depth*2.0-1.0,1.0);
 sourceU=u;speeds=ending.zw;strokeOffset=shape.yz;
 gainsStart=vec3(-1e20);gainsEnd=vec3(-1e20);
 if(relativeMode){
  int comparisonWidth=textureSize(comparisonData,0).x;
  gainsStart=texelFetch(comparisonData,ivec2(sampleIndex%comparisonWidth,sampleIndex/comparisonWidth),0).rgb;
  int nextIndex=sampleIndex+1;
  gainsEnd=texelFetch(comparisonData,ivec2(nextIndex%comparisonWidth,nextIndex/comparisonWidth),0).rgb;
 }
}`);
   const fragment=shader(gl.FRAGMENT_SHADER,`#version 300 es
precision highp float;
in float sourceU;
in vec2 strokeOffset;
flat in vec2 speeds;
flat in vec3 gainsStart;
flat in vec3 gainsEnd;
uniform sampler2D palette;
uniform float innerRatio;
uniform bool relativeMode;
uniform bool boatColourMode;
uniform vec3 boatColour;
uniform float opacity;
uniform int gainComponent;
uniform float gainLimit;
out vec4 colour;
void main(){
 vec2 values=relativeMode?vec2(gainsStart[gainComponent],gainsEnd[gainComponent]):speeds;
 bool missing=relativeMode?(values.x<-1e19||values.y<-1e19):(values.x<0.0||values.y<0.0);
 float value=mix(values.x,values.y,sourceU);
 float fraction=relativeMode?(clamp(value,-gainLimit,gainLimit)+gainLimit)/(2.0*gainLimit):clamp(value,0.0,15.0)/15.0;
 int bin=missing?0:1+int(floor(fraction*127.0+0.5));
 if(!missing&&relativeMode){
  if(value < -gainLimit)bin=${TRACK_SPEED_BINS+1};
  else if(value > gainLimit)bin=${TRACK_SPEED_BINS+2};
 }
 float distance=length(strokeOffset);
 float feather=max(fwidth(distance)*0.5,0.000001);
 float outline=smoothstep(innerRatio-feather,innerRatio+feather,distance);
 colour=mix(boatColourMode?vec4(boatColour,1.0):texelFetch(palette,ivec2(bin,0),0),vec4(23.0/255.0,49.0/255.0,62.0/255.0,1.0),outline);
 colour*=opacity;
}`);
   this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);
   gl.deleteShader(vertex);gl.deleteShader(fragment);
   if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
   this.uniforms=Object.fromEntries(['origin','screen','size','windowTime','radius','palette','innerRatio','relativeMode','boatColourMode','boatColour','opacity','gainComponent','gainLimit','trackData','comparisonData','firstInstance'].map(name=>[name,gl.getUniformLocation(this.program,name)]));
   this.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
   if(!window.SR_RHUMBLINE_SETUP&&rhumbRoute.legs.length){
    const evaluationVertex=shader(gl.VERTEX_SHADER,`#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 projected;
layout(location=1) in vec2 projectedTime;
uniform highp sampler2D referenceProfile;
uniform int stationCount;
uniform vec2 handicaps;
out vec3 evaluatedGains;
void main(){
 evaluatedGains=vec3(-1e20);
 gl_Position=vec4(0.0,0.0,0.0,1.0);
 if(projectedTime.x>=0.0&&projectedTime.x<float(stationCount)){
  int index=int(projectedTime.x);
  float referenceTime=texelFetch(referenceProfile,ivec2(index%1024,index/1024),0).g;
  if(projectedTime.y>=0.0&&referenceTime>=0.0&&!(projectedTime.y>=${TRACK_TIME_OVERFLOW}.0&&referenceTime>=${TRACK_TIME_OVERFLOW}.0))
   evaluatedGains.z=100.0*(referenceTime-projectedTime.y);
 }
 if(projected.z>=-1e19&&projected.x>=0.0&&projected.x<float(stationCount)){
  int index=int(projected.x);
  float referenceSpeed=texelFetch(referenceProfile,ivec2(index%1024,index/1024),0).r;
  if(referenceSpeed>=0.0){
   evaluatedGains.x=projected.z-referenceSpeed;
   float factor=1.0+(handicaps.y-handicaps.x)*projected.z/3600.0;
   if(handicaps.x>0.0&&handicaps.y>0.0&&factor>0.0)evaluatedGains.y=projected.z/factor-referenceSpeed;
  }
 }
}`);
    const evaluationFragment=shader(gl.FRAGMENT_SHADER,`#version 300 es
precision highp float;
out vec4 colour;
void main(){colour=vec4(0.0);}`);
    this.comparisonProgram=gl.createProgram();
    gl.attachShader(this.comparisonProgram,evaluationVertex);gl.attachShader(this.comparisonProgram,evaluationFragment);
    gl.transformFeedbackVaryings(this.comparisonProgram,['evaluatedGains'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(this.comparisonProgram);
    gl.deleteShader(evaluationVertex);gl.deleteShader(evaluationFragment);
    if(!gl.getProgramParameter(this.comparisonProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.comparisonProgram));
    this.comparisonUniforms=Object.fromEntries(['referenceProfile','stationCount','handicaps'].map(name=>[name,gl.getUniformLocation(this.comparisonProgram,name)]));
    this.referenceTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.referenceTexture);
    this.referenceHeight=Math.max(1,Math.ceil(maxReferenceStations/1024));
    this.referenceUpload=new Float32Array(1024*this.referenceHeight*2);
    gl.texStorage2D(gl.TEXTURE_2D,1,gl.RG32F,1024,this.referenceHeight);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    this.feedback=gl.createTransformFeedback();this.comparisonReference=null;
   }
   // Fixed mesh used for every interval. shape.w marks optional outer caps.
   // Subdivision evaluates the cubic without discarding source points.
   const mesh=[];
   const put=(u,n,t,cap=0)=>mesh.push(u,n,t,cap);
   const steps=32;
   for(let i=0;i<steps;i++){
    const a=i/steps,b=(i+1)/steps;
    put(a,-1,0);put(a,1,0);put(b,-1,0);
    put(b,-1,0);put(a,1,0);put(b,1,0);
   }
   for(const u of [0,1])for(let i=0;i<12;i++){
    const a=-Math.PI/2+i*Math.PI/12,b=-Math.PI/2+(i+1)*Math.PI/12;
    const cap=u?1:-1;
    put(u,0,0,cap);put(u,Math.sin(a),cap*Math.cos(a),cap);put(u,Math.sin(b),cap*Math.cos(b),cap);
   }
   this.vertexCount=mesh.length/4;
   this.mesh=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.mesh);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh),gl.STATIC_DRAW);
   this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
   gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,16,0);
   gl.bindVertexArray(null);
   for(const [name,scale] of [['palette',TRACK_SPEED_COLOURS],['gainPalette',TRACK_GAIN_COLOURS]]){
    this[name]=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this[name]);
    const colours=[TRACK_SPEED_MISSING,...scale,...(name==='gainPalette'?[TRACK_GAIN_UNDERFLOW_COLOUR,TRACK_GAIN_OVERFLOW_COLOUR]:[])],pixels=new Uint8Array(colours.length*4);
    colours.forEach((c,i)=>{
     const rgb=c[0]==='#'?[1,3,5].map(offset=>parseInt(c.slice(offset,offset+2),16)):c.match(/\d+/g).map(Number);
     pixels.set([...rgb,255],i*4);
    });
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,colours.length,1,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   }
   this.boatColours=new Map();
   const colourProbe=document.createElement('span');colourProbe.hidden=true;document.body.append(colourProbe);
   try{
    for(const colour of new Set(Object.values(colours))){
     colourProbe.style.color=colour;
     const rgb=getComputedStyle(colourProbe).color.match(/[\d.]+/g).slice(0,3).map(Number);
     this.boatColours.set(colour,new Float32Array(rgb.map(channel=>channel/255)));
    }
   }finally{colourProbe.remove();}
   this.active=true;this.host.removeAttribute('display');this.lastKey=null;this.viewportKey=null;
   clearRenderingFailure('Spor');
  }catch(error){
   this.fail(error);
  }
 }
 fail(error){
  this.active=false;this.error=error.message;this.host.setAttribute('display','none');
  reportRenderingFailure('Spor',error);
 }
 prepare(boat){
  if(!this.active||this.buffers.has(boat.points))return;
  const gl=this.gl,{points,speeds}=boat,model=getTrackModel(points);
  const connects=(a,b)=>!!a&&!!b&&b[2]>a[2]&&b[2]-a[2]<=TRACK_MAX_GAP;
  // One compact record per observation, not per colour fragment or frame.
  const width=Math.min(1024,Math.max(4,points.length*4)),height=Math.max(1,Math.ceil(points.length*4/width));
  if(height>this.maxTextureSize)throw Error('Bådens spor overstiger GPU-teksturens maksimale størrelse: '+boat.name);
  const data=new Float32Array(width*height*4);
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[i+1],valid=connects(a,b),previous=connects(points[i-1],a);
   const dt=valid?b[2]-a[2]:0,[x,y]=xy(a),hiX=Math.fround(x),hiY=Math.fround(y),offset=i*16;
   data[offset]=hiX;data[offset+1]=hiY;data[offset+2]=x-hiX;data[offset+3]=y-hiY;
   if(valid){
    data[offset+4]=(b[0]-a[0])*1000/4.5;data[offset+5]=-(b[1]-a[1])*1180/3;
    data[offset+6]=model.slopes[0][i]*dt*1000/4.5;data[offset+7]=-model.slopes[1][i]*dt*1180/3;
    data[offset+8]=model.slopes[0][i+1]*dt*1000/4.5;data[offset+9]=-model.slopes[1][i+1]*dt*1180/3;
   }
   const s0=speeds?.[i],s1=valid?speeds?.[i+1]:s0;
   data[offset+10]=Number.isFinite(s0)&&s0>=0?s0:-1;data[offset+11]=Number.isFinite(s1)&&s1>=0?s1:-1;
   const stamp=a[2]-D.start,high=Math.fround(stamp);
   data[offset+12]=high;data[offset+13]=dt;data[offset+14]=stamp-high;
   // Reuse the spare float: bits 1/2 mark real start/end caps. An endpoint
   // already covered by its preceding cubic must not draw a duplicate dot.
   data[offset+15]=valid?(previous?0:1)+(connects(b,points[i+2])?0:2):previous?0:3;
  }
  const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,width,height);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.FLOAT,data);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  const record={texture,bytes:data.byteLength};
  if(this.comparisonProgram){
   const profile=trackProfileCache.get(points);if(!profile)throw Error('Bådens sporprofil er ikke forberedt: '+boat.name);
   record.projectedBuffer=gl.createBuffer();record.comparisonBuffer=gl.createBuffer();
   record.comparisonWidth=Math.min(1024,points.length+1);record.comparisonHeight=Math.ceil((points.length+1)/record.comparisonWidth);
   if(record.comparisonHeight>this.maxTextureSize)throw Error('Bådens sammenligningsspor overstiger GPU-teksturens maksimale størrelse: '+boat.name);
   record.comparisonTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,record.comparisonTexture);
   gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGB32F,record.comparisonWidth,record.comparisonHeight);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   record.comparisonSamples=new Map();
   record.comparisonVao=gl.createVertexArray();gl.bindVertexArray(record.comparisonVao);
   gl.bindBuffer(gl.ARRAY_BUFFER,record.projectedBuffer);gl.bufferData(gl.ARRAY_BUFFER,profile.samples,gl.STATIC_DRAW);
   gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);
   record.timeBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,record.timeBuffer);
   const timeValues=Float32Array.from(profile.timeSamples,value=>Math.min(value,TRACK_TIME_OVERFLOW));
   gl.bufferData(gl.ARRAY_BUFFER,timeValues,gl.STATIC_DRAW);
   gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,8,0);
   const comparisonBytes=record.comparisonWidth*record.comparisonHeight*12;
   gl.bindBuffer(gl.ARRAY_BUFFER,record.comparisonBuffer);gl.bufferData(gl.ARRAY_BUFFER,comparisonBytes,gl.DYNAMIC_COPY);
   record.bytes+=profile.samples.byteLength+timeValues.byteLength+comparisonBytes*2;
  }
  gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);
  const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Bådens faste GPU-spordata kunne ikke klargøres: '+boat.name+' ('+error+').');
  this.buffers.set(points,record);this.uploads++;
 }
 prepareComparison(){
  if(!this.active||!this.comparisonProgram)return;
  const reference=referenceBoat();if(!reference)throw Error('Referencebåden findes ikke.');
  if(this.comparisonReference===reference.points)return;
  const profile=trackProfileCache.get(reference.points);if(!profile)throw Error('Referencebådens sporprofil er ikke forberedt.');
  const gl=this.gl,u=this.comparisonUniforms;
  if(profile.stations.length*2>this.referenceUpload.length)throw Error('Referenceprofilen overstiger den forberedte GPU-tekstur.');
  this.referenceUpload.fill(-1e20);
  for(let index=0;index<profile.stations.length;index++){
   const value=profile.stations[index];
   this.referenceUpload[index*2]=value===REFERENCE_MISSING?-1e20:value/REFERENCE_SPEED_SCALE;
   this.referenceUpload[index*2+1]=Math.min(profile.timeStations[index],TRACK_TIME_OVERFLOW);
  }
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.referenceTexture);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,1024,this.referenceHeight,gl.RG,gl.FLOAT,this.referenceUpload);
  gl.useProgram(this.comparisonProgram);gl.uniform1i(u.referenceProfile,1);gl.uniform1i(u.stationCount,profile.stations.length);
  gl.bindBuffer(gl.ARRAY_BUFFER,null);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,this.feedback);gl.enable(gl.RASTERIZER_DISCARD);
  try{
   for(const boat of boats){
    const record=this.buffers.get(boat.points);if(!record?.comparisonBuffer)throw Error('Sporenes farvebuffer er ikke forberedt.');
    gl.bindVertexArray(record.comparisonVao);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,record.comparisonBuffer);
    gl.uniform2f(u.handicaps,boat.handicapSecondsPerNm||0,reference.handicapSecondsPerNm||0);
    gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,boat.points.length+1);gl.endTransformFeedback();
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,record.comparisonBuffer);
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,record.comparisonTexture);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,record.comparisonWidth,record.comparisonHeight,gl.RGB,gl.FLOAT,0);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,null);
    record.comparisonSamples.clear();
   }
  }finally{
   gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);
   gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,null);gl.disable(gl.RASTERIZER_DISCARD);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);
  }
  const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Referencebådens sporfarver kunne ikke klargøres i WebGL ('+error+').');
  this.comparisonReference=reference.points;
 }
 comparisonSample(boat,time){
  try{
   const record=this.buffers.get(boat.points);
   if(!this.active||!record?.comparisonBuffer||this.comparisonReference!==referenceBoat()?.points)throw Error('Sammenligningsdata er ikke forberedt.');
   const index=timeBoundary(boat.points,time,true)-1;if(index<0)return null;
   const a=boat.points[index],b=boat.points[index+1];
   const connects=b&&b[2]>a[2]&&b[2]-a[2]<=TRACK_MAX_GAP;
   if(time!==a[2]&&(!connects||time>b[2]))return null;
   // Read the nominal, already prepared colour values once per source interval.
   // A style change only selects a component; it never recalculates comparisons.
   let values=record.comparisonSamples.get(index);
   if(!values){
    values=new Float32Array(connects?6:3);
    const gl=this.gl;gl.bindBuffer(gl.COPY_READ_BUFFER,record.comparisonBuffer);
    gl.getBufferSubData(gl.COPY_READ_BUFFER,index*12,values);gl.bindBuffer(gl.COPY_READ_BUFFER,null);
    const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Sammenligningsdata kunne ikke læses fra WebGL ('+error+').');
    record.comparisonSamples.set(index,values);
   }
   const fraction=connects?(time-a[2])/(b[2]-a[2]):0;
   return Object.fromEntries(['absoluteGain','handicapGain','timeGain'].map((name,component)=>{
    const start=values[component],end=values[component+(connects?3:0)];
    return [name,start<-1e19||end<-1e19?null:start+(end-start)*fraction];
   }));
  }catch(error){
   this.fail(error);throw error;
  }
 }
 render(time,order,force=false){
  this.time=time;this.order=order;
  if(!this.active)return false;
  try{
   if(this.gl.isContextLost())throw Error('WebGL-konteksten er mistet.');
   const baseViewport=mapViewport();if(!baseViewport)return true;
   const viewport={...baseViewport,pixelWidth:baseViewport.pixelWidth*2,pixelHeight:baseViewport.pixelHeight*2};
   const {rect,matrix,topLeft:top,pixelWidth:width,pixelHeight:height}=viewport;
   const viewportKey=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f,rect.left,rect.top,rect.width,rect.height,width,height].join(':');
   const key=[time,viewportKey,trackLengthSeconds,handicapTracksEnabled,comparison.enabled,comparison.basis,comparison.boatColour,comparisonRevision,...order.map(b=>b.id)].join(':');
   if(!force&&this.lastKey===key)return true;
   this.lastKey=key;
   const gl=this.gl,u=this.uniforms;
   gl.useProgram(this.program);
   if(this.viewportKey!==viewportKey){
    // Lay out the embedded HTML in screen pixels. A foreignObject positioned
    // at fractional map coordinates is rounded by the browser's canvas
    // compositor before SVG zoom, shifting the bitmap by many screen pixels.
    // Cancel the map transform here; the shader still uses the shared map camera.
    positionMapCanvas(this.host,this.canvas,viewport);
    gl.uniform4f(u.origin,Math.fround(top.x),Math.fround(top.y),top.x-Math.fround(top.x),top.y-Math.fround(top.y));
    gl.uniformMatrix2fv(u.screen,false,new Float32Array([matrix.a,matrix.b,matrix.c,matrix.d]));
    gl.uniform2f(u.size,rect.width,rect.height);this.viewportKey=viewportKey;
   }
   gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.useProgram(this.program);
   gl.uniform1f(u.radius,TRACK_OUTLINE_WIDTH/2);
   gl.uniform1f(u.innerRatio,TRACK_STROKE_WIDTH/TRACK_OUTLINE_WIDTH);
   const boatColourMode=trackUsesBoatColour();
   const comparisonReference=trackUsesComparison()?referenceBoat():null;
   // The faint reference is a guide underneath the other boats' comparison tracks.
   const drawOrder=comparisonReference?[...order.filter(b=>b.id===comparisonReference.id),...order.filter(b=>b.id!==comparisonReference.id)]:order;
   gl.uniform1i(u.gainComponent,comparison.basis==='time'?2:comparison.basis==='handicap'?1:0);
   gl.uniform1f(u.gainLimit,trackGainLimit());
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.palette);gl.uniform1i(u.palette,0);
   gl.uniform1i(u.trackData,2);gl.uniform1i(u.comparisonData,3);
   for(const boat of drawOrder){
    const window=displayTrackWindow(boat,time);if(!window)continue;
    const points=boat.points,first=Math.max(0,timeBoundary(points,window.from)-1),last=timeBoundary(points,window.to,true);
    if(last<=first)continue;
    const stamp=window.to-D.start,high=Math.fround(stamp);
    gl.uniform4f(u.windowTime,Math.max(1e-6,window.to-window.from),high,0,stamp-high);
    this.prepare(boat);const record=this.buffers.get(points);
    gl.bindVertexArray(this.vao);
    const isReference=boat.id===comparisonReference?.id,solidColour=boatColourMode||isReference;
    gl.uniform1i(u.boatColourMode,solidColour?1:0);
    gl.uniform1f(u.opacity,isReference?0.18:1);
    if(solidColour){
     const colour=this.boatColours.get(colours[boat.name]);
     if(!colour)throw Error('Bådens sporfarve er ikke forberedt: '+boat.name);
     gl.uniform3fv(u.boatColour,colour);
    }
    const relative=!!comparisonReference&&!isReference;
    if(relative&&!record.comparisonTexture)throw Error('Sammenligningsdata er ikke forberedt.');
    gl.uniform1i(u.relativeMode,relative?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,relative?this.gainPalette:this.palette);
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,record.texture);
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,relative?record.comparisonTexture:record.texture);
    gl.uniform1i(u.firstInstance,first);
    gl.drawArraysInstanced(gl.TRIANGLES,0,this.vertexCount,last-first);
    // Preserve the reference's newest passage internally, then let every other
    // boat cover it, including older passages. Pixels use premultiplied alpha.
    if(isReference)gl.clear(gl.DEPTH_BUFFER_BIT);
   }
   gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.flush();
   return true;
  }catch(error){this.fail(error);return false;}
 }
 redraw(){if(this.order)this.render(this.time,this.order);}
}
const webglTracks=new WebGLTrackRenderer($('routes'));
