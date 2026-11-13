const trackProfileCache=new WeakMap();
// Nominal WebGL2 preparation: original observations -> GPU PCHIP and profiles.
// No CPU interpolation, profile generation, 10-bit codes or downloaded profiles.
class GPUTrackPreparation {
 constructor(renderer){
  this.renderer=renderer;this.gl=renderer.gl;this.records=renderer.buffers;this.denseSamples=0;this.legs=rhumbRoute.legs;
  const gl=this.gl;this.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if(!gl.getExtension('EXT_color_buffer_float'))throw Error('RGBA32F rendering unavailable');
  this.vao=gl.createVertexArray();this.feedback=gl.createTransformFeedback();this.fbo=gl.createFramebuffer();
  const source=`
uniform highp sampler2D sourceData;uniform int sourceCount;
vec4 src(int i){int width=textureSize(sourceData,0).x,p=clamp(i,0,sourceCount-1)*2;return texelFetch(sourceData,ivec2(p%width,p/width),0);}
vec4 interval(int i){int width=textureSize(sourceData,0).x,p=clamp(i,0,sourceCount-1)*2+1;return texelFetch(sourceData,ivec2(p%width,p/width),0);}
bool connected(int i){return i>=0&&i+1<sourceCount&&interval(i).z>0.0&&interval(i).z<=300.0;}
float endpoint(float h0,float h1,float d0,float d1){float v=((2.0*h0+h1)*d0-h0*d1)/(h0+h1);if(sign(v)!=sign(d0))return 0.0;return sign(d0)!=sign(d1)&&abs(v)>3.0*abs(d0)?3.0*d0:v;}
vec2 slope(int i){
 bool before=connected(i-1),after=connected(i);vec4 a=src(i-1),b=src(i),c=src(i+1),d=src(i+2);
 if(!before&&!after)return vec2(0.0);
 if(!before){float h=interval(i).z;vec2 delta=interval(i).xy/h;if(!connected(i+1))return delta;float hn=interval(i+1).z;vec2 dn=interval(i+1).xy/hn;return vec2(endpoint(h,hn,delta.x,dn.x),endpoint(h,hn,delta.y,dn.y));}
 if(!after){float h=interval(i-1).z;vec2 delta=interval(i-1).xy/h;if(!connected(i-2))return delta;vec4 p=src(i-2);float hp=interval(i-2).z;vec2 dp=interval(i-2).xy/hp;return vec2(endpoint(h,hp,delta.x,dp.x),endpoint(h,hp,delta.y,dp.y));}
 float h0=interval(i-1).z,h1=interval(i).z,w0=2.0*h1+h0,w1=h1+2.0*h0;vec2 d0=interval(i-1).xy/h0,d1=interval(i).xy/h1;
 return vec2(d0.x*d1.x>0.0?(w0+w1)/(w0/d0.x+w1/d1.x):0.0,d0.y*d1.y>0.0?(w0+w1)/(w0/d0.y+w1/d1.y):0.0);
}
void cubic(int i,float u,out vec2 p,out vec2 derivative){vec4 a=src(i),b=src(i+1);float h=interval(i).z;vec2 delta=interval(i).xy,m0=slope(i)*h,m1=slope(i+1)*h;float u2=u*u,u3=u2*u;p=a.xy+delta*(3.0*u2-2.0*u3)+m0*(u3-2.0*u2+u)+m1*(u3-u2);derivative=delta*(6.0*u-6.0*u2)+m0*(3.0*u2-4.0*u+1.0)+m1*(3.0*u2-2.0*u);}
`;
  this.counts=this.program(source+`
out vec2 counts;
void main(){int i=gl_VertexID;counts=vec2(0.0);if(!connected(i))return;vec4 a=src(i),b=src(i+1);float h=interval(i).z;vec2 m0=slope(i)*h,m1=slope(i+1)*h,delta=interval(i).xy;
 vec2 metric=vec2(500.94,282.9916);float bound=max(length(m0/3.0*metric),max(length((delta-(m0+m1)/3.0)*metric),length(m1/3.0*metric)))*3.0;
 counts.x=max(1.0,ceil(bound/8.0));counts.y=max(length(6.0*delta-4.0*m0-2.0*m1),length(-6.0*delta+2.0*m0+4.0*m1));}
`,['counts']);
  this.geometry=this.program(source+`
out vec4 g0;out vec4 g1;out vec4 g2;out vec4 g3;
void main(){int i=gl_VertexID;vec4 a=src(i),b=src(i+1);bool next=connected(i),previous=connected(i-1);float h=next?interval(i).z:0.0;
 g0=vec4(a.xy,0.0,0.0);g1=next?vec4(interval(i).xy,slope(i)*h):vec4(0.0);g2=vec4(next?slope(i+1)*h:vec2(0.0),a.w,next?b.w:a.w);
 float flags=next?float(!previous)+2.0*float(!connected(i+1)):(previous?0.0:3.0);g3=vec4(a.z,h,interval(i).w,flags);}
`,['g0','g1','g2','g3']);
  const projection=source+`
uniform highp sampler2D routeData;uniform int legCount;
const float RAD=0.017453292519943295,RADIUS=6371008.8;
vec4 leg(int i,int word){return texelFetch(routeData,ivec2(word,i),0);}
float log1pStable(float x){float term=x,sum=0.0;for(int n=1;n<=10;n++){sum+=(n%2==1?1.0:-1.0)*term/float(n);term*=x;}return sum;}
float expm1Stable(float x){float term=x,sum=x;for(int n=2;n<=10;n++){term*=x/float(n);sum+=term;}return sum;}
float atanSmall(float x){float x2=x*x;return x*(1.0+x2*(-1.0/3.0+x2*(1.0/5.0+x2*(-1.0/7.0+x2/9.0))));}
float tanSmall(float x){float x2=x*x;return x*(1.0+x2*(1.0/3.0+x2*(2.0/15.0+x2*(17.0/315.0+x2*62.0/2835.0))));}
float latitudeDeltaFromMercator(float dy,float ea){float e=expm1Stable(dy);return 2.0*atanSmall(ea*e/(1.0+ea*ea*(1.0+e)));}
vec4 project(vec2 pixel,vec2 direction,float speed){
 float latitudeDelta=2.0-pixel.y*(3.0/1180.0),longitudeDelta=-2.5+pixel.x*0.0045;
 float latitude=55.0*RAD+latitudeDelta*RAD;
 // Local Mercator coordinates in metres keep Float32 precision near the race.
 float t0=3.171594802363213,td=tanSmall(latitudeDelta*RAD*0.5);
 vec2 point=vec2(longitudeDelta*RAD*RADIUS,(log1pStable(td/t0)-log1pStable(-t0*td))*RADIUS);
 float best=1e30,progress=0.0,bearing=0.0,raw=0.0;int nearest=-1;
 for(int i=0;i<legCount;i++){vec4 a=leg(i,0),b=leg(i,1),end=leg(i,2);float fraction=dot(point-a.xy,a.zw)/dot(a.zw,a.zw);vec2 foot=mix(a.xy,end.xy,clamp(fraction,0.0,1.0));float distance=dot(point-foot,point-foot);
  float tolerance=max(0.01,min(best,distance)*0.000002);bool interior=fraction>0.0&&fraction<1.0,oldInterior=raw>0.0&&raw<1.0;bool choose=nearest<0||distance<best-tolerance||(abs(distance-best)<=tolerance&&interior&&!oldInterior);
  if(choose){best=distance;nearest=i;raw=fraction;progress=b.x+clamp(fraction,0.0,1.0)*b.y;bearing=b.z;}}
 if(nearest<0||(nearest==0&&raw< -0.0000001)||(nearest==legCount-1&&raw>1.0000001))return vec4(-1.0,-1e20,-1e20,-1.0);
 vec4 routeA=leg(nearest,0),routeB=leg(nearest,1);float u=clamp(raw,0.0,1.0),dy=routeA.w/RADIUS;
 float along=abs(dy)<1e-8?u:latitudeDeltaFromMercator(dy*u,routeB.w)/latitudeDeltaFromMercator(dy,routeB.w);
 progress=u<=0.0?0.0:u>=1.0?leg(nearest,2).z-routeB.x:along*routeB.y;
 vec2 geographicDirection=vec2(direction.x*0.0045*cos(latitude),-direction.y*(3.0/1180.0));float length=length(geographicDirection);
 if(speed<0.0||(length<1e-12&&speed>0.0))return vec4(progress,-1e20,-1e20,float(nearest));
 float vmg=length>0.0?speed*dot(geographicDirection/length,vec2(sin(bearing),cos(bearing))):0.0;
 return vec4(progress,vmg,vmg==0.0?1e15:3600.0/(1852.0*abs(vmg)),float(nearest));
}
`;
  this.projection=this.program(projection+`
layout(location=0) in vec2 address;layout(location=1) in float divisions;
uniform bool denseMode;uniform highp sampler2D knotData;
out vec4 projected;out vec4 metadata;
void main(){int i=int(address.x);float u=address.y/max(1.0,divisions);vec4 a=src(i),b=src(i+1);vec2 p=a.xy,d=vec2(0.0);
 if(connected(i))cubic(i,u,p,d);else if(connected(i-1))d=slope(i);
 float speed=connected(i)?(a.w<0.0||b.w<0.0?-1.0:mix(a.w,b.w,u)):a.w;
 projected=project(p,d,speed);metadata=vec4(connected(i)?mix(a.z,b.z,u):a.z,float(i),connected(i)?1.0:0.0,0.0);
 // Time density uses the observed interval direction, as in the nominal app.
 if(denseMode){int width=textureSize(knotData,0).x,first=i*2,last=min(i+1,sourceCount-1)*2;float s0=texelFetch(knotData,ivec2(first%width,first/width),0).z,s1=texelFetch(knotData,ivec2(last%width,last/width),0).z;projected.z=s0<0.0||s1<0.0?-1e20:s0>=1e15||s1>=1e15?1e15:mix(s0,s1,u);}
 else{vec2 chord=connected(i)?interval(i).xy:connected(i-1)?interval(i-1).xy:vec2(0.0);projected.z=project(p,chord,speed).z;}
 metadata.w=projected.w>=0.0?leg(int(projected.w),1).x:0.0;
 if(!denseMode)metadata.z=projected.w>=0.0?floor((projected.x+metadata.w)/10.0+0.5):-1.0;
 if(!connected(i)&&!connected(i-1))projected.yz=vec2(-1e20);
}
`,['projected','metadata']);
  this.bounds=this.program(`uniform highp sampler2D denseData;uniform int denseCount;out vec2 bounds;
vec4 at(int i){int width=textureSize(denseData,0).x;int p=i*2;vec4 value=texelFetch(denseData,ivec2(p%width,p/width),0);p++;value.x+=texelFetch(denseData,ivec2(p%width,p/width),0).w;return value;}
void main(){int start=gl_VertexID*64;bounds=vec2(1e30,-1e30);for(int i=start;i<min(start+65,denseCount);i++){vec4 p=at(i);if(p.x>=0.0&&p.w>=0.0){bounds.x=min(bounds.x,p.x);bounds.y=max(bounds.y,p.x);}}}
`,['bounds']);
  const screen=`void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
  this.profile=this.program(screen,null,`
uniform highp sampler2D denseData;uniform highp sampler2D boundsData;uniform int denseCount;uniform int blockCount;uniform int stationCount;
out vec4 result;
vec4 at(int i,int word){int width=textureSize(denseData,0).x,p=i*2+word;return texelFetch(denseData,ivec2(p%width,p/width),0);}
vec2 block(int i){int width=textureSize(boundsData,0).x,p=i/2;vec4 value=texelFetch(boundsData,ivec2(p%width,p/width),0);return i%2==0?value.rg:value.ba;}
void main(){int station=int(gl_FragCoord.y)*1024+int(gl_FragCoord.x);result=vec4(-1e20,-1e20,0.0,0.0);if(station>=stationCount)return;
 float center=float(station)*10.0,low=center-5.0,high=center+5.0,total=0.0,weighted=0.0,meters=0.0,speed=-1e20;int direction=0;bool hasTime=false,speedDone=false;
 for(int group=0;group<blockCount;group++){
  vec2 range=block(group);
  if(range.y<low||range.x>high){if(meters>0.0){total+=weighted/meters;hasTime=true;}weighted=0.0;meters=0.0;direction=0;if(speed>=0.0)speedDone=true;continue;}
  for(int i=group*64;i<min(group*64+64,denseCount-1);i++){
   vec4 a=at(i,0),b=at(i+1,0),ta=at(i,1),tb=at(i+1,1);float from=a.x-(center-ta.w),to=b.x-(center-tb.w),delta=to-from;
   if(tb.x==ta.x&&tb.y-ta.y<=1.0)continue;
   bool valid=a.x>=0.0&&b.x>=0.0&&a.w>=0.0&&b.w>=0.0&&(abs(a.w-b.w)<=1.0||abs(delta)<=10.0)&&tb.x>ta.x&&tb.x-ta.x<=300.0&&ta.z>0.0&&tb.y-ta.y<=1.0;
   int signDelta=delta>0.0?1:delta<0.0?-1:0;
   if(!valid||signDelta!=direction){if(meters>0.0){total+=weighted/meters;hasTime=true;}weighted=0.0;meters=0.0;if(speed>=0.0)speedDone=true;direction=valid?signDelta:0;}
   if(!valid)continue;
   float begin=max(-5.0,min(from,to)),end=min(5.0,max(from,to));
   if(end<=begin){if(meters>0.0){total+=weighted/meters;hasTime=true;weighted=0.0;meters=0.0;}if(speed>=0.0)speedDone=true;
    if(delta==0.0&&abs(from)<=5.0&&a.z>=0.0&&b.z>=0.0){total+=(tb.x-ta.x)/10.0;hasTime=true;}continue;}
   if(delta>0.0&&a.y> -1e19&&b.y> -1e19&&!speedDone){float u=clamp(-from/delta,0.0,1.0);speed=max(0.0,mix(a.y,b.y,u));if(from<=0.0&&to>=0.0)speedDone=true;}
   if(a.z>=0.0&&b.z>=0.0){float u=clamp(((begin+end)*0.5-from)/delta,0.0,1.0);float density=a.z>=1e15||b.z>=1e15?1e15:mix(a.z,b.z,u);weighted+=density*(end-begin);meters+=end-begin;}
  }
 }
 if(meters>0.0){total+=weighted/meters;hasTime=true;}result=vec4(speed,hasTime?min(total,1e15):-1e20,0.0,0.0);
}
`);
  this.comparison=this.program(screen,null,`
uniform highp sampler2D knotData;uniform highp sampler2D referenceData;uniform int pointCount;uniform int stationCount;uniform vec2 handicaps;
out vec4 result;
void main(){int i=int(gl_FragCoord.y)*1024+int(gl_FragCoord.x);result=vec4(-1e20);if(pointCount<=0||i>pointCount)return;int p=min(i,pointCount-1)*2,width=textureSize(knotData,0).x;vec4 own=texelFetch(knotData,ivec2(p%width,p/width),0);
 vec4 meta=texelFetch(knotData,ivec2((p+1)%width,(p+1)/width),0);int station=int(meta.z);if(own.x<0.0||station<0||station>=stationCount)return;vec2 ref=texelFetch(referenceData,ivec2(station%1024,station/1024),0).rg;
 if(own.y> -1e19&&ref.x>=0.0){result.x=own.y-ref.x;float factor=1.0+(handicaps.y-handicaps.x)*own.y/3600.0;if(handicaps.x>0.0&&handicaps.y>0.0&&factor>0.0)result.y=own.y/factor-ref.x;}
 if(own.z>=0.0&&ref.y>=0.0&&!(own.z>=1e15&&ref.y>=1e15))result.z=100.0*(ref.y-own.z);
}
`);
  const route=new Float32Array(Math.max(1,rhumbRoute.legs.length)*12),originY=mercatorLatitude(55);
  for(const leg of rhumbRoute.legs){const offset=leg.index*12;route.set([(leg.a[0]-12)*NAV_RAD*6371008.8,(mercatorLatitude(leg.a[1])-originY)*6371008.8,leg.dx*6371008.8,leg.dy*6371008.8,leg.start*1852,leg.distance*1852,leg.bearing*NAV_RAD,Math.exp(mercatorLatitude(leg.a[1])),(leg.b[0]-12)*NAV_RAD*6371008.8,(mercatorLatitude(leg.b[1])-originY)*6371008.8,(leg.start+leg.distance)*1852,0],offset);}
  this.route=this.texture(3,Math.max(1,rhumbRoute.legs.length),route);
 }
 program(vertex,varyings,fragment){
  const gl=this.gl,program=gl.createProgram(),prefix='#version 300 es\nprecision highp float;precision highp int;\n';
  for(const [type,body] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment||'out vec4 colour;void main(){colour=vec4(0.0); }']]){
   const shader=gl.createShader(type);gl.shaderSource(shader,prefix+body);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  if(varyings)gl.transformFeedbackVaryings(program,varyings,gl.INTERLEAVED_ATTRIBS);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));return program;
 }
 uniform(program,name,value){const gl=this.gl,location=gl.getUniformLocation(program,name);gl.uniform1i(location,value);}
 check(label){const error=this.gl.getError();if(error)throw Error(label+': '+error);}
 bind(program,name,texture,unit){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);this.uniform(program,name,unit);}
 texture(width,height,data=null){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||Math.max(width,height)>this.maxTextureSize)throw Error('Track data exceeds the GPU texture limit.');
  const gl=this.gl,texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,width,height);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);if(data)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.FLOAT,data);return texture;
 }
 feedbackRun(program,count,bytes,setup=()=>{}){
  const gl=this.gl,buffer=gl.createBuffer();this.check('before feedback');gl.useProgram(program);gl.bindVertexArray(this.vao);setup();this.check('setup feedback');
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,bytes,program===this.counts?gl.STREAM_READ:gl.STATIC_COPY);gl.bindBuffer(gl.ARRAY_BUFFER,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,this.feedback);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,buffer);
  gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);this.check('begin feedback');gl.drawArrays(gl.POINTS,0,count);this.check('draw feedback');gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.bindVertexArray(null);this.check('feedback '+(program===this.counts?'counts':program===this.bounds?'bounds':program===this.geometry?'geometry':'projection'));return buffer;
 }
 fromBuffer(buffer,texels){const gl=this.gl,width=Math.min(1024,Math.max(1,texels)),height=Math.max(1,Math.ceil(texels/width)),texture=this.texture(width,height);
  // The feedback buffers include zeroed row padding.
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,buffer);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.FLOAT,0);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,null);this.check('buffer to texture');return texture;
 }
 padded(texels){const width=Math.min(1024,Math.max(1,texels));return width*Math.max(1,Math.ceil(texels/width))*16;}
 draw(program,target,width,height,setup){const gl=this.gl;gl.useProgram(program);gl.bindVertexArray(this.vao);gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete float framebuffer');gl.viewport(0,0,width,height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);setup();gl.drawArrays(gl.TRIANGLES,0,3);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);}
 prepare(boat){
  const gl=this.gl,n=boat.points.length;
  if(n===0){this.prepareEmpty(boat);return;}
  const width=Math.min(1024,Math.max(2,n*2)),height=Math.ceil(n*2/width),raw=new Float32Array(width*height*4),caps=[];
  const connects=i=>i>=0&&i+1<n&&boat.points[i+1][2]>boat.points[i][2]&&boat.points[i+1][2]-boat.points[i][2]<=300;
  for(let i=0;i<n;i++){const [x,y]=xy(boat.points[i]);const stamp=boat.points[i][2]-D.start,next=boat.points[i+1]||boat.points[i];raw.set([x,y,stamp,boat.speeds[i]??-1,(next[0]-boat.points[i][0])*1000/4.5,-(next[1]-boat.points[i][1])*1180/3,next[2]-boat.points[i][2],stamp-Math.fround(stamp)],i*8);const flags=connects(i)?(connects(i-1)?0:1)+(connects(i+1)?0:2):(connects(i-1)?0:3);if(flags&1)caps.push(i,-1);if(flags&2)caps.push(i,1);}
  const input=this.texture(width,height,raw),setSource=program=>{this.bind(program,'sourceData',input,5);this.uniform(program,'sourceCount',n);};
  const countBuffer=this.feedbackRun(this.counts,n,n*8,()=>setSource(this.counts)),counts=new Float32Array(n*2);gl.bindBuffer(gl.COPY_READ_BUFFER,countBuffer);gl.getBufferSubData(gl.COPY_READ_BUFFER,0,counts);gl.bindBuffer(gl.COPY_READ_BUFFER,null);gl.deleteBuffer(countBuffer);
  let count=0,curvature=0;for(let i=0;i<n;i++){
   if(!Number.isSafeInteger(counts[i*2])||counts[i*2]<0||!Number.isFinite(counts[i*2+1])||counts[i*2+1]<0)throw Error('Invalid GPU curve subdivision: '+boat.name);
   count+=counts[i*2]>0?counts[i*2]+1:0;curvature=Math.max(curvature,counts[i*2+1]);
  }
  if(count*2>1024*this.maxTextureSize)throw Error('Curve samples exceed the GPU texture limit: '+boat.name);
  this.denseSamples+=count;
  const address=new Float32Array(count*2),divisions=new Float32Array(count);let at=0;
  for(let i=0;i<n;i++)for(let step=0;counts[i*2]>0&&step<=counts[i*2];step++){address[at*2]=i;address[at*2+1]=step;divisions[at++]=counts[i*2];}
  const setAddresses=(addresses,steps)=>{for(const [index,values,size] of [[0,addresses,2],[1,steps,1]]){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,0,0);temporary.push(buffer);}};
  const temporary=[];
  let knots=null;
  const setProjection=(denseMode=false)=>{setSource(this.projection);this.bind(this.projection,'routeData',this.route,6);this.uniform(this.projection,'legCount',rhumbRoute.legs.length);this.uniform(this.projection,'denseMode',denseMode?1:0);this.bind(this.projection,'knotData',knots||input,7);};
  const knotAddress=new Float32Array(n*2);for(let i=0;i<n;i++)knotAddress[i*2]=i;
  const knotBuffer=this.feedbackRun(this.projection,n,this.padded(n*2),()=>{setProjection();setAddresses(knotAddress,new Float32Array(n).fill(1));});knots=this.fromBuffer(knotBuffer,n*2);gl.deleteBuffer(knotBuffer);for(const buffer of temporary.splice(0))gl.deleteBuffer(buffer);
  gl.bindVertexArray(this.vao);gl.disableVertexAttribArray(0);gl.disableVertexAttribArray(1);gl.bindVertexArray(null);
  const denseBuffer=this.feedbackRun(this.projection,count,this.padded(count*2),()=>{setProjection(true);setAddresses(address,divisions);}),dense=this.fromBuffer(denseBuffer,count*2);
  gl.deleteBuffer(denseBuffer);for(const buffer of temporary.splice(0))gl.deleteBuffer(buffer);
  // Disable the projection attributes before procedural gl_VertexID programs.
  gl.bindVertexArray(this.vao);gl.disableVertexAttribArray(0);gl.disableVertexAttribArray(1);gl.bindVertexArray(null);
  const blockCount=Math.ceil(count/64),boundBuffer=this.feedbackRun(this.bounds,blockCount,this.padded(Math.ceil(blockCount/2)),()=>{this.bind(this.bounds,'denseData',dense,5);this.uniform(this.bounds,'denseCount',count);});
  // RG bounds -> RGBA texture: each texel contains bounds for two blocks.
  const boundsPacked=this.fromBuffer(boundBuffer,Math.ceil(blockCount/2));gl.deleteBuffer(boundBuffer);
  // bounds() addresses the appropriate pair of lanes in this packed texture.
  const stationCount=referenceStationCount(),profile=this.texture(1024,Math.ceil(stationCount/1024));
  this.draw(this.profile,profile,1024,Math.ceil(stationCount/1024),()=>{this.bind(this.profile,'denseData',dense,5);this.bind(this.profile,'boundsData',boundsPacked,6);this.uniform(this.profile,'denseCount',count);this.uniform(this.profile,'blockCount',blockCount);this.uniform(this.profile,'stationCount',stationCount);});
  gl.deleteTexture(dense);gl.deleteTexture(boundsPacked);
  const geoBuffer=this.feedbackRun(this.geometry,n,this.padded(n*4),()=>setSource(this.geometry)),geometry=this.fromBuffer(geoBuffer,n*4);gl.deleteBuffer(geoBuffer);gl.deleteTexture(input);
  const capWidth=Math.max(1,Math.min(1024,caps.length/2)),capHeight=Math.max(1,Math.ceil(caps.length/2/capWidth)),capPixels=new Int32Array(capWidth*capHeight*2);capPixels.set(caps);const capTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,capTexture);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RG32I,capWidth,capHeight);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,capWidth,capHeight,gl.RG_INTEGER,gl.INT,capPixels);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  const comparisonHeight=Math.ceil((n+1)/1024),comparison=this.texture(1024,comparisonHeight),record={texture:geometry,capTexture,capCount:caps.length/2,curvature,comparisonTexture:comparison,comparisonWidth:1024,comparisonHeight,
   comparisonSamples:new Map(),bytes:this.padded(n*4)+capPixels.byteLength+this.padded(n*2)+1024*comparisonHeight*16+1024*Math.ceil(stationCount/1024)*16,profile,knots};
  this.records.set(boat.points,record);this.renderer.uploads++;this.cacheProfile(boat,record);
  const error=gl.getError();if(error)throw Error('GPU prepare '+boat.name+': '+error);
 }
 compare(){const gl=this.gl,reference=referenceBoat(),referenceRecord=this.records.get(reference.points);
  for(const boat of boats){const record=this.records.get(boat.points);this.draw(this.comparison,record.comparisonTexture,1024,record.comparisonHeight,()=>{
   this.bind(this.comparison,'knotData',record.knots,5);this.bind(this.comparison,'referenceData',referenceRecord.profile,6);this.uniform(this.comparison,'pointCount',boat.points.length);this.uniform(this.comparison,'stationCount',referenceStationCount());gl.uniform2f(gl.getUniformLocation(this.comparison,'handicaps'),boat.handicapSecondsPerNm||0,reference.handicapSecondsPerNm||0);
  });}this.renderer.comparisonReference=reference.points;gl.activeTexture(gl.TEXTURE0);
 }

 prepareEmpty(boat){
  const gl=this.gl,texture=this.texture(4,1),knots=this.texture(2,1),profile=this.texture(1024,Math.ceil(referenceStationCount()/1024));
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,profile,0);gl.clearBufferfv(gl.COLOR,0,new Float32Array([-1e20,-1e20,0,0]));gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const capTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,capTexture);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RG32I,1,1);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  const record={texture,knots,profile,capTexture,capCount:0,curvature:0,comparisonTexture:this.texture(1024,1),comparisonHeight:1,comparisonWidth:1024,comparisonSamples:new Map(),bytes:0};
  this.records.set(boat.points,record);this.renderer.uploads++;
  trackProfileCache.set(boat.points,{samples:new Float32Array([-1,0,-1e20]),timeSamples:new Float32Array([-1,-1e20]),stations:new Float32Array(referenceStationCount()).fill(-1e20),timeStations:new Float32Array(referenceStationCount()).fill(-1e20)});
 }
 cacheProfile(boat,record){
  const count=boat.points.length,stationCount=referenceStationCount(),knots=this.read(record.knots,Math.min(1024,count*2),Math.ceil(count*2/Math.min(1024,count*2))),reference=this.read(record.profile,1024,Math.ceil(stationCount/1024));
  const samples=new Float32Array((count+1)*3),timeSamples=new Float32Array((count+1)*2),stations=new Float32Array(stationCount),timeStations=new Float32Array(stationCount);
  for(let index=0;index<count;index++){
   const offset=index*8,station=knots[offset+6],progress=(knots[offset]+knots[offset+7])/1852,speed=knots[offset+1],time=knots[offset+2];
   const valid=station>=0&&station<stationCount,hasSpeed=valid&&speed> -1e19,hasTime=valid&&time>=0;
   samples.set([hasSpeed?station:-1,valid?progress:0,hasSpeed?speed:-1e20],index*3);
   timeSamples.set([hasTime?station:-1,hasTime?time:-1e20],index*2);
  }
  samples.set(samples.subarray((count-1)*3,count*3),count*3);timeSamples.set(timeSamples.subarray((count-1)*2,count*2),count*2);
  for(let i=0;i<stationCount;i++){stations[i]=reference[i*4];timeStations[i]=reference[i*4+1];if(!Number.isFinite(stations[i])||!Number.isFinite(timeStations[i]))throw Error('Ugyldig GPU-profil: '+boat.name);}
  trackProfileCache.set(boat.points,{samples,stations,timeSamples,timeStations});
 }
 comparisonValues(record,index,connects){
  const gl=this.gl,values=new Float32Array(connects?8:4);gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,record.comparisonTexture,0);
  for(let sample=0;sample<(connects?2:1);sample++){const at=index+sample;gl.readPixels(at%1024,Math.floor(at/1024),1,1,gl.RGBA,gl.FLOAT,values.subarray(sample*4,sample*4+4));}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);this.check('Læs sammenligningsværdi');return values;
 }
 async ready(){
  const gl=this.gl,sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
  try{for(;;){const status=gl.clientWaitSync(sync,0,0);if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)break;if(status===gl.WAIT_FAILED)throw Error('GPU-klargøring fejlede.');await new Promise(resolve=>setTimeout(resolve,0));}}finally{gl.deleteSync(sync);}
  this.check('Afslut GPU-klargøring');
 }
 read(texture,width,height){const gl=this.gl,pixels=new Float32Array(width*height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,pixels);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return pixels;}
}
