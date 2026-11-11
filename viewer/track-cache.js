const TRACK_CACHE_ZOOM_SETTLE_MS=150;
class WebGLTrackCache {
 constructor(renderer,shader){
  this.renderer=renderer;this.gl=renderer.gl;this.pages=[];this.entries=new Map();this.projections=new WeakMap();
  this.tileSize=512;this.gutter=2;this.pageSize=Math.min(2048,renderer.maxTextureSize);
  this.camera=null;this.buildAfter=0;
  this.stats={builds:0,hits:0,geometryInstances:0,compositeInstances:0,frames:0,bytes:0};
  const gl=this.gl;
  const vertex=shader(gl.VERTEX_SHADER,`#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D instances;
uniform int firstDescriptor;
uniform vec2 size;
out vec2 uv;
flat out vec4 depthTransform;
void main(){
 int index=(firstDescriptor+gl_InstanceID)*3;
 int width=textureSize(instances,0).x;
 vec4 rectangle=texelFetch(instances,ivec2(index%width,index/width),0);
 index++;
 vec4 textureRectangle=texelFetch(instances,ivec2(index%width,index/width),0);
 index++;
 depthTransform=texelFetch(instances,ivec2(index%width,index/width),0);
 vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(0,1),vec2(0,1),vec2(1,0),vec2(1,1));
 vec2 corner=corners[gl_VertexID];
 vec2 pixel=rectangle.xy+corner*rectangle.zw;
 uv=textureRectangle.xy+corner*textureRectangle.zw;
 gl_Position=vec4(pixel.x*2.0/size.x-1.0,1.0-pixel.y*2.0/size.y,0,1);
}`);
  const fragment=shader(gl.FRAGMENT_SHADER,`#version 300 es
precision highp float;
uniform sampler2D tiles;
uniform highp sampler2D depths;
in vec2 uv;
flat in vec4 depthTransform;
out vec4 colour;
void main(){
 colour=texture(tiles,uv);
 if(colour.a==0.0)discard;
 vec2 address=uv*vec2(textureSize(depths,0))-0.5;
 ivec2 base=ivec2(floor(address));
 vec2 fraction=fract(address);
 float weightedDepth=0.0,weight=0.0;
 for(int row=0;row<2;row++)for(int column=0;column<2;column++){
  ivec2 point=base+ivec2(column,row);
  float sampleDepth=texelFetch(depths,point,0).r;
  float contribution=(column==0?1.0-fraction.x:fraction.x)*(row==0?1.0-fraction.y:fraction.y);
  if(sampleDepth<1.0){weightedDepth+=sampleDepth*contribution;weight+=contribution;}
 }
 if(weight==0.0)discard;
 float localDepth=weightedDepth/weight;
 if(localDepth<depthTransform.z-0.000002||localDepth>depthTransform.w+0.000002)discard;
 gl_FragDepth=depthTransform.x+localDepth*depthTransform.y;
}`);
  this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.uniforms=Object.fromEntries(['instances','firstDescriptor','size','tiles','depths'].map(name=>[name,gl.getUniformLocation(this.program,name)]));
  this.vao=gl.createVertexArray();this.framebuffer=gl.createFramebuffer();this.scratch=gl.createFramebuffer();
  const extent=this.tileSize+this.gutter*2;
  this.scratchColour=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,this.scratchColour);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER,4,gl.RGBA8,extent,extent);
  this.scratchDepth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,this.scratchDepth);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER,4,gl.DEPTH_COMPONENT32F,extent,extent);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.scratch);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,this.scratchColour);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.scratchDepth);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Sporcachens multisample-framebuffer kunne ikke oprettes.');
  this.resolve=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.resolve);
  this.resolveColour=gl.createTexture();gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,this.resolveColour);
  gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA8,extent,extent);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.resolveColour,0);
  this.resolveDepth=gl.createTexture();gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,this.resolveDepth);
  gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT32F,extent,extent);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.resolveDepth,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Sporcachens resolve-framebuffer kunne ikke oprettes.');
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);
  this.stats.bytes=extent*extent*8*5;
  this.descriptorHeight=64;this.createDescriptors();
 }
 createDescriptors(){
  const gl=this.gl;
  if(this.descriptorTexture){gl.deleteTexture(this.descriptorTexture);this.stats.bytes-=this.descriptors.byteLength;}
  this.descriptors=new Float32Array(1024*this.descriptorHeight*4);
  this.descriptorTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,this.descriptorTexture);
  gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,1024,this.descriptorHeight);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  this.stats.bytes+=this.descriptors.byteLength;
  gl.activeTexture(gl.TEXTURE0);
 }
 reset(){
  const gl=this.gl;
  for(const page of this.pages){gl.deleteTexture(page.colour);gl.deleteTexture(page.depth);this.stats.bytes-=this.pageSize*this.pageSize*8;}
  this.pages.length=0;this.entries.clear();this.camera=null;this.buildAfter=0;
 }
 allocate(width,height){
  const gl=this.gl;
  let page=this.pages.at(-1);
  if(page&&page.x+width>this.pageSize){page.x=0;page.y+=page.rowHeight;page.rowHeight=0;}
  if(!page||page.y+height>this.pageSize){
   page={x:0,y:0,rowHeight:0,colour:gl.createTexture(),depth:gl.createTexture()};
   gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,page.colour);
   gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA8,this.pageSize,this.pageSize);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,page.depth);
   gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT32F,this.pageSize,this.pageSize);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   this.pages.push(page);this.stats.bytes+=this.pageSize*this.pageSize*8;
  }
  const rectangle={page,x:page.x,y:page.y,width,height};
  page.x+=width;page.rowHeight=Math.max(page.rowHeight,height);
  return rectangle;
 }
 begin(viewport){
  const {matrix,topLeft}=viewport,ratio=2*(devicePixelRatio||1);
  const key=[matrix.a,matrix.b,matrix.c,matrix.d,ratio].join(':');
  // Admit new raster tiles only after zoom settles. Playback can draw another
  // frame between wheel events; that does not make its scale worth caching.
  // Existing tiles remain usable immediately. Cold zooms
  // use the same geometry submission as uncached track boundaries, without
  // allocating atlases or rasterizing thousands of throwaway tiles first.
  const now=performance.now();
  if(this.camera&&this.camera.key!==key)this.buildAfter=now+TRACK_CACHE_ZOOM_SETTLE_MS;
  this.buildTiles=now>=this.buildAfter;
  this.camera={ratio,matrix,originX:(matrix.a*topLeft.x+matrix.c*topLeft.y)*ratio,
   originY:(matrix.b*topLeft.x+matrix.d*topLeft.y)*ratio,width:viewport.pixelWidth,height:viewport.pixelHeight,key};
  this.groups=[{cached:[],dynamic:[]},{cached:[],dynamic:[]}];
  this.stats.frames++;
 }
 bounds(chunk){
  const cached=this.projections.get(chunk);if(cached?.key===this.camera.key)return cached.bounds;
  const {matrix,ratio}=this.camera;
  const corners=[[chunk.west,chunk.north],[chunk.east,chunk.north],[chunk.west,chunk.south],[chunk.east,chunk.south]];
  const horizontal=corners.map(([x,y])=>(matrix.a*x+matrix.c*y)*ratio),vertical=corners.map(([x,y])=>(matrix.b*x+matrix.d*y)*ratio);
  const margin=Math.ceil(TRACK_OUTLINE_WIDTH/2*ratio)+this.gutter+1;
  const bounds={left:Math.floor(Math.min(...horizontal))-margin,right:Math.ceil(Math.max(...horizontal))+margin,
   top:Math.floor(Math.min(...vertical))-margin,bottom:Math.ceil(Math.max(...vertical))+margin};
  // Retain only the current projection, not every intermediate wheel scale.
  this.projections.set(chunk,{key:this.camera.key,bounds});return bounds;
 }
 add(state){
  const {record,window,first,last,isReference,style}=state,group=this.groups[isReference?0:1],camera=this.camera;
  const start=Math.floor(first/32),end=Math.ceil(last/32);
  for(let index=start;index<end;index++){
   const chunk=record.chunks[index],bounds=this.bounds(chunk);
   if(bounds.right<camera.originX||bounds.left>camera.originX+camera.width||bounds.bottom<camera.originY||bounds.top>camera.originY+camera.height)continue;
   const geometry=()=>{
    const from=Math.max(first,chunk.first),to=Math.min(last,chunk.last),previous=group.dynamic.at(-1);
    // Adjacent visible chunks share uniforms and can be one geometry draw.
    if(previous?.boat===state.boat&&previous.window===window&&previous.last===from)previous.last=to;
    else group.dynamic.push({...state,first:from,last:to});
   };
   if(chunk.rasterFrom<=window.from||chunk.rasterTo>=window.to||chunk.rasterTo<=chunk.rasterFrom){
    geometry();continue;
   }
   const key=camera.key+':'+style;
   let variants=this.entries.get(chunk),tiles=variants?.get(key);
   const minX=Math.floor(Math.max(bounds.left,camera.originX)/this.tileSize),maxX=Math.floor(Math.min(bounds.right,camera.originX+camera.width)/this.tileSize);
   const minY=Math.floor(Math.max(bounds.top,camera.originY)/this.tileSize),maxY=Math.floor(Math.min(bounds.bottom,camera.originY+camera.height)/this.tileSize);
   if(!this.buildTiles){
    let complete=!!tiles;
    for(let y=minY;complete&&y<=maxY;y++)for(let x=minX;x<=maxX;x++)if(!tiles.has(x+':'+y)){complete=false;break;}
    if(!complete){geometry();continue;}
   }
   if(!variants){variants=new Map();this.entries.set(chunk,variants);}
   if(!tiles){tiles=new Map();variants.set(key,tiles);}
   for(let tileY=minY;tileY<=maxY;tileY++)for(let tileX=minX;tileX<=maxX;tileX++){
    const tileKey=tileX+':'+tileY;
    let tile=tiles.get(tileKey);
    if(!tile){
     const left=Math.max(bounds.left,tileX*this.tileSize-this.gutter),top=Math.max(bounds.top,tileY*this.tileSize-this.gutter);
     const right=Math.min(bounds.right,(tileX+1)*this.tileSize+this.gutter),bottom=Math.min(bounds.bottom,(tileY+1)*this.tileSize+this.gutter);
     if(right<=left||bottom<=top)continue;
     tile={...this.allocate(right-left,bottom-top),left,top,right,bottom,tileX,tileY,chunk};
     this.build(tile,{...state,first:chunk.rasterFirst,last:chunk.rasterLast,window:{from:chunk.rasterFrom,to:chunk.rasterTo}});
     tiles.set(tileKey,tile);
    }else this.stats.hits++;
    group.cached.push({tile,window});
   }
  }
 }
 build(tile,state){
  const gl=this.gl,camera=this.camera,{matrix,ratio}=camera,determinant=matrix.a*matrix.d-matrix.b*matrix.c;
  const x=tile.left/ratio,y=tile.top/ratio;
  const origin={x:(matrix.d*x-matrix.c*y)/determinant,y:(matrix.a*y-matrix.b*x)/determinant};
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.scratch);gl.viewport(0,0,tile.width,tile.height);
  gl.enable(gl.SCISSOR_TEST);gl.scissor(0,0,tile.width,tile.height);
  gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  this.renderer.drawRange(state,{matrix:{a:matrix.a*ratio,b:matrix.b*ratio,c:matrix.c*ratio,d:matrix.d*ratio},topLeft:origin,
   rect:{width:tile.width,height:tile.height}},false,ratio);
  gl.disable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.resolve);
  gl.blitFramebuffer(0,0,tile.width,tile.height,0,0,tile.width,tile.height,gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,gl.NEAREST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.resolve);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.framebuffer);
  gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tile.page.colour,0);
  gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,tile.page.depth,0);
  if(gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Sporcachens atlas-framebuffer kunne ikke oprettes.');
  gl.blitFramebuffer(0,0,tile.width,tile.height,tile.x,tile.y,tile.x+tile.width,tile.y+tile.height,gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  this.stats.builds++;this.stats.geometryInstances+=state.last-state.first;
 }
 composite(group){
  const gl=this.gl,camera=this.camera,draws=group.cached;
  if(!draws.length)return;
  while(draws.length*12>this.descriptors.length){
   this.descriptorHeight*=2;
   if(this.descriptorHeight>this.renderer.maxTextureSize)throw Error('Sporcachens kompositionsliste overstiger GPU-teksturens maksimale størrelse.');
   this.createDescriptors();
  }
  const batches=[];
  for(let index=0;index<draws.length;index++){
   const {tile,window}=draws[index],chunk=tile.chunk,tail=Math.max(1e-6,window.to-window.from);
   const left=Math.max(tile.left,tile.tileX*this.tileSize),right=Math.min(tile.right,(tile.tileX+1)*this.tileSize);
   const top=Math.max(tile.top,tile.tileY*this.tileSize),bottom=Math.min(tile.bottom,(tile.tileY+1)*this.tileSize);
   const offset=index*12,duration=chunk.rasterTo-chunk.rasterFrom,scale=duration/tail;
   this.descriptors.set([left-camera.originX,top-camera.originY,right-left,bottom-top,
    (tile.x+left-tile.left)/this.pageSize,(tile.y+tile.height-(top-tile.top))/this.pageSize,
    (right-left)/this.pageSize,-(bottom-top)/this.pageSize,
    0.1+0.8*(window.to-chunk.rasterTo)/tail-0.1*scale,scale,
    0.1+0.8*(chunk.rasterTo-chunk.to)/duration,0.1+0.8*(chunk.rasterTo-chunk.from)/duration],offset);
   let batch=batches.at(-1);
   if(!batch||batch.page!==tile.page){batch={page:tile.page,first:index,count:0};batches.push(batch);}
   batch.count++;
  }
  gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,this.descriptorTexture);
  const rows=Math.ceil(draws.length*3/1024);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,1024,rows,gl.RGBA,gl.FLOAT,this.descriptors.subarray(0,1024*rows*4));
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);
  gl.uniform1i(this.uniforms.instances,6);gl.uniform1i(this.uniforms.tiles,4);gl.uniform1i(this.uniforms.depths,5);
  gl.uniform2f(this.uniforms.size,camera.width,camera.height);
  for(const batch of batches){
   gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,batch.page.colour);
   gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,batch.page.depth);
   gl.uniform1i(this.uniforms.firstDescriptor,batch.first);
   gl.drawArraysInstanced(gl.TRIANGLES,0,6,batch.count);
  }
  this.stats.compositeInstances+=draws.length;
 }
 render(viewport){
  const gl=this.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
  gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);
  for(const group of this.groups){
   this.composite(group);
   for(const state of group.dynamic){this.renderer.drawRange(state,viewport,true);this.stats.geometryInstances+=state.last-state.first;}
   gl.clear(gl.DEPTH_BUFFER_BIT);
  }
  gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.flush();
 }
}
