// WebGL 2 stages for the layouts documented in gpu-track-preparation.js.
const GPU_TRACK_SHADERS=(()=>{
 const source=`
uniform highp sampler2D sourceData;uniform int sourceCount;
vec4 src(int i){int width=textureSize(sourceData,0).x,p=clamp(i,0,sourceCount-1)*2;return texelFetch(sourceData,ivec2(p%width,p/width),0);}
vec4 interval(int i){int width=textureSize(sourceData,0).x,p=clamp(i,0,sourceCount-1)*2+1;return texelFetch(sourceData,ivec2(p%width,p/width),0);}
bool connected(int i){return i>=0&&i+1<sourceCount&&interval(i).z>0.0&&interval(i).z<=300.0;}
float endpoint(float h0,float h1,float d0,float d1){float v=((2.0*h0+h1)*d0-h0*d1)/(h0+h1);if(sign(v)!=sign(d0))return 0.0;return sign(d0)!=sign(d1)&&abs(v)>3.0*abs(d0)?3.0*d0:v;}
vec2 slope(int i){
 bool before=connected(i-1),after=connected(i);
 if(!before&&!after)return vec2(0.0);
 if(!before){float h=interval(i).z;vec2 delta=interval(i).xy/h;if(!connected(i+1))return delta;float hn=interval(i+1).z;vec2 dn=interval(i+1).xy/hn;return vec2(endpoint(h,hn,delta.x,dn.x),endpoint(h,hn,delta.y,dn.y));}
 if(!after){float h=interval(i-1).z;vec2 delta=interval(i-1).xy/h;if(!connected(i-2))return delta;float hp=interval(i-2).z;vec2 dp=interval(i-2).xy/hp;return vec2(endpoint(h,hp,delta.x,dp.x),endpoint(h,hp,delta.y,dp.y));}
 float h0=interval(i-1).z,h1=interval(i).z,w0=2.0*h1+h0,w1=h1+2.0*h0;vec2 d0=interval(i-1).xy/h0,d1=interval(i).xy/h1;
 return vec2(d0.x*d1.x>0.0?(w0+w1)/(w0/d0.x+w1/d1.x):0.0,d0.y*d1.y>0.0?(w0+w1)/(w0/d0.y+w1/d1.y):0.0);
}
void cubic(int i,float u,out vec2 p,out vec2 derivative){vec4 a=src(i);float h=interval(i).z;vec2 delta=interval(i).xy,m0=slope(i)*h,m1=slope(i+1)*h;float u2=u*u,u3=u2*u;p=a.xy+delta*(3.0*u2-2.0*u3)+m0*(u3-2.0*u2+u)+m1*(u3-u2);derivative=delta*(6.0*u-6.0*u2)+m0*(3.0*u2-4.0*u+1.0)+m1*(3.0*u2-2.0*u);}
`;
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
 // Float32 map coordinates can move an endpoint a few centimetres.
 if(nearest<0||(nearest==0&&raw*leg(0,1).y< -0.1)||(nearest==legCount-1&&(raw-1.0)*leg(nearest,1).y>0.1))return vec4(-1.0,-1e20,-1e20,-1.0);
 vec4 routeA=leg(nearest,0),routeB=leg(nearest,1);float u=clamp(raw,0.0,1.0),dy=routeA.w/RADIUS;
 float along=abs(dy)<1e-8?u:latitudeDeltaFromMercator(dy*u,routeB.w)/latitudeDeltaFromMercator(dy,routeB.w);
 progress=u<=0.0?0.0:u>=1.0?leg(nearest,2).z-routeB.x:along*routeB.y;
 vec2 geographicDirection=vec2(direction.x*0.0045*cos(latitude),-direction.y*(3.0/1180.0));float length=length(geographicDirection);
 if(speed<0.0||(length<1e-12&&speed>0.0))return vec4(progress,-1e20,-1e20,float(nearest));
 float vmg=length>0.0?speed*dot(geographicDirection/length,vec2(sin(bearing),cos(bearing))):0.0;
 return vec4(progress,vmg,vmg==0.0?1e15:3600.0/(1852.0*abs(vmg)),float(nearest));
}
`;
 const screen=`void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
 return {
  counts:{vertex:source+`
out vec2 counts;
void main(){int i=gl_VertexID;counts=vec2(0.0);if(!connected(i))return;float h=interval(i).z;vec2 m0=slope(i)*h,m1=slope(i+1)*h,delta=interval(i).xy;
 vec2 metric=vec2(500.94,282.9916);float bound=max(length(m0/3.0*metric),max(length((delta-(m0+m1)/3.0)*metric),length(m1/3.0*metric)))*3.0;
 counts.x=max(1.0,ceil(bound/8.0));counts.y=max(length(6.0*delta-4.0*m0-2.0*m1),length(-6.0*delta+2.0*m0+4.0*m1));}
`,varyings:["counts"]},
  geometry:{vertex:source+`
out vec4 g0;out vec4 g1;out vec4 g2;out vec4 g3;
void main(){int i=gl_VertexID;vec4 a=src(i),b=src(i+1);bool next=connected(i),previous=connected(i-1);float h=next?interval(i).z:0.0;
 g0=vec4(a.xy,0.0,0.0);g1=next?vec4(interval(i).xy,slope(i)*h):vec4(0.0);g2=vec4(next?slope(i+1)*h:vec2(0.0),a.w,next?b.w:a.w);
 float flags=next?float(!previous)+2.0*float(!connected(i+1)):(previous?0.0:3.0);g3=vec4(a.z,h,interval(i).w,flags);}
`,varyings:["g0", "g1", "g2", "g3"]},
  projection:{vertex:projection+`
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
`,varyings:["projected", "metadata"]},
  bounds:{vertex:`uniform highp sampler2D denseData;uniform int denseCount;out vec2 bounds;
vec4 at(int i){int width=textureSize(denseData,0).x;int p=i*2;vec4 value=texelFetch(denseData,ivec2(p%width,p/width),0);p++;value.x+=texelFetch(denseData,ivec2(p%width,p/width),0).w;return value;}
void main(){int start=gl_VertexID*64;bounds=vec2(1e30,-1e30);for(int i=start;i<min(start+65,denseCount);i++){vec4 p=at(i);if(p.x>=0.0&&p.w>=0.0){bounds.x=min(bounds.x,p.x);bounds.y=max(bounds.y,p.x);}}}
`,varyings:["bounds"]},
  profile:{vertex:screen,fragment:`
uniform highp sampler2D denseData;uniform highp sampler2D boundsData;uniform int denseCount;uniform int blockCount;uniform int stationCount;
out vec4 result;
vec4 at(int i,int word){int width=textureSize(denseData,0).x,p=i*2+word;return texelFetch(denseData,ivec2(p%width,p/width),0);}
vec2 block(int i){int width=textureSize(boundsData,0).x,p=i/2;vec4 value=texelFetch(boundsData,ivec2(p%width,p/width),0);return i%2==0?value.rg:value.ba;}
void main(){int station=int(gl_FragCoord.y)*1024+int(gl_FragCoord.x);result=vec4(-1e20,-1e20,0.0,0.0);if(station>=stationCount)return;
 float center=float(station)*10.0,low=center-5.0,high=center+5.0,total=0.0,weighted=0.0,meters=0.0,speed=-1e20,speedTime=-1.0,speedSpan=0.0,extreme=0.0;int direction=0;bool hasTime=false,speedDone=false,infiniteTime=false;
 for(int group=0;group<blockCount;group++){
  vec2 range=block(group);
  if(range.y<low||range.x>high){if(meters>0.0){total+=weighted/meters;hasTime=true;}weighted=0.0;meters=0.0;direction=0;if(speed>=0.0)speedDone=true;continue;}
  for(int i=group*64;i<min(group*64+64,denseCount-1);i++){
   vec4 a=at(i,0),b=at(i+1,0),ta=at(i,1),tb=at(i+1,1);float from=a.x-(center-ta.w),to=b.x-(center-tb.w),delta=to-from;
   if(tb.x==ta.x&&tb.y-ta.y<=1.0)continue;
   bool valid=a.x>=0.0&&b.x>=0.0&&a.w>=0.0&&b.w>=0.0&&(abs(a.w-b.w)<=1.0||abs(delta)<=10.0)&&tb.x>ta.x&&tb.x-ta.x<=300.0&&ta.z>0.0&&tb.y-ta.y<=1.0;
   int signDelta=delta>0.0?1:delta<0.0?-1:0;
   // A plateau (including Float32-equal neighbours) does not end a passage.
   // Keep its pending distance-weighted density; add only the actual dwell time.
   if(valid&&delta==0.0){if(abs(from)<=5.0&&a.z>=0.0&&b.z>=0.0){total+=(tb.x-ta.x)/10.0;hasTime=true;}continue;}
   // A reversal must move 20cm away from the passage's extreme, beyond the
   // centimetre-scale Float32 projection noise. Small consistent motion still
   // accumulates until it crosses this threshold; it cannot get stuck forever.
   if(valid&&direction!=0&&signDelta!=direction&&abs(to-extreme)<=0.2)continue;
   if(!valid||signDelta!=direction){if(meters>0.0){total+=weighted/meters;hasTime=true;}weighted=0.0;meters=0.0;if(speed>=0.0)speedDone=true;direction=valid?signDelta:0;extreme=to;}
   if(!valid)continue;
   extreme=direction>0?max(extreme,to):min(extreme,to);
   float begin=max(-5.0,min(from,to)),end=min(5.0,max(from,to));
   if(end<=begin){if(meters>0.0){total+=weighted/meters;hasTime=true;weighted=0.0;meters=0.0;}if(speed>=0.0)speedDone=true;
    continue;}
   if(delta>0.0&&a.y> -1e19&&b.y> -1e19&&!speedDone){float u=clamp(-from/delta,0.0,1.0);speed=max(0.0,mix(a.y,b.y,u));speedTime=mix(ta.x,tb.x,u);speedSpan=tb.x-ta.x;if(from<=0.0&&to>=0.0)speedDone=true;}
   if(a.z>=0.0&&b.z>=0.0){float u=clamp(((begin+end)*0.5-from)/delta,0.0,1.0);bool overflow=a.z>=1e15||b.z>=1e15;infiniteTime=infiniteTime||overflow;float density=overflow?1e15:mix(a.z,b.z,u);weighted+=density*(end-begin);meters+=end-begin;}
  }
 }
 if(meters>0.0){total+=weighted/meters;hasTime=true;}result=vec4(speed,hasTime?(infiniteTime?1e15:min(total,1e15)):-1e20,speedTime,speedSpan);
}
`},
  comparison:{vertex:screen,fragment:`
uniform highp sampler2D knotData;uniform highp sampler2D referenceData;uniform int pointCount;uniform int stationCount;uniform vec2 handicaps;
out vec4 result;
void main(){int i=int(gl_FragCoord.y)*1024+int(gl_FragCoord.x);result=vec4(-1e20);if(pointCount<=0||i>pointCount)return;int p=min(i,pointCount-1)*2,width=textureSize(knotData,0).x;vec4 own=texelFetch(knotData,ivec2(p%width,p/width),0);
 vec4 meta=texelFetch(knotData,ivec2((p+1)%width,(p+1)/width),0);int station=int(meta.z);if(own.x<0.0||station<0||station>=stationCount)return;vec2 ref=texelFetch(referenceData,ivec2(station%1024,station/1024),0).rg;
 if(own.y> -1e19&&ref.x>=0.0){result.x=own.y-ref.x;float factor=1.0+(handicaps.y-handicaps.x)*own.y/3600.0;if(handicaps.x>0.0&&handicaps.y>0.0&&factor>0.0)result.y=own.y/factor-ref.x;}
 if(own.z>=0.0&&ref.y>=0.0&&!(own.z>=1e15&&ref.y>=1e15))result.z=100.0*(ref.y-own.z);
}
`},
 };
})();
