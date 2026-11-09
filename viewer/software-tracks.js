// Depth-buffered fallback for PCs without WebGL. Rasterise at the output resolution,
// with 2x sampling for antialiasing; retain every source interval and cubic curve.
class SoftwareTrackRenderer {
 constructor(layer){
  this.host=el('foreignObject',{'data-software-tracks':'','pointer-events':'none'},layer);
  this.canvas=document.createElement('canvas');this.canvas.style.cssText='display:block;width:100%;height:100%;pointer-events:none';
  this.host.append(this.canvas);this.context=this.canvas.getContext('2d');
  this.samples=document.createElement('canvas');this.sampleContext=this.samples.getContext('2d');
  this.palette=[[138,148,155],...TRACK_SPEED_COLOURS.map(colour=>colour.match(/\d+/g).map(Number))];
  this.outline=[23,49,62];
  this.lastKey=null;
 }
 prepare(boat){getTrackModel(boat.points);}
 hide(){if(this.host.getAttribute('display')!=='none')this.host.setAttribute('display','none');}
 capsule(ax,ay,bx,by,from,to,s0,s1,rank){
  const w=this.samples.width,h=this.samples.height,r=this.outer;
  const left=Math.max(0,Math.floor(Math.min(ax,bx)-r)),right=Math.min(w-1,Math.ceil(Math.max(ax,bx)+r));
  const top=Math.max(0,Math.floor(Math.min(ay,by)-r)),bottom=Math.min(h-1,Math.ceil(Math.max(ay,by)+r));
  const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy,outer2=r*r,inner2=this.inner*this.inner;
  const data=this.pixels.data,depth=this.depth,owner=this.owner,kind=this.kind;
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const u=length>1e-12?Math.max(0,Math.min(1,((x+.5-ax)*dx+(y+.5-ay)*dy)/length)):1;
   const px=x+.5-ax-u*dx,py=y+.5-ay-u*dy,distance=px*px+py*py;
   if(distance>outer2)continue;
   const time=from+(to-from)*u,index=y*w+x,fill=distance<=inner2?1:0;
   if(time<depth[index]||(time===depth[index]&&(rank<owner[index]||(rank===owner[index]&&fill<kind[index]))))continue;
   depth[index]=time;owner[index]=rank;kind[index]=fill;
   const speed=s0<0||s1<0?-1:s0+(s1-s0)*u;
   const bin=speed<0?0:1+Math.round(Math.min(15,speed)*127/15);
   const colour=fill?this.palette[bin]:this.outline,offset=index*4;
   data[offset]=colour[0];data[offset+1]=colour[1];data[offset+2]=colour[2];data[offset+3]=255;
  }
 }
 cubic(p,from,to,s0,s1,rank,level=0){
  const r=this.outer,w=this.samples.width,h=this.samples.height;
  if(Math.max(p[0],p[2],p[4],p[6])<-r||Math.min(p[0],p[2],p[4],p[6])>w+r||
   Math.max(p[1],p[3],p[5],p[7])<-r||Math.min(p[1],p[3],p[5],p[7])>h+r)return;
  // Bound parametric error, not just distance from a straight line: time must
  // interpolate accurately even on a straight curve with non-uniform velocity.
  const dx=p[6]-p[0],dy=p[7]-p[1];
  const error=Math.max(Math.hypot(p[2]-p[0]-dx/3,p[3]-p[1]-dy/3),Math.hypot(p[4]-p[0]-2*dx/3,p[5]-p[1]-2*dy/3));
  if(error<=.25||level>=12){this.capsule(p[0],p[1],p[6],p[7],from,to,s0,s1,rank);this.segments++;return;}
  const a=(p[0]+p[2])/2,b=(p[1]+p[3])/2,c=(p[2]+p[4])/2,d=(p[3]+p[5])/2,e=(p[4]+p[6])/2,f=(p[5]+p[7])/2;
  const g=(a+c)/2,i=(b+d)/2,j=(c+e)/2,k=(d+f)/2,x=(g+j)/2,y=(i+k)/2;
  const mid=(from+to)/2,speed=(s0+s1)/2;
  this.cubic([p[0],p[1],a,b,g,i,x,y],from,mid,s0,speed,rank,level+1);
  this.cubic([x,y,j,k,e,f,p[6],p[7]],mid,to,speed,s1,rank,level+1);
 }
 render(time,order,force=false,viewportOverride=null){
  this.time=time;this.order=order;
  const viewport=viewportOverride||mapViewport();if(!viewport)return;
  const {matrix,rect,pixelWidth:width,pixelHeight:height,bounds}=viewport;
  const viewportKey=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f,rect.left,rect.top,rect.width,rect.height,width,height].join(':');
  const key=[time,viewportKey,...order.map(boat=>boat.id)].join(':');
  if(this.host.hasAttribute('display'))this.host.removeAttribute('display');
  if(!force&&key===this.lastKey)return;
  this.lastKey=key;
  if(this.viewportKey!==viewportKey){positionMapCanvas(this.host,this.canvas,viewport);this.viewportKey=viewportKey;}
  // PNG is already requested at 2x CSS resolution; avoid quadrupling its memory again.
  const sampling=viewportOverride?1:2,sw=width*sampling,sh=height*sampling;
  if(this.samples.width!==sw||this.samples.height!==sh){
   this.samples.width=sw;this.samples.height=sh;
   this.pixels=this.sampleContext.createImageData(sw,sh);
   this.depth=new Float64Array(sw*sh);this.owner=new Int16Array(sw*sh);this.kind=new Uint8Array(sw*sh);
  }
  this.depth.fill(-Infinity);this.owner.fill(-1);this.kind.fill(0);this.pixels.data.fill(0);this.segments=0;this.intervals=0;
  const scale=sw/rect.width,sy=sh/rect.height;
  this.outer=TRACK_OUTLINE_WIDTH/2*scale;this.inner=TRACK_STROKE_WIDTH/2*scale;
  const project=point=>{
   const [x,y]=xy(point);
   return [(matrix.a*x+matrix.c*y+matrix.e-rect.left)*scale,(matrix.b*x+matrix.d*y+matrix.f-rect.top)*sy];
  };
  const velocity=(lon,lat)=>[(matrix.a*lon*1000/4.5-matrix.c*lat*1180/3)*scale,(matrix.b*lon*1000/4.5-matrix.d*lat*1180/3)*sy];
  const padLon=4/Math.abs(matrix.a)*4.5/1000,padLat=4/Math.abs(matrix.d)*3/1180;
  for(const [rank,boat] of order.entries()){
   const {points,speeds}=boat,model=getTrackModel(points);
   const first=Math.max(0,timeBoundary(points,time-7200)-1),last=timeBoundary(points,time,true);
   for(let n=first;n<last;n++){
    const a=points[n],b=points[n+1],duration=b?b[2]-a[2]:0,valid=b&&duration>0&&duration<=TRACK_MAX_GAP;
    const end=valid?b:a;
    if(Math.max(a[0],end[0])<bounds.west-padLon||Math.min(a[0],end[0])>bounds.east+padLon||
     Math.max(a[1],end[1])<bounds.south-padLat||Math.min(a[1],end[1])>bounds.north+padLat)continue;
    const s0=Number.isFinite(speeds?.[n])&&speeds[n]>=0?speeds[n]:-1;
    if(!valid){if(a[2]>=time-7200){const p=project(a);this.capsule(...p,...p,a[2]-time,a[2]-time,s0,s0,rank);}continue;}
    const from=Math.max(time-7200,a[2]),to=Math.min(time,b[2]);if(to<=from)continue;
    const start=from===a[2]?{point:a,velocity:model.slopes.map(s=>s[n])}:trackValue(points,n,from,model);
    const stop=to===b[2]?{point:b,velocity:model.slopes.map(s=>s[n+1])}:trackValue(points,n,to,model);
    const p=project(start.point),q=project(stop.point),v=velocity(...start.velocity),z=velocity(...stop.velocity),dt=(to-from)/3;
    const s1=Number.isFinite(speeds?.[n+1])&&speeds[n+1]>=0?speeds[n+1]:-1;
    const speed=t=>s0<0||s1<0?-1:s0+(s1-s0)*(t-a[2])/duration;
    this.cubic([p[0],p[1],p[0]+v[0]*dt,p[1]+v[1]*dt,q[0]-z[0]*dt,q[1]-z[1]*dt,...q],from-time,to-time,speed(from),speed(to),rank);
    this.intervals++;
   }
  }
  this.sampleContext.putImageData(this.pixels,0,0);
  this.context.clearRect(0,0,width,height);this.context.drawImage(this.samples,0,0,width,height);
 }
 redraw(){if(this.order)this.render(this.time,this.order);}
 snapshot(time,order,scale=2){
  const viewport=mapViewport();
  try{
   this.render(time,order,true,{...viewport,pixelWidth:Math.round(viewport.rect.width*scale),pixelHeight:Math.round(viewport.rect.height*scale)});
   return this.canvas.toDataURL('image/png');
  }finally{this.render(time,order,true);}
 }
}
const softwareTracks=new SoftwareTrackRenderer($('routes'));
