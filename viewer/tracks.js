// Shape-preserving cubic Hermite interpolation (PCHIP) in source time.
// Every observation is an interpolation knot. SVG renders the cubic curves at
// the current zoom instead of baking a fixed number of intermediate pixels.
const TRACK_MAX_GAP=300;
const trackModelCache=new WeakMap();
const TRACK_SPEED_MAX=15,TRACK_SPEED_BINS=128,TRACK_SPEED_MISSING='#8a949b';
const trackSpeedCache=new WeakMap();
const trackOutlineCache=new WeakMap();
function trackSpeedColour(speed){
 if(!Number.isFinite(speed)||speed<0)return TRACK_SPEED_MISSING;
 const x=Math.max(0,Math.min(1,speed/TRACK_SPEED_MAX));
 const channel=center=>Math.round(255*Math.max(0,Math.min(1,1.5-Math.abs(4*x-center))));
 return `rgb(${channel(3)},${channel(2)},${channel(1)})`;
}
const TRACK_SPEED_COLOURS=Array.from({length:TRACK_SPEED_BINS},(_,bin)=>trackSpeedColour(bin*TRACK_SPEED_MAX/(TRACK_SPEED_BINS-1)));
function speedBin(speed){
 return !Number.isFinite(speed)||speed<0?-1:Math.round(Math.min(TRACK_SPEED_MAX,speed)/TRACK_SPEED_MAX*(TRACK_SPEED_BINS-1));
}
function trackCurvePiece(points,i,from,to,model){
 const a=points[i],b=points[i+1];
 const first=from===a[2]?{point:a,velocity:model.slopes.map(s=>s[i])}:trackValue(points,i,from,model);
 const last=to===b[2]?{point:b,velocity:model.slopes.map(s=>s[i+1])}:trackValue(points,i,to,model);
 const dt=(to-from)/3;
 const c1=xy([first.point[0]+first.velocity[0]*dt,first.point[1]+first.velocity[1]*dt]);
 const c2=xy([last.point[0]-last.velocity[0]*dt,last.point[1]-last.velocity[1]*dt]);
 return 'M'+xy(first.point).join(',')+' C'+[...c1,...c2,...xy(last.point)].join(',');
}
function colouredTrackInterval(points,speeds,i,from,to,model){
 const a=points[i],b=points[i+1],s0=speeds?.[i],s1=speeds?.[i+1];
 if(speedBin(s0)<0||speedBin(s1)<0)return [{bin:-1,from,to,d:trackCurvePiece(points,i,from,to,model)}];
 const cuts=[from,to],h=b[2]-a[2];
 // Interpolate the recorded speed, never the derivative of the position curve.
 // Split the exact cubic at colour boundaries; no spatial sampling is needed.
 if(s0!==s1)for(let bin=0;bin<TRACK_SPEED_BINS-1;bin++){
  const threshold=(bin+.5)*TRACK_SPEED_MAX/(TRACK_SPEED_BINS-1);
  const time=a[2]+(threshold-s0)/(s1-s0)*h;
  if(time>from&&time<to)cuts.push(time);
 }
 cuts.sort((a,b)=>a-b);
 const segments=[];
 for(let j=1;j<cuts.length;j++){
  const start=cuts[j-1],end=cuts[j];if(end<=start)continue;
  const speed=s0+(s1-s0)*(((start+end)/2-a[2])/h);
  segments.push({bin:speedBin(speed),from:start,to:end,d:trackCurvePiece(points,i,start,end,model)});
 }
 return segments;
}
function getTrackSpeedCache(points,speeds){
 let cache=trackSpeedCache.get(points);
 if(!cache||cache.speeds!==speeds){
  cache={speeds,intervals:new Map(),pointBins:Int16Array.from(points,(_,i)=>speedBin(speeds?.[i]))};
  trackSpeedCache.set(points,cache);
 }
 return cache;
}
// Prepare the whole voyage before playback, then retain it for reverse seeks.
function prepareBoatTrack(boat){
 if(typeof webglTracks!=='undefined'&&webglTracks.active){webglTracks.prepare(boat);return;}
 const {points,speeds}=boat,cache=getTrackSpeedCache(points,speeds);
 if(cache.prepared)return;
 const model=getTrackModel(points);
 const outline=trackOutlineCache.get(points)||new Map();
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1],h=b[2]-a[2];
  if(h<=0||h>TRACK_MAX_GAP)continue;
  if(!outline.has(i))outline.set(i,trackCurvePiece(points,i,a[2],b[2],model));
  if(!cache.intervals.has(i))cache.intervals.set(i,colouredTrackInterval(points,speeds,i,a[2],b[2],model));
 }
 cache.prepared=true;trackOutlineCache.set(points,outline);trackSpeedCache.set(points,cache);
}
function prepareSelectedTracks(){
 for(const boat of boats)if(chosen.has(boat.name))prepareBoatTrack(boat);
}
function trackSpeedGeometry(points,speeds,start,end){
 if(!points.length||end<start)return [];
 const model=getTrackModel(points),buckets=new Map();
 const cache=getTrackSpeedCache(points,speeds);
 function add(bin,d){if(!buckets.has(bin))buckets.set(bin,[]);buckets.get(bin).push(d);}
 const first=Math.max(0,timeBoundary(points,start)-1),last=timeBoundary(points,end,true);
 for(let i=first;i<last;i++){
  const a=points[i],b=points[i+1],h=b?b[2]-a[2]:0;
  if(b&&h>0&&h<=TRACK_MAX_GAP){
   const from=Math.max(start,a[2]),to=Math.min(end,b[2]);if(to<=from)continue;
   let segments=cache.intervals.get(i);
   if(!segments){
    segments=colouredTrackInterval(points,speeds,i,a[2],b[2],model);
    cache.intervals.set(i,segments);
   }
   // Clip the fixed colour pieces; never choose new colours for the moving ends.
   for(const segment of segments){
    const lo=Math.max(from,segment.from),hi=Math.min(to,segment.to);
    if(hi<=lo)continue;
    add(segment.bin,lo===segment.from&&hi===segment.to?segment.d:trackCurvePiece(points,i,lo,hi,model));
   }
  }else if(a[2]>=start){const p=xy(a).join(',');add(cache.pointBins[i],'M'+p+'L'+p);}
 }
 // Stable paint order also keeps colours stable where thick strokes overlap.
 return [...buckets].sort(([a],[b])=>a-b).map(([bin,paths])=>({bin,colour:bin<0?TRACK_SPEED_MISSING:TRACK_SPEED_COLOURS[bin],d:paths.join(' ')}));
}
function renderTrackSpeedLegend(){
 const layer=$('trackSpeedLegend');layer.replaceChildren();
 const map=$('map'),rect=map.getBoundingClientRect(),matrix=map.getScreenCTM();if(!matrix)return;
 const point=new DOMPoint(rect.left+12,rect.top+12).matrixTransform(matrix.inverse());
 const group=screenGroup(point.x,point.y,layer),width=Math.max(110,Math.min(230,rect.width-24));
 group.setAttribute('transform',`translate(${point.x} ${point.y}) scale(${1/Math.hypot(matrix.a,matrix.b)})`);
 el('rect',{width,height:63,rx:5,fill:'#ffffff',opacity:.94},group);
 el('text',{x:10,y:17,fill:'#173d4c','font-size':11,'font-weight':650},group).textContent='Bådfart · SOG · knob';
 const gradient=el('linearGradient',{id:'trackSpeedJetGradient',x1:0,x2:1,y1:0,y2:0},el('defs',{},group));
 for(let i=0;i<=128;i++)el('stop',{offset:i/128,'stop-color':trackSpeedColour(TRACK_SPEED_MAX*i/128)},gradient);
 el('rect',{x:10,y:24,width:width-20,height:13,fill:'url(#trackSpeedJetGradient)'},group);
 for(const value of [0,5,10,15]){
  const x=10+(width-20)*value/TRACK_SPEED_MAX;
  el('line',{x1:x,x2:x,y1:37,y2:41,stroke:'#173d4c'},group);
  el('text',{x,y:54,fill:'#173d4c','font-size':11,'text-anchor':value===0?'start':value===15?'end':'middle'},group).textContent=value===15?'15+':value;
 }
}

function endpointSlope(h0,h1,d0,d1){
 const slope=((2*h0+h1)*d0-h0*d1)/(h0+h1);
 if(Math.sign(slope)!==Math.sign(d0))return 0;
 return Math.sign(d0)!==Math.sign(d1)&&Math.abs(slope)>3*Math.abs(d0)?3*d0:slope;
}

function getTrackModel(points){
 if(trackModelCache.has(points))return trackModelCache.get(points);
 const slopes=[new Float64Array(points.length),new Float64Array(points.length)];
 let start=0;
 while(start<points.length){
  let end=start;
  while(end+1<points.length&&points[end+1][2]>points[end][2]&&points[end+1][2]-points[end][2]<=TRACK_MAX_GAP)end++;
  if(end>start)for(let axis=0;axis<2;axis++){
   const slope=slopes[axis],h=i=>points[i+1][2]-points[i][2],d=i=>(points[i+1][axis]-points[i][axis])/h(i);
   if(end===start+1){slope[start]=slope[end]=d(start);continue;}
   slope[start]=endpointSlope(h(start),h(start+1),d(start),d(start+1));
   slope[end]=endpointSlope(h(end-1),h(end-2),d(end-1),d(end-2));
   for(let i=start+1;i<end;i++){
    const before=d(i-1),after=d(i);
    if(!before||!after||Math.sign(before)!==Math.sign(after)){slope[i]=0;continue;}
    const w1=2*h(i)+h(i-1),w2=h(i)+2*h(i-1);
    slope[i]=(w1+w2)/(w1/before+w2/after);
   }
  }
  start=end+1;
 }
 const model={slopes};trackModelCache.set(points,model);return model;
}

function trackValue(points,index,time,model=getTrackModel(points)){
 const a=points[index],b=points[index+1],h=b[2]-a[2],u=Math.max(0,Math.min(1,(time-a[2])/h));
 const u2=u*u,u3=u2*u,point=[0,0,time],velocity=[0,0];
 for(let axis=0;axis<2;axis++){
  const delta=b[axis]-a[axis],m0=model.slopes[axis][index],m1=model.slopes[axis][index+1];
  point[axis]=a[axis]+delta*(3*u2-2*u3)+h*(m0*(u3-2*u2+u)+m1*(u3-u2));
  velocity[axis]=delta*(6*u-6*u2)/h+m0*(3*u2-4*u+1)+m1*(3*u2-2*u);
 }
 return {point,velocity};
}

function trackPosition(points,time){
 const index=timeBoundary(points,time,true)-1;if(index<0)return null;
 const a=points[index],b=points[index+1];
 if(time-a[2]>TRACK_MAX_GAP)return null;
 if(time===a[2]||!b||b[2]-a[2]>TRACK_MAX_GAP||b[2]<=a[2])return {point:[a[0],a[1],time],interpolated:false,sourceTime:a[2]};
 return {...trackValue(points,index,time),interpolated:true,sourceTime:a[2]};
}

function trackGeometry(points,start,end){
 if(!points.length||end<start)return '';
 const model=getTrackModel(points),commands=[];
 const first=Math.max(0,timeBoundary(points,start)-1),last=timeBoundary(points,end,true);
 let cache=trackOutlineCache.get(points);
 if(!cache){cache=new Map();trackOutlineCache.set(points,cache);}
 let previousIndex=-2,previousEnd=null;
 for(let i=first;i<last;i++){
  const a=points[i],b=points[i+1],h=b?b[2]-a[2]:0;
  if(b&&h>0&&h<=TRACK_MAX_GAP){
   const from=Math.max(start,a[2]),to=Math.min(end,b[2]);if(from>to)continue;
   const complete=from===a[2]&&to===b[2];
   let piece=complete?cache.get(i):null;
   if(!piece){piece=trackCurvePiece(points,i,from,to,model);if(complete)cache.set(i,piece);}
   // Complete Hermite segments are fixed; only the clipped end segments change.
   commands.push(previousIndex===i-1&&previousEnd===from?piece.slice(piece.indexOf(' C')+1):piece);
   previousIndex=i;previousEnd=to;
  }else if(a[2]>=start){
   if(previousEnd!==a[2]){const p=xy(a).join(',');commands.push('M'+p+'L'+p);}
   previousIndex=i;previousEnd=a[2];
  }
 }
 return commands.join(' ');
}

function trackIntervalInBounds(points,index,bounds){
 const a=points[index],b=points[index+1],model=getTrackModel(points);
 let entry=a[2],exit=b[2];
 for(let axis=0;axis<2;axis++){
  const low=axis?bounds.south:bounds.west,high=axis?bounds.north:bounds.east;
  const first=a[axis],last=b[axis];
  if(Math.max(first,last)<low||Math.min(first,last)>high)return null;
  if(first===last)continue;
  const increasing=last>first;
  const crossing=value=>{
   let lo=a[2],hi=b[2];
   for(let n=0;n<40;n++){
    const mid=(lo+hi)/2,v=trackValue(points,index,mid,model).point[axis];
    if((v<value)===increasing)lo=mid;else hi=mid;
   }
   return (lo+hi)/2;
  };
  if(first<low||first>high)entry=Math.max(entry,crossing(increasing?low:high));
  if(last<low||last>high)exit=Math.min(exit,crossing(increasing?high:low));
  if(entry>exit)return null;
 }
 return {start:entry,end:exit};
}
