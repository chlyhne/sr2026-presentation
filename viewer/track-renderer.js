// One direct GPU path. Source cubics, comparison values and real cap addresses
// are immutable textures. Camera/time/style change uniforms, never raster atlases.
const TRACK_CURVE_ERROR_PX=.125;
class WebGLTrackRenderer {
 constructor(layer){
  this.layer=layer;this.buffers=new Map();this.uploads=0;this.active=false;
  this.host=document.createElement('div');this.host.dataset.webglTracks='';
  $('mapSurface').insertBefore(this.host,$('map'));
  this.canvas=document.createElement('canvas');
  this.canvas.style.cssText='display:block;width:100%;height:100%;pointer-events:none';
  this.host.append(this.canvas);
  this.canvas.addEventListener('webglcontextlost',e=>{
   e.preventDefault();const detail=this.preparation;
   const message=` Trin: ${this.phase||'initialisering'}. Grafikbuffer: ${this.canvas.width} × ${this.canvas.height}.`+
    (detail?.currentBoat?` Seneste klargøring: ${detail.currentBoat}, ${detail.stage}. ${this.buffers.size} både klargjort.`:'');
   this.preparation?.dispose();this.fail(Error('WebGL-konteksten er mistet.'+message));
  });
  this.canvas.addEventListener('webglcontextrestored',async()=>{
   this.restoring=true;this.buffers.clear();this.initialize();
   try{if(this.active){await prepareFleetTracks();this.restoring=false;this.prepareComparison();requestRender();}}catch(error){this.restoring=false;this.fail(error);}
  });
  this.initialize();
 }
 initialize(){
  this.phase='Initialisér sporenes WebGL';
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
uniform highp sampler2D trackData;
uniform highp sampler2D comparisonData;
uniform highp isampler2D capData;
uniform int firstInstance;
uniform bool relativeMode;
uniform int subdivisions;
uniform int capMode;
uniform int sourceCaps;
uniform ivec2 boundarySamples;
uniform vec4 origin;
uniform mat2 screen;
uniform vec2 size;
uniform vec4 windowTime;
uniform float radius;
out float sourceU;
out vec2 strokeOffset;
// These values are identical at every vertex of the instance. Ordinary
// interpolation preserves them without Apple's flat/provoking-vertex path
// (WebKit bug 286297), which can lose the context on draw or subsequent reload.
out vec2 speeds;
out vec3 gainsStart;
out vec3 gainsEnd;
void main(){
 int sampleIndex=firstInstance+gl_InstanceID;
 vec4 shape;
 bool sourceCap=false;
 if(capMode==0){
  int step=gl_VertexID/6,corner=gl_VertexID%6;
  float u=float(step+(corner==2||corner==3||corner==5?1:0))/float(subdivisions);
  shape=vec4(u,corner==0||corner==2||corner==3?-1.0:1.0,0.0,0.0);
 }else{
  sourceCap=gl_InstanceID<sourceCaps;
  int kind;
  if(sourceCap){
   int address=gl_InstanceID,width=textureSize(capData,0).x;
   ivec2 cap=texelFetch(capData,ivec2(address%width,address/width),0).rg;
   sampleIndex=cap.x;kind=cap.y;
  }else{
   int boundary=gl_InstanceID-sourceCaps;
   sampleIndex=boundary==0?boundarySamples.x:boundarySamples.y;kind=boundary==0?-1:1;
  }
  int triangle=gl_VertexID/3,corner=gl_VertexID%3;
  float angle=-1.57079632679+float(triangle+(corner==2?1:0))*3.14159265359/12.0;
  shape=vec4(kind<0?0.0:1.0,corner==0?0.0:sin(angle),corner==0?0.0:float(kind)*cos(angle),float(kind));
 }
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
 bool startCap=mod(timing.w,2.0)>0.5,endCap=timing.w>=2.0;
 if(capMode!=0){
  if(sourceCap)visible=visible&&(shape.w<0.0?(startCap&&from==0.0):(endCap&&to==1.0));
  else visible=visible&&duration>0.0&&(shape.w<0.0
   ?(age<=-tail&&!(startCap&&from==0.0)):(age+duration>=0.0&&!(endCap&&to==1.0)));
 }
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
in vec2 speeds;
in vec3 gainsStart;
in vec3 gainsEnd;
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
   this.uniforms=Object.fromEntries(['origin','screen','size','windowTime','radius','palette','innerRatio','relativeMode','boatColourMode','boatColour','opacity','gainComponent','gainLimit','trackData','comparisonData','firstInstance','subdivisions','capMode','capData','sourceCaps','boundarySamples'].map(name=>[name,gl.getUniformLocation(this.program,name)]));
   this.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
   // Procedural vertices require no mesh buffer or changing attribute bindings.
   this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
   gl.bindVertexArray(null);
   this.initializePalettes();
   this.initializeBoatColours();
   this.comparisonReference=null;this.preparation=new GPUTrackPreparation(this);
   this.stats={frames:0,draws:0,vertices:0,intervals:0,caps:0};
   this.active=true;this.host.hidden=false;this.lastKey=null;this.viewportKey=null;this.sceneKey=null;
   clearRenderingFailure('Spor');
  }catch(error){
   this.fail(error);
  }
 }
 initializePalettes(){
  const gl=this.gl;
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
 }
 initializeBoatColours(){
   this.boatColours=new Map();
   const colourProbe=document.createElement('span');colourProbe.hidden=true;document.body.append(colourProbe);
   try{
    for(const colour of new Set(Object.values(colours))){
     colourProbe.style.color=colour;
     const rgb=getComputedStyle(colourProbe).color.match(/[\d.]+/g).slice(0,3).map(Number);
     this.boatColours.set(colour,new Float32Array(rgb.map(channel=>channel/255)));
    }
   }finally{colourProbe.remove();}
 }
 fail(error){
  this.active=false;this.error=error.message;this.host.hidden=true;
  reportRenderingFailure('Spor',error);
 }
 prepare(boat){
  if(!this.active)throw Error(this.error||'WebGL is unavailable.');
  this.phase='Klargør båd: '+boat.name;
  if(!this.buffers.has(boat.points))this.preparation.prepare(boat);
 }
 requirePrepared(boat){
  if(!this.restoring&&!this.buffers.has(boat.points))throw Error('Bådens GPU-spor er ikke forberedt: '+boat.name);
 }
 prepareComparison(){
  if(!this.active||this.restoring)return;
  const reference=referenceBoat();
  if(!reference)throw Error('Referencebåden findes ikke.');
  if(this.comparisonReference===reference.points)return;
  this.phase='Beregn sammenligninger for hele feltet';
  this.preparation.compare();
  for(const record of this.buffers.values())record.comparisonSamples.clear();
  this.comparisonReference=reference.points;this.lastKey=null;
 }
 comparisonSample(boat,time){
  try{
   const record=this.buffers.get(boat.points);
   if(!this.active||!record||this.comparisonReference!==referenceBoat()?.points)throw Error('Sammenligningsdata er ikke forberedt.');
   const index=timeBoundary(boat.points,time,true)-1;if(index<0)return null;
   const a=boat.points[index],b=boat.points[index+1],connects=b&&b[2]>a[2]&&b[2]-a[2]<=TRACK_MAX_GAP;
   if(time!==a[2]&&(!connects||time>b[2]))return null;
   let values=record.comparisonSamples.get(index);
   if(!values){values=this.preparation.comparisonValues(record,index,connects);record.comparisonSamples.set(index,values);}
   const fraction=connects?(time-a[2])/(b[2]-a[2]):0;
   return Object.fromEntries(['absoluteGain','handicapGain','timeGain'].map((name,component)=>{
    const start=values[component],end=values[component+(connects?4:0)];
    return [name,start<-1e19||end<-1e19?null:start+(end-start)*fraction];
   }));
  }catch(error){this.fail(error);throw error;}
 }
 subdivisions(record,viewport){
  const m=viewport.matrix,scale=Math.hypot(m.a,m.b,m.c,m.d);
  return Math.max(1,Math.ceil(Math.sqrt(record.curvature*scale/(8*TRACK_CURVE_ERROR_PX))));
 }
 begin(viewport){
  const gl=this.gl,u=this.uniforms,{matrix,topLeft:top,rect}=viewport;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
  gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  gl.uniform4f(u.origin,Math.fround(top.x),Math.fround(top.y),top.x-Math.fround(top.x),top.y-Math.fround(top.y));
  gl.uniformMatrix2fv(u.screen,false,new Float32Array([matrix.a,matrix.b,matrix.c,matrix.d]));gl.uniform2f(u.size,rect.width,rect.height);
  gl.uniform1f(u.radius,TRACK_OUTLINE_WIDTH/2);gl.uniform1f(u.innerRatio,TRACK_STROKE_WIDTH/TRACK_OUTLINE_WIDTH);
  gl.uniform1i(u.gainComponent,comparison.basis==='time'?2:comparison.basis==='handicap'?1:0);gl.uniform1f(u.gainLimit,trackGainLimit());
  gl.uniform1i(u.palette,0);gl.uniform1i(u.trackData,2);gl.uniform1i(u.comparisonData,3);gl.uniform1i(u.capData,4);
 }
 drawRange(state,viewport){
  const gl=this.gl,u=this.uniforms,{boat,record,window,first,last,boundaryFirst,isReference,relative,solidColour}=state;
  const stamp=window.to-D.start,high=Math.fround(stamp),subdivisions=this.subdivisions(record,viewport);
  gl.uniform4f(u.windowTime,Math.max(1e-6,window.to-window.from),high,0,stamp-high);
  gl.uniform1i(u.boatColourMode,solidColour?1:0);gl.uniform1f(u.opacity,isReference?0.18:1);
  if(solidColour){
   const colour=this.boatColours.get(colours[boat.name]);
   if(!colour)throw Error('Bådens sporfarve er ikke forberedt: '+boat.name);
   gl.uniform3fv(u.boatColour,colour);
  }
  if(relative&&!record.comparisonTexture)throw Error('Sammenligningsdata er ikke forberedt.');
  gl.uniform1i(u.relativeMode,relative?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,relative?this.gainPalette:this.palette);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,record.texture);
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,relative?record.comparisonTexture:record.texture);
  gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,record.capTexture);
  gl.uniform1i(u.firstInstance,first);gl.uniform1i(u.subdivisions,subdivisions);gl.uniform1i(u.capMode,0);
  gl.drawArraysInstanced(gl.TRIANGLES,0,subdivisions*6,last-first);
  gl.uniform2i(u.boundarySamples,boundaryFirst,last-1);gl.uniform1i(u.sourceCaps,record.capCount);gl.uniform1i(u.capMode,1);
  gl.drawArraysInstanced(gl.TRIANGLES,0,36,record.capCount+2);
  this.stats.draws+=2;this.stats.intervals+=last-first;this.stats.caps+=record.capCount+2;
  this.stats.vertices+=subdivisions*6*(last-first)+36*(record.capCount+2);
 }
 render(time,order,force=false){
  this.time=time;this.order=order;
  if(!this.active)return false;
  if(this.restoring)return true;
  try{
   if(this.gl.isContextLost())throw Error('WebGL-konteksten er mistet.');
   const baseViewport=mapViewport();if(!baseViewport)return true;
   const viewport={...baseViewport,...mapCanvasResolution(baseViewport.rect,2*(devicePixelRatio||1))};
   const {rect,matrix,pixelWidth:width,pixelHeight:height}=viewport;
   const viewportKey=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f,rect.left,rect.top,rect.width,rect.height,width,height].join(':');
   const sceneKey=[time,trackLengthSeconds,handicapTracksEnabled,comparison.enabled,comparison.basis,comparison.boatColour,comparisonRevision,referenceBoatId,...order.map(b=>b.id)].join(':');
   const sceneChanged=force||this.sceneKey!==sceneKey||order.some((boat,i)=>this.scenePoints?.[i]!==boat.points);
   const key=sceneKey+':'+viewportKey;
   if(!sceneChanged&&this.lastKey===key)return true;
   this.lastKey=key;
   if(this.viewportKey!==viewportKey){
    // Resize only the drawing buffer; HTML composition fixes its screen bounds.
    this.phase=`Tilpas sporenes grafikbuffer til ${width} × ${height}`;
    positionMapCanvas(this.canvas,viewport);
    this.viewportKey=viewportKey;
   }
   if(sceneChanged){
    this.sceneKey=sceneKey;this.scenePoints=order.map(boat=>boat.points);this.states=[];
    const boatColourMode=trackUsesBoatColour(),comparisonReference=trackUsesComparison()?referenceBoat():null;
    // The faint reference is a guide underneath the comparison tracks.
    const drawOrder=comparisonReference?[...order.filter(b=>b.id===comparisonReference.id),...order.filter(b=>b.id!==comparisonReference.id)]:order;
    for(const boat of drawOrder){
     const window=displayTrackWindow(boat,time);if(!window)continue;
     const points=boat.points,first=Math.max(0,timeBoundary(points,window.from)-1),last=timeBoundary(points,window.to,true);
     if(last<=first)continue;
     this.requirePrepared(boat);const record=this.buffers.get(points);
     const boundaryFirst=Math.max(0,Math.min(points.length-1,timeBoundary(points,window.from,true)-1));
     const isReference=boat.id===comparisonReference?.id,solidColour=boatColourMode||isReference,relative=!!comparisonReference&&!isReference;
     this.states.push({boat,record,window,first,last,boundaryFirst,isReference,solidColour,relative});
    }
   }
   this.phase='Tegn spor';this.begin(viewport);this.stats.frames++;
   let referenceDrawn=false;
   for(const state of this.states){
    if(referenceDrawn&&!state.isReference){this.gl.clear(this.gl.DEPTH_BUFFER_BIT);referenceDrawn=false;}
    this.drawRange(state,viewport);
    if(state.isReference)referenceDrawn=true;
   }
   this.gl.bindVertexArray(null);this.gl.activeTexture(this.gl.TEXTURE0);
   this.phase=`Sportegning sendt til GPU (${this.states.length} både)`;
   return true;
  }catch(error){this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null);this.gl.disable(this.gl.SCISSOR_TEST);this.fail(error);return false;}
 }
 redraw(){if(this.order)this.render(this.time,this.order);}
}
// iPhone retains only a 32-byte line record per point. No GPU profiles,
// comparison textures, curves or caps are allocated in this mode.
// Each connected pair is one constant-width rectangle (two triangles).
class SimpleIPhoneTrackRenderer extends WebGLTrackRenderer {
 initialize(){
  this.phase='Initialisér enkle iPhone-spor';
  try{
   const gl=this.canvas.getContext('webgl2',{alpha:true,antialias:true,depth:true,premultipliedAlpha:true});
   if(!gl)throw Error('WebGL 2 unavailable');
   this.gl=gl;
   const shader=(type,source)=>{
    const result=gl.createShader(type);gl.shaderSource(result,source);gl.compileShader(result);
    if(!gl.getShaderParameter(result,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(result);gl.deleteShader(result);throw Error(message);}
    return result;
   };
   const vertex=shader(gl.VERTEX_SHADER,`#version 300 es
precision highp float;
layout(location=0) in vec2 start;
layout(location=1) in vec2 delta;
layout(location=2) in vec4 timing;
uniform vec4 origin;
uniform mat2 screen;
uniform vec2 size;
uniform vec4 windowTime;
uniform float radius;
void main(){
 float age=(timing.x-windowTime.y)+(timing.z-windowTime.w),duration=timing.y,tail=windowTime.x;
 if(timing.w==0.0||(duration>0.0?(age+duration<=-tail||age>=0.0):(age < -tail||age>0.0))){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
 float from=duration>0.0?clamp((-tail-age)/duration,0.0,1.0):0.0,to=duration>0.0?clamp(-age/duration,0.0,1.0):1.0;
 int corner=gl_VertexID;
 float u=(corner==2||corner==3||corner==5)?to:from;
 float side=(corner==0||corner==2||corner==3)?-1.0:1.0;
 vec2 direction=screen*delta;
 vec2 tangent=length(direction)>0.000001?normalize(direction):vec2(1.0,0.0);
 vec2 pixel=screen*((start-origin.xy)-origin.zw+delta*u)+radius*side*vec2(-tangent.y,tangent.x);
 if(length(direction)<0.000001)pixel+=radius*tangent*((corner==2||corner==3||corner==5)?1.0:-1.0);
 float depth=0.1-0.8*(age+duration*u)/tail;
 gl_Position=vec4(pixel.x*2.0/size.x-1.0,1.0-pixel.y*2.0/size.y,depth*2.0-1.0,1.0);
}`);
   const fragment=shader(gl.FRAGMENT_SHADER,`#version 300 es
precision highp float;
uniform vec3 boatColour;
out vec4 colour;
void main(){colour=vec4(boatColour,1.0);}`);
   this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);
   gl.deleteShader(vertex);gl.deleteShader(fragment);
   if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
   this.uniforms=Object.fromEntries(['origin','screen','size','windowTime','radius','boatColour'].map(name=>[name,gl.getUniformLocation(this.program,name)]));
   this.initializeBoatColours();
   this.preparation={
    ready:async()=>{this.phase='Enkle iPhone-spor klargjort';},
    dispose:()=>{
     if(!gl.isContextLost())for(const record of this.buffers.values()){gl.deleteVertexArray(record.vao);gl.deleteBuffer(record.buffer);}
     this.buffers.clear();
    }
   };
   this.stats={frames:0,draws:0,vertices:0,intervals:0,caps:0};
   this.active=true;this.host.hidden=false;this.lastKey=null;this.viewportKey=null;this.sceneKey=null;
   clearRenderingFailure('Spor');
  }catch(error){this.fail(error);}
 }
 prepare(boat){
  if(!this.active)throw Error(this.error||'WebGL is unavailable.');
  if(this.buffers.has(boat.points))return;
  this.phase='Klargør enkelt spor: '+boat.name;
  const gl=this.gl,points=boat.points,data=new Float32Array(points.length*8);
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[i+1]||a,[x,y]=xy(a),stamp=a[2]-D.start,dt=b[2]-a[2];
   data.set([x,y,(b[0]-a[0])*1000/4.5,-(b[1]-a[1])*1180/3,stamp,dt,stamp-Math.fround(stamp),dt>0&&dt<=TRACK_MAX_GAP?1:(i===0||a[2]-points[i-1][2]>TRACK_MAX_GAP?2:0)],i*8);
   if(data[i*8+7]===2){data[i*8+2]=0;data[i*8+3]=0;data[i*8+5]=0;}
  }
  const buffer=gl.createBuffer(),vao=gl.createVertexArray();
  try{
   if(!buffer||!vao)throw Error('Kunne ikke allokere enkelt GPU-spor.');
   gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
   for(const [index,size,offset] of [[0,2,0],[1,2,8],[2,4,16]]){
    gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,32,offset);gl.vertexAttribDivisor(index,1);
   }
   const error=gl.getError();if(error)throw Error('Klargøring af enkelt GPU-spor: '+error);
   this.buffers.set(points,{buffer,vao,bytes:data.byteLength});this.uploads++;
  }catch(error){gl.deleteVertexArray(vao);gl.deleteBuffer(buffer);throw error;}
  finally{gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);}
 }
 prepareComparison(){/* iPhone uses boat colours and has no comparison data. */}
 begin(viewport){
  const gl=this.gl,u=this.uniforms,{matrix,topLeft:top,rect}=viewport;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
  gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(this.program);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  gl.uniform4f(u.origin,Math.fround(top.x),Math.fround(top.y),top.x-Math.fround(top.x),top.y-Math.fround(top.y));
  gl.uniformMatrix2fv(u.screen,false,new Float32Array([matrix.a,matrix.b,matrix.c,matrix.d]));gl.uniform2f(u.size,rect.width,rect.height);
  gl.uniform1f(u.radius,TRACK_STROKE_WIDTH/2);
 }
 drawRange({boat,record,window,first,last}){
  const gl=this.gl,u=this.uniforms,stamp=window.to-D.start,high=Math.fround(stamp),colour=this.boatColours.get(colours[boat.name]);
  if(!colour)throw Error('Bådens sporfarve er ikke forberedt: '+boat.name);
  gl.uniform4f(u.windowTime,Math.max(1e-6,window.to-window.from),high,0,stamp-high);gl.uniform3fv(u.boatColour,colour);
  gl.bindVertexArray(record.vao);gl.bindBuffer(gl.ARRAY_BUFFER,record.buffer);
  // Address the visible time range without rebuilding or uploading source data.
  for(const [index,size,offset] of [[0,2,0],[1,2,8],[2,4,16]])gl.vertexAttribPointer(index,size,gl.FLOAT,false,32,first*32+offset);
  gl.drawArraysInstanced(gl.TRIANGLES,0,6,last-first);gl.bindBuffer(gl.ARRAY_BUFFER,null);
  this.stats.draws++;this.stats.intervals+=last-first;this.stats.vertices+=6*(last-first);
 }
}
const webglTracks=new (SIMPLE_IPHONE_TRACKS?SimpleIPhoneTrackRenderer:WebGLTrackRenderer)($('routes'));
