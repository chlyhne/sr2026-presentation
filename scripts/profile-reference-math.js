// Independent Float64 CPU oracle for focused GPU validation. Never loaded by the app.
const REFERENCE_STATION_METERS=10,REFERENCE_MISSING=-1e20;
const TRACK_TIME_MISSING=-1e20;
function referenceStationCount(){return Math.ceil(rhumbRoute.total*1852/REFERENCE_STATION_METERS)+1;}
function referenceStationIndex(progress){
 if(!Number.isFinite(progress)||progress<0||progress>rhumbRoute.total)return -1;
 return Math.floor(progress*(1852/REFERENCE_STATION_METERS)+0.5);
}
function connectedRouteSamples(left,right){
 return left&&right&&(Math.abs(left.leg-right.leg)<=1||Math.abs(left.progress-right.progress)*1852<=REFERENCE_STATION_METERS);
}
function projectedTrackSample(boat,time,index=timeBoundary(boat.points,time,true)-1,evaluation=null){
 const points=boat.points;if(index<0)return null;
 const a=points[index],b=points[index+1],model=getTrackModel(points);
 let point,velocity,speed;
 if(time===a[2]){
  const previous=points[index-1];
  if((!b||b[2]-a[2]>TRACK_MAX_GAP)&&(!previous||a[2]-previous[2]>TRACK_MAX_GAP))return null;
  point=a;velocity=[model.slopes[0][index],model.slopes[1][index]];speed=boat.speeds?.[index];
 }else{
  if(!b||b[2]<=a[2]||b[2]-a[2]>TRACK_MAX_GAP)return null;
  const s0=boat.speeds?.[index],s1=boat.speeds?.[index+1];
  if(!Number.isFinite(s0)||s0<0||!Number.isFinite(s1)||s1<0)return null;
  ({point,velocity}=evaluation??trackValue(points,index,time,model));speed=s0+(s1-s0)*(time-a[2])/(b[2]-a[2]);
 }
 if(!Number.isFinite(speed)||speed<0)return null;
 const projected=projectOnRhumbRoute(point);if(!projected||projected.outside)return null;
 const east=velocity[0]*Math.cos(point[1]*NAV_RAD),north=velocity[1],length=Math.hypot(east,north);
 if(length<1e-15&&speed>0)return null;
 const course=projected.bearing*NAV_RAD;
 const vmg=length>0?speed*(east*Math.sin(course)+north*Math.cos(course))/length:0;
 return {...projected,vmg,time};
}
function sampleTrackInterval(points,index,model,visit){
 function span(left,right,evaluation=null){
  const latitude=left[1]*right[1]<=0?0:Math.min(Math.abs(left[1]),Math.abs(right[1]));
  const meters=NAV_RADIUS_NM*1852*NAV_RAD*(Math.abs(right[1]-left[1])+Math.cos(latitude*NAV_RAD)*Math.abs(right[0]-left[0]));
  if(!Number.isFinite(meters))throw Error('Non-finite profile sampling distance.');
  if(meters>REFERENCE_STATION_METERS){
   const time=(left[2]+right[2])/2;
   if(time===left[2]||time===right[2])throw Error('Profile spatial sampling cannot resolve source time.');
   const middle=trackValue(points,index,time,model);
   span(left,middle.point,middle);span(middle.point,right,evaluation);
  }else visit(right,evaluation);
 }
 span(points[index],points[index+1]);
}
function prepareReferenceProfile(boat){
 const values=new Float64Array(referenceStationCount());values.fill(REFERENCE_MISSING);
 values.passages=new Float64Array(values.length).fill(NaN);
 const step=REFERENCE_STATION_METERS/1852,last=values.length-1,model=getTrackModel(boat.points);
 let passage=null;
 function write(index,progress,a,b){
  if(values[index]!==REFERENCE_MISSING)return;
  const fraction=(Math.max(a.progress,Math.min(b.progress,progress))-a.progress)/(b.progress-a.progress);
  const speed=a.vmg+(b.vmg-a.vmg)*fraction;
  values[index]=Math.max(0,speed);values.passages[index]=a.time+(b.time-a.time)*fraction;
 }
 function finish(){
  if(!passage)return;
  const {a,b}=passage;
  for(const sample of [a,b]){
   const index=referenceStationIndex(sample.progress);
   write(index,Math.min(index*step,rhumbRoute.total),a,b);
  }
  if(b.progress>=rhumbRoute.total)write(last,rhumbRoute.total,a,b);
  passage=null;
 }
 function fill(a,b){
  if(!connectedRouteSamples(a,b)||b.progress<=a.progress){finish();return;}
  if(passage&&(passage.b.time!==a.time||passage.b.progress!==a.progress))finish();
  if(!passage)passage={a,b};else passage.b=b;
  const first=Math.max(0,Math.ceil(a.progress/step)),end=Math.min(last,Math.floor(b.progress/step));
  for(let index=first;index<=end;index++)write(index,index*step,a,b);
 }
 for(let i=0;i<boat.points.length-1;i++){
  const a=boat.points[i],b=boat.points[i+1],duration=b[2]-a[2];
  if(duration<=0||duration>TRACK_MAX_GAP){finish();continue;}
  if(!Number.isFinite(boat.speeds?.[i])||boat.speeds[i]<0||!Number.isFinite(boat.speeds?.[i+1])||boat.speeds[i+1]<0){finish();continue;}
  let endpointIndex=i+1;
  while(endpointIndex+1<boat.points.length&&boat.points[endpointIndex+1][2]===b[2])endpointIndex++;
  let previous=projectedTrackSample(boat,a[2],i);
  sampleTrackInterval(boat.points,i,model,(right,evaluation)=>{
   const next=projectedTrackSample(boat,right[2],right[2]===b[2]?endpointIndex:i,evaluation);fill(previous,next);previous=next;
  });
 }
 finish();
 return values;
}
function projectedTimeSample(boat,time,index=timeBoundary(boat.points,time,true)-1){
 const points=boat.points;if(index<0)return null;
 const point=points[index],next=points[index+1];
 const outgoing=next&&next[2]>point[2]&&next[2]-point[2]<=TRACK_MAX_GAP;
 const directionIndex=outgoing?index:index-1,directionStart=points[directionIndex],directionEnd=points[directionIndex+1];
 if(!directionStart||!directionEnd||directionEnd[2]<=directionStart[2]||directionEnd[2]-directionStart[2]>TRACK_MAX_GAP)return null;
 if(time!==point[2]&&(!outgoing||time>next[2]))return null;
 let position=point,speed=boat.speeds?.[index];
 if(time!==point[2]){
  const endSpeed=boat.speeds?.[index+1];
  if(!Number.isFinite(speed)||speed<0||!Number.isFinite(endSpeed)||endSpeed<0)return null;
  speed+=(endSpeed-speed)*(time-point[2])/(next[2]-point[2]);position=trackValue(points,index,time).point;
 }
 if(!Number.isFinite(speed)||speed<0)return null;
 const projected=projectOnRhumbRoute(position);if(!projected||projected.outside)return null;
 const east=(directionEnd[0]-directionStart[0])*Math.cos(position[1]*NAV_RAD),north=directionEnd[1]-directionStart[1],length=Math.hypot(east,north);
 if(length<1e-15&&speed>0)return null;
 const course=projected.bearing*NAV_RAD,alignment=length>0?(east*Math.sin(course)+north*Math.cos(course))/length:0;
 const vmg=Math.abs(alignment)<=Number.EPSILON*8?0:speed*alignment;
 return {...projected,secondsPerMeter:vmg===0?Infinity:3600/(1852*Math.abs(vmg))};
}
function prepareTimeProfiles(boat){
 const count=boat.points.length,timeSamples=new Float64Array((count+1)*2),timeStations=new Float64Array(referenceStationCount());
 timeStations.fill(TRACK_TIME_MISSING);
 let sampleIndex=0;
 for(let index=0;index<count;index++){
  while(sampleIndex+1<count&&boat.points[sampleIndex+1][2]<=boat.points[index][2])sampleIndex++;
  const sample=projectedTimeSample(boat,boat.points[index][2],sampleIndex);
  timeSamples[index*2]=sample?referenceStationIndex(sample.progress):-1;
  timeSamples[index*2+1]=sample?sample.secondsPerMeter:TRACK_TIME_MISSING;
 }
 if(count)timeSamples.set(timeSamples.subarray((count-1)*2,count*2),count*2);
 else {timeSamples[0]=-1;timeSamples[1]=TRACK_TIME_MISSING;}
 let pending=null,direction=0;
 function add(index,value){timeStations[index]=timeStations[index]<0?value:timeStations[index]+value;}
 function finish(){
  if(pending)add(pending.index,pending.total/pending.meters);
  pending=null;
 }
 function fill(left,right,leftTime,rightTime){
  if(!connectedRouteSamples(left,right)){finish();direction=0;return;}
  const from=left.progress*1852,to=right.progress*1852,delta=to-from,sign=Math.sign(delta);
  if(!sign){
   add(referenceStationIndex(left.progress),(rightTime-leftTime)/REFERENCE_STATION_METERS);return;
  }
  if(direction!==sign){finish();direction=sign;}
  const low=Math.min(from,to),high=Math.max(from,to),first=referenceStationIndex(low/1852),last=referenceStationIndex(high/1852);
  for(let offset=0;offset<=last-first;offset++){
   const index=sign>0?first+offset:last-offset;
   const begin=Math.max(low,(index-.5)*REFERENCE_STATION_METERS),end=Math.min(high,(index+.5)*REFERENCE_STATION_METERS);
   if(end<=begin)continue;
   const fraction=((begin+end)/2-from)/delta;
   const density=left.secondsPerMeter===right.secondsPerMeter?left.secondsPerMeter:
    left.secondsPerMeter===Infinity||right.secondsPerMeter===Infinity?Infinity:left.secondsPerMeter+(right.secondsPerMeter-left.secondsPerMeter)*fraction;
   if(pending?.index!==index){finish();pending={index,total:0,meters:0};}
   pending.total+=density*(end-begin);pending.meters+=end-begin;
  }
 }
 const model=getTrackModel(boat.points);
 for(let index=0;index<count-1;index++){
  const startPoint=boat.points[index],endPoint=boat.points[index+1],duration=endPoint[2]-startPoint[2];
  if(duration<=0||duration>TRACK_MAX_GAP||timeSamples[index*2]<0||timeSamples[(index+1)*2]<0){finish();direction=0;continue;}
  let endpointIndex=index+1;
  while(endpointIndex+1<count&&boat.points[endpointIndex+1][2]===endPoint[2])endpointIndex++;
  const startDensity=timeSamples[index*2+1],endDensity=timeSamples[endpointIndex*2+1];
  let previous=projectOnRhumbRoute(startPoint),previousTime=startPoint[2];
  if(previous?.outside)previous=null;
  if(previous)previous.secondsPerMeter=startDensity;
  sampleTrackInterval(boat.points,index,model,right=>{
   let next=projectOnRhumbRoute(right);if(next?.outside)next=null;
   if(next){
    const fraction=(right[2]-startPoint[2])/duration;
    next.secondsPerMeter=fraction===1?endDensity:startDensity===endDensity?startDensity:
     startDensity===Infinity||endDensity===Infinity?Infinity:startDensity+(endDensity-startDensity)*fraction;
   }
   fill(previous,next,previousTime,right[2]);previous=next;previousTime=right[2];
  });
 }
 finish();
 return {timeSamples,timeStations};
}
