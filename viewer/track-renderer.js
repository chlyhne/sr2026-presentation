// The GPU evaluates the original Hermite cubics. Source intervals stay in static
// instance buffers; playback changes time limits and instance ranges, not paths.
class WebGLTrackRenderer {
 constructor(layer){
  this.layer=layer;this.buffers=new Map();this.uploads=0;this.active=false;
  if(window.SR_TRACK_RENDERER==='svg')return;
  this.host=el('foreignObject',{'data-webgl-tracks':'','pointer-events':'none'},layer);
  this.canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');
  this.canvas.style.cssText='display:block;width:100%;height:100%;pointer-events:none';
  this.host.append(this.canvas);
  this.canvas.addEventListener('webglcontextlost',e=>{
   e.preventDefault();this.active=false;this.host.setAttribute('display','none');renderTracks();
  });
  this.canvas.addEventListener('webglcontextrestored',()=>{
   this.buffers.clear();this.initialize();prepareSelectedTracks();renderTracks();
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
   if(/swiftshader|llvmpipe|softpipe|software rasterizer/i.test(this.renderer)&&window.SR_TRACK_RENDERER!=='webgl')
    throw Error('Software graphics: use SVG');
   const shader=(type,source)=>{
    const result=gl.createShader(type);gl.shaderSource(result,source);gl.compileShader(result);
    if(!gl.getShaderParameter(result,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(result);gl.deleteShader(result);throw Error(message);}
    return result;
   };
   const vertex=shader(gl.VERTEX_SHADER,`#version 300 es
precision highp float;
layout(location=0) in vec3 shape;
layout(location=1) in vec4 position;
layout(location=2) in vec4 curve;
layout(location=3) in vec4 ending;
layout(location=4) in vec4 timing;
uniform vec4 origin;
uniform mat2 screen;
uniform vec2 size;
uniform vec2 windowTime;
uniform float radius;
out float sourceU;
flat out vec2 speeds;
void main(){
 float duration=timing.y;
 float from=duration>0.0?clamp((windowTime.x-timing.x)/duration,0.0,1.0):0.0;
 float to=duration>0.0?clamp((windowTime.y-timing.x)/duration,0.0,1.0):1.0;
 bool visible=duration>0.0?timing.x+duration>windowTime.x&&timing.x<windowTime.y:timing.x>=windowTime.x&&timing.x<=windowTime.y;
 if(!visible){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
 float u=mix(from,to,shape.x),u2=u*u,u3=u2*u;
 vec2 delta=curve.xy,m0=curve.zw,m1=ending.xy;
 vec2 p=(position.xy-origin.xy)+(position.zw-origin.zw)
  +delta*(3.0*u2-2.0*u3)+m0*(u3-2.0*u2+u)+m1*(u3-u2);
 vec2 derivative=screen*(delta*(6.0*u-6.0*u2)+m0*(3.0*u2-4.0*u+1.0)+m1*(3.0*u2-2.0*u));
 if(length(derivative)<0.000001)derivative=screen*delta;
 vec2 tangent=length(derivative)>0.000001?normalize(derivative):vec2(1.0,0.0);
 vec2 normal=vec2(-tangent.y,tangent.x);
 vec2 pixel=screen*p+radius*(normal*shape.y+tangent*shape.z);
 gl_Position=vec4(pixel.x*2.0/size.x-1.0,1.0-pixel.y*2.0/size.y,0.0,1.0);
 sourceU=u;speeds=ending.zw;
}`);
   const fragment=shader(gl.FRAGMENT_SHADER,`#version 300 es
precision highp float;
in float sourceU;
flat in vec2 speeds;
uniform sampler2D palette;
uniform bool outline;
uniform float depth;
out vec4 colour;
void main(){
 int bin=(speeds.x<0.0||speeds.y<0.0)?0:1+int(floor(clamp(mix(speeds.x,speeds.y,sourceU),0.0,15.0)*127.0/15.0+0.5));
 colour=outline?vec4(23.0/255.0,49.0/255.0,62.0/255.0,1.0):texelFetch(palette,ivec2(bin,0),0);
 // The existing SVG paints low speed bins first. Depth preserves that exact
 // overlap priority even though instances are stored in chronological order.
 gl_FragDepth=depth+(outline?0.003:-float(bin)*0.00001);
}`);
   this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);
   gl.deleteShader(vertex);gl.deleteShader(fragment);
   if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
   this.uniforms=Object.fromEntries(['origin','screen','size','windowTime','radius','palette','outline','depth'].map(name=>[name,gl.getUniformLocation(this.program,name)]));
   // Fixed mesh used for every interval, including round caps. Subdivision here
   // evaluates the cubic; it does not discard or simplify any source points.
   const mesh=[];
   const put=(u,n,t)=>mesh.push(u,n,t);
   const steps=32;
   for(let i=0;i<steps;i++){
    const a=i/steps,b=(i+1)/steps;
    put(a,-1,0);put(a,1,0);put(b,-1,0);
    put(b,-1,0);put(a,1,0);put(b,1,0);
   }
   for(const u of [0,1])for(let i=0;i<12;i++){
    const a=-Math.PI/2+i*Math.PI/12,b=-Math.PI/2+(i+1)*Math.PI/12;
    put(u,0,0);put(u,Math.sin(a),(u?1:-1)*Math.cos(a));put(u,Math.sin(b),(u?1:-1)*Math.cos(b));
   }
   this.vertexCount=mesh.length/3;
   this.mesh=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.mesh);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh),gl.STATIC_DRAW);
   this.palette=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.palette);
   const colours=[TRACK_SPEED_MISSING,...TRACK_SPEED_COLOURS],pixels=new Uint8Array(colours.length*4);
   colours.forEach((c,i)=>{
    const rgb=c[0]==='#'?[1,3,5].map(offset=>parseInt(c.slice(offset,offset+2),16)):c.match(/\d+/g).map(Number);
    pixels.set([...rgb,255],i*4);
   });
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,colours.length,1,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   this.active=true;this.host.removeAttribute('display');this.lastKey=null;this.viewportKey=null;
  }catch(error){
   this.active=false;this.error=error.message;this.host.setAttribute('display','none');
  }
 }
 prepare(boat){
  if(!this.active||this.buffers.has(boat.points))return;
  const gl=this.gl,{points,speeds}=boat,model=getTrackModel(points);
  // One compact record per observation, not per colour fragment or frame.
  const data=new Float32Array(points.length*16);
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[i+1],valid=b&&b[2]>a[2]&&b[2]-a[2]<=TRACK_MAX_GAP;
   const dt=valid?b[2]-a[2]:0,[x,y]=xy(a),hiX=Math.fround(x),hiY=Math.fround(y),offset=i*16;
   data[offset]=hiX;data[offset+1]=hiY;data[offset+2]=x-hiX;data[offset+3]=y-hiY;
   if(valid){
    data[offset+4]=(b[0]-a[0])*1000/4.5;data[offset+5]=-(b[1]-a[1])*1180/3;
    data[offset+6]=model.slopes[0][i]*dt*1000/4.5;data[offset+7]=-model.slopes[1][i]*dt*1180/3;
    data[offset+8]=model.slopes[0][i+1]*dt*1000/4.5;data[offset+9]=-model.slopes[1][i+1]*dt*1180/3;
   }
   const s0=speeds?.[i],s1=valid?speeds?.[i+1]:s0;
   data[offset+10]=Number.isFinite(s0)&&s0>=0?s0:-1;data[offset+11]=Number.isFinite(s1)&&s1>=0?s1:-1;
   data[offset+12]=a[2]-D.start;data[offset+13]=dt;
  }
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,this.mesh);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);
  for(let i=1;i<=4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribDivisor(i,1);}
  this.buffers.set(points,{buffer,vao,bytes:data.byteLength,first:null});this.uploads++;
 }
 render(time,order,force=false){
  this.time=time;this.order=order;
  if(!this.active)return false;
  try{
   const viewport=mapViewport();if(!viewport)return true;
   const {rect,matrix,inverse,topLeft:top}=viewport;
   const ratio=window.devicePixelRatio||1,width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
   const viewportKey=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f,rect.left,rect.top,rect.width,rect.height,width,height].join(':');
   const key=[time,viewportKey,...order.map(b=>b.id)].join(':');
   if(!force&&this.lastKey===key)return true;
   this.lastKey=key;
   const gl=this.gl,u=this.uniforms;
   gl.useProgram(this.program);
   if(this.viewportKey!==viewportKey){
    // Lay out the embedded HTML in screen pixels. A foreignObject positioned
    // at fractional map coordinates is rounded by the browser's canvas
    // compositor before SVG zoom, shifting the bitmap by many screen pixels.
    // Cancel the map transform here; the shader still uses the shared map camera.
    this.host.setAttribute('x',0);this.host.setAttribute('y',0);
    this.host.setAttribute('width',rect.width);this.host.setAttribute('height',rect.height);
    this.host.setAttribute('transform',`matrix(${inverse.a} ${inverse.b} ${inverse.c} ${inverse.d} ${top.x} ${top.y})`);
    if(this.canvas.width!==width)this.canvas.width=width;if(this.canvas.height!==height)this.canvas.height=height;
    gl.uniform4f(u.origin,Math.fround(top.x),Math.fround(top.y),top.x-Math.fround(top.x),top.y-Math.fround(top.y));
    gl.uniformMatrix2fv(u.screen,false,new Float32Array([matrix.a,matrix.b,matrix.c,matrix.d]));
    gl.uniform2f(u.size,rect.width,rect.height);this.viewportKey=viewportKey;
   }
   gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.useProgram(this.program);
   gl.uniform2f(u.windowTime,time-7200-D.start,time-D.start);
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.palette);gl.uniform1i(u.palette,0);
   for(const [rank,boat] of order.entries()){
    const points=boat.points,first=Math.max(0,timeBoundary(points,time-7200)-1),last=timeBoundary(points,time,true);
    if(last<=first)continue;
    this.prepare(boat);const record=this.buffers.get(points);
    gl.bindVertexArray(record.vao);
    // WebGL has no base-instance draw: adjust the view into the same immutable
    // buffer. No buffer allocation or upload occurs when advancing or seeking.
    if(record.first!==first){
     gl.bindBuffer(gl.ARRAY_BUFFER,record.buffer);
     for(let i=1;i<=4;i++)gl.vertexAttribPointer(i,4,gl.FLOAT,false,64,first*64+(i-1)*16);
     record.first=first;
    }
    gl.uniform1f(u.depth,1-(rank+1)/(order.length+1));
    for(const outline of [true,false]){
     gl.uniform1i(u.outline,outline);gl.uniform1f(u.radius,(outline?TRACK_OUTLINE_WIDTH:TRACK_STROKE_WIDTH)/2);
     gl.drawArraysInstanced(gl.TRIANGLES,0,this.vertexCount,last-first);
    }
   }
   gl.bindVertexArray(null);gl.flush();
   return true;
  }catch(error){this.error=error.message;this.active=false;this.host.setAttribute('display','none');return false;}
 }
 redraw(){if(this.order)this.render(this.time,this.order);}
}
const webglTracks=new WebGLTrackRenderer($('routes'));
