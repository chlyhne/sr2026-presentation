// The sole background renderer:
// wind texture -> land triangles -> radar texture -> coastline triangles.
function prepareBackgroundGeometry(polygons,chunks){
 const landCount=polygons.reduce((n,p)=>n+p.rings.reduce((s,r)=>s+r.length,0),0);
 const holeCount=polygons.reduce((n,p)=>n+p.rings.length-1,0);
 const landVertices=new Float32Array(landCount*4),landIndices=new Uint32Array((landCount+2*holeCount)*3);
 const landRecords=[];let vertex=0,index=0;
 const store=(array,offset,point)=>{
  const [x,y]=xy(point),hx=Math.fround(x),hy=Math.fround(y);
  array.set([hx,hy,x-hx,y-hy],offset);
 };
 for(const polygon of polygons){
  const firstVertex=vertex,first=index,count=polygon.rings.reduce((n,r)=>n+r.length,0);
  const flat=new Float64Array(count*2),holes=[];let cursor=0;
  for(const [i,ring] of polygon.rings.entries()){
   if(i)holes.push(cursor);
   for(const point of ring){flat.set(xy(point),cursor*2);store(landVertices,vertex++*4,point);cursor++;}
  }
  const triangles=earcut.default(flat,holes,2);
  if(earcut.deviation(flat,holes,2,triangles)>1e-6)throw Error('Landpolygonen kunne ikke trianguleres præcist.');
  for(const t of triangles)landIndices[index++]=firstVertex+t;
  landRecords.push({...polygon,first,count:index-first});
 }
 const coastCount=chunks.reduce((n,c)=>n+c.points.length,0);
 const coastVertices=new Float32Array(coastCount*2*8),coastIndices=new Uint32Array(coastCount*6);
 const coastRecords=[];vertex=0;index=0;
 for(const chunk of chunks){
  const firstVertex=vertex,first=index,points=chunk.points;
  for(let i=0;i<points.length;i++){
   const p=xy(points[i]),before=xy(points[i-1]||chunk.before||points[i]),after=xy(points[i+1]||chunk.after||points[i]);
   for(let side=0;side<2;side++){
    const offset=vertex++*8;store(coastVertices,offset,points[i]);
    coastVertices.set([p[0]-before[0],p[1]-before[1],after[0]-p[0],after[1]-p[1]],offset+4);
   }
   if(i){const a=firstVertex+(i-1)*2,b=a+2;coastIndices.set([a,a+1,b,b,a+1,b+1],index);index+=6;}
  }
  coastRecords.push({...chunk,first,count:index-first});
 }
 return {land:{vertices:landVertices,indices:landIndices.subarray(0,landRecords.reduce((n,r)=>n+r.count,0)),records:landRecords},
  coast:{vertices:coastVertices,indices:coastIndices.subarray(0,index),records:coastRecords}};
}

class WebGLBackgroundRenderer {
 constructor(){
  this.active=false;this.geometry=null;this.uploads=0;this.textureUploads=0;this.draws=0;
  this.sourceNodes=['windField','land','precipitation','coast'].map(id=>$(id));
  for(const node of this.sourceNodes)node.setAttribute('display','none');
  this.host=el('foreignObject',{'data-webgl-background':'','pointer-events':'none',display:'none'});
  $('map').insertBefore(this.host,$('windField'));
  this.canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');
  this.canvas.style.cssText='display:block;width:100%;height:100%;pointer-events:none';this.host.append(this.canvas);
  this.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.fail(Error('WebGL-konteksten er mistet.'));});
  this.canvas.addEventListener('webglcontextrestored',()=>{this.initialize();requestRender();});
  this.initialize();
 }
 setActive(active){
  this.active=active;this.lastKey=null;
  this.host.setAttribute('display',active?'inline':'none');
  if(active){
   clearRenderingFailure('Baggrund');
   if(this.weatherSlots)for(const buffer of [windImageBuffer,radarImageBuffer])for(const entry of [buffer.front,buffer.back])if(entry?.ready)this.prepareWeather(buffer,entry);
  }
 }
 fail(error){this.error=error.message;this.setActive(false);reportRenderingFailure('Baggrund',error);}
 program(vertex,fragment){
  const gl=this.gl,shaders=[];let program;
  try{
   for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
    const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
   }
   program=gl.createProgram();for(const shader of shaders)gl.attachShader(program,shader);gl.linkProgram(program);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
   return {program,uniforms:Object.fromEntries(['origin','screen','size','image','opacity'].map(name=>[name,gl.getUniformLocation(program,name)]))};
  }finally{for(const shader of shaders)gl.deleteShader(shader);}
 }
 initialize(){
  try{
   const gl=this.canvas.getContext('webgl2',{alpha:true,antialias:true,depth:false,stencil:false,premultipliedAlpha:true});
   if(!gl)throw Error('WebGL 2 unavailable');this.gl=gl;
   const debug=gl.getExtension('WEBGL_debug_renderer_info');this.renderer=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'';
   const projection=`
uniform vec4 origin;uniform mat2 screen;uniform vec2 size;
vec2 project(vec4 p){return screen*((p.xy-origin.xy)+(p.zw-origin.zw));}
vec4 clip(vec2 p){return vec4(p.x*2.0/size.x-1.0,1.0-p.y*2.0/size.y,0.0,1.0);}
`;
   this.landProgram=this.program(`#version 300 es
precision highp float;layout(location=0) in vec4 position;${projection}
void main(){gl_Position=clip(project(position));}`,`#version 300 es
precision highp float;out vec4 colour;void main(){colour=vec4(189.0/255.0,199.0/255.0,203.0/255.0,1.0);}`);
   this.coastProgram=this.program(`#version 300 es
precision highp float;layout(location=0) in vec4 position;layout(location=1) in vec4 directions;${projection}
void main(){
 vec2 before=screen*directions.xy,after=screen*directions.zw;
 if(length(before)<0.000001)before=after;if(length(after)<0.000001)after=before;
 if(length(before)<0.000001){before=vec2(1.0,0.0);after=before;}
 before=normalize(before);after=normalize(after);
 vec2 n0=vec2(-before.y,before.x),n1=vec2(-after.y,after.x),sum=n0+n1;
 vec2 normal=length(sum)>0.000001?normalize(sum):n1;
 float miter=0.5/max(abs(dot(normal,n1)),0.5);
 float side=(gl_VertexID&1)==0?-1.0:1.0;
 gl_Position=clip(project(position)+normal*miter*side);
}`,`#version 300 es
precision highp float;out vec4 colour;void main(){colour=vec4(54.0/255.0,87.0/255.0,102.0/255.0,1.0);}`);
   this.textureProgram=this.program(`#version 300 es
precision highp float;layout(location=0) in vec2 uv;out vec2 texCoord;${projection}
void main(){texCoord=uv;gl_Position=clip(screen*((uv*vec2(1000.0,1180.0)-origin.xy)-origin.zw));}`,`#version 300 es
precision highp float;in vec2 texCoord;uniform sampler2D image;uniform float opacity;out vec4 colour;
void main(){colour=texture(image,texCoord)*opacity;}`);
   this.geometry||=prepareBackgroundGeometry(landPolygons,coastChunks);
   this.landMesh=this.mesh(this.geometry.land,4);this.coastMesh=this.mesh(this.geometry.coast,8);
   this.quad=gl.createVertexArray();gl.bindVertexArray(this.quad);
   const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);
   gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);gl.bindVertexArray(null);
   this.weatherSlots=new Map([windImageBuffer,radarImageBuffer].map(buffer=>[buffer.id,[0,1].map(()=>({texture:gl.createTexture(),entry:null,width:0,height:0}))]));
   // Explicit order is independent of SVG node creation or weather load order.
   this.layers=[{id:'wind',buffer:windImageBuffer,node:$('windField')},{id:'land',mesh:this.landMesh,node:$('land')},
    {id:'radar',buffer:radarImageBuffer,node:$('precipitation')},{id:'coast',mesh:this.coastMesh,node:$('coast')}];
   this.viewportKey=null;this.setActive(true);
  }catch(error){this.fail(error);}
 }
 mesh(data,stride){
  const gl=this.gl,vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const vertices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,data.vertices,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,stride*4,0);
  if(stride===8){gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,32,16);}
  const indices=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);gl.bindVertexArray(null);
  this.uploads+=2;return {vao,records:data.records,ranges:new Uint32Array(data.records.length*2)};
 }
 invalidate(){if(this.active){this.lastKey=null;requestRender({backgroundOnly:true});}}
 prepareWeather(buffer,entry){
  if(!this.active)return;
  try{
   const gl=this.gl,slots=this.weatherSlots.get(buffer.id);if(!slots)return;
   if(slots.some(slot=>slot.entry===entry))return;
   const slot=slots.find(slot=>!slot.entry||slot.entry!==buffer.front);if(!slot)throw Error('Vejrets forreste tekstur må ikke overskrives.');
   const image=entry.image,width=image.naturalWidth,height=image.naturalHeight;
   if(!width||!height)throw Error('Vejrbilledet er ikke afkodet.');
   gl.bindTexture(gl.TEXTURE_2D,slot.texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
   if(slot.width===width&&slot.height===height)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,image);
   else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   slot.width=width;slot.height=height;slot.entry=entry;this.textureUploads++;
  }catch(error){this.fail(error);}
 }
 visible(node){
  for(let current=node;current&&current!==$('map');current=current.parentElement)if(current.getAttribute('visibility')==='hidden')return false;
  return true;
 }
 camera(program,viewport){
  const gl=this.gl,{uniforms:u}=program,{matrix,rect,topLeft:p}=viewport;
  gl.useProgram(program.program);gl.uniform4f(u.origin,Math.fround(p.x),Math.fround(p.y),p.x-Math.fround(p.x),p.y-Math.fround(p.y));
  gl.uniformMatrix2fv(u.screen,false,new Float32Array([matrix.a,matrix.b,matrix.c,matrix.d]));gl.uniform2f(u.size,rect.width,rect.height);
 }
 drawMesh(mesh,bounds){
  const gl=this.gl;gl.bindVertexArray(mesh.vao);let count=0;
  for(const record of mesh.records){
   if(!record.count||!mapBoundsIntersect(record,bounds))continue;
   if(count&&mesh.ranges[count-2]+mesh.ranges[count-1]===record.first)mesh.ranges[count-1]+=record.count;
   else{mesh.ranges[count++]=record.first;mesh.ranges[count++]=record.count;}
  }
  for(let i=0;i<count;i+=2)gl.drawElements(gl.TRIANGLES,mesh.ranges[i+1],gl.UNSIGNED_INT,mesh.ranges[i]*4);
 }
 render(force=false,viewportOverride=null){
  if(!this.active)return false;
  try{
   if(this.gl.isContextLost())throw Error('WebGL-konteksten er mistet.');
   const viewport=viewportOverride||mapViewport();if(!viewport)return true;
   const {rect,matrix,pixelWidth,pixelHeight}=viewport;
   const viewportKey=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f,rect.left,rect.top,rect.width,rect.height,pixelWidth,pixelHeight].join(':');
   const states=this.layers.map(layer=>{
    const front=layer.buffer?.front;
    return {layer,visible:this.visible(layer.node)&&(!layer.buffer||(front?.ready&&layer.buffer.frontNode.getAttribute('visibility')==='visible')),
     texture:layer.buffer&&this.weatherSlots.get(layer.buffer.id).find(slot=>slot.entry===front),opacity:layer.id==='radar'?+$('rainOpacity').value:1};
   });
   const key=viewportKey+states.map(s=>`${s.layer.id}:${!!s.visible}:${s.layer.buffer?.front?.key}:${s.opacity}`).join('|');
   if(!force&&key===this.lastKey)return true;this.lastKey=key;
   if(viewportKey!==this.viewportKey){positionMapCanvas(this.host,this.canvas,viewport);this.viewportKey=viewportKey;}
   const gl=this.gl;gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
   gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
   for(const state of states){
    if(!state.visible)continue;
    if(state.layer.mesh){
     this.camera(state.layer.id==='land'?this.landProgram:this.coastProgram,viewport);this.drawMesh(state.layer.mesh,viewport.bounds);
    }else if(state.texture){
     this.camera(this.textureProgram,viewport);gl.bindVertexArray(this.quad);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,state.texture.texture);
     gl.uniform1i(this.textureProgram.uniforms.image,0);gl.uniform1f(this.textureProgram.uniforms.opacity,state.opacity);gl.drawArrays(gl.TRIANGLES,0,6);
    }
   }
   gl.bindVertexArray(null);this.draws++;return true;
  }catch(error){this.fail(error);return false;}
 }
 snapshot(scale=2){
  if(!this.active)throw Error(this.error||'Baggrundens WebGL-rendering er ikke tilgængelig.');
  const viewport=mapViewport();
  try{
   this.render(true,{...viewport,pixelWidth:Math.round(viewport.rect.width*scale),pixelHeight:Math.round(viewport.rect.height*scale)});
   if(!this.active)throw Error(this.error||'Baggrunden kunne ikke eksporteres.');
   return this.canvas.toDataURL('image/png');
  }finally{if(this.active)this.render(true);}
 }
}
const webglBackground=window.SRBackground=new WebGLBackgroundRenderer();
