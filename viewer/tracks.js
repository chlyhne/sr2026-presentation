// Shape-preserving cubic Hermite interpolation (PCHIP) in source time.
// Every observation is an interpolation knot. The renderers evaluate the cubic
// at the current zoom instead of baking a fixed-resolution track image.
const TRACK_MAX_GAP=300;
const trackModelCache=new WeakMap();
const TRACK_SPEED_MAX=15,TRACK_SPEED_BINS=128,TRACK_SPEED_MISSING='#8a949b';
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
// Prepare immutable nominal GPU buffers once for the whole voyage.
function prepareBoatTrack(boat){webglTracks.prepare(boat);}
function prepareSelectedTracks(){
 for(const boat of boats)if(boatIsDisplayed(boat))prepareBoatTrack(boat);
}
async function prepareFleetTracks(){
 for(const boat of boats){
  // The renderer has already displayed its error. Finish loading its controls
  // so the user can reload; no alternative rendering or calculation is used.
  if(!webglTracks.active)return false;
  prepareBoatTrack(boat);
  // Let the loading message paint between boats while interaction is locked.
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 return true;
}
function trackSpeedLegendLayout(){
 const rect=$('map').getBoundingClientRect();
 return {left:12,top:12,width:Math.max(110,Math.min(230,rect.width-24)),height:comparison.enabled?103:63};
}
function renderTrackSpeedLegend(){
 const layer=$('trackSpeedLegend');layer.replaceChildren();
 const map=$('map'),rect=map.getBoundingClientRect(),matrix=map.getScreenCTM();if(!matrix)return;
 const layout=trackSpeedLegendLayout(),{width}=layout;
 const point=new DOMPoint(rect.left+layout.left,rect.top+layout.top).matrixTransform(matrix.inverse());
 const group=screenGroup(point.x,point.y,layer);
 group.setAttribute('transform',`translate(${point.x} ${point.y}) scale(${1/Math.hypot(matrix.a,matrix.b)})`);
 el('rect',{width,height:layout.height,rx:5,fill:'#ffffff',opacity:.94},group);
 const relative=comparison.enabled;
 layer.setAttribute('aria-label',relative?'Fartforskel fra Mercutio ved samme sted: blå taber, rød henter':'Bådfart over grunden, jet-farveskala fra 0 til 15 knob');
 el('text',{x:10,y:17,fill:'#173d4c','font-size':11,'font-weight':650},group).textContent=relative?`Mod Mercutio · ${comparison.basis==='handicap'?'ToD':'absolut'} · kn`:'Bådfart · SOG · knob';
 const gradient=el('linearGradient',{id:'trackSpeedJetGradient',x1:0,x2:1,y1:0,y2:0},el('defs',{},group));
 for(let i=0;i<=128;i++)el('stop',{offset:i/128,'stop-color':relative?trackGainColour(-TRACK_GAIN_LIMIT+2*TRACK_GAIN_LIMIT*i/128):trackSpeedColour(TRACK_SPEED_MAX*i/128)},gradient);
 el('rect',{x:10,y:24,width:width-20,height:13,fill:'url(#trackSpeedJetGradient)'},group);
 for(const value of relative?[-2,0,2]:[0,5,10,15]){
  const x=10+(width-20)*(relative?(value+2)/4:value/TRACK_SPEED_MAX);
  el('line',{x1:x,x2:x,y1:37,y2:41,stroke:'#173d4c'},group);
  el('text',{x,y:54,fill:'#173d4c','font-size':11,'text-anchor':value===(relative?-2:0)?'start':value===(relative?2:15)?'end':'middle'},group).textContent=relative?(value===-2?'−2':value===2?'+2':0):value===15?'15+':value;
 }
 if(relative){
  el('text',{x:10,y:69,fill:'#173d4c','font-size':10},group).textContent='Blå: taber · Rød: henter · Samme sted';
  el('text',{x:10,y:83,fill:'#173d4c','font-size':10},group).textContent='Grå: mangler fælles passage/data';
  el('text',{x:10,y:96,fill:'#173d4c','font-size':10},group).textContent='Mercutio: uændret SOG-farve';
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
