function projectedTrackSample(boat,time){
 const points=boat.points,index=timeBoundary(points,time,true)-1;if(index<0)return null;
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
  ({point,velocity}=trackValue(points,index,time,model));speed=s0+(s1-s0)*(time-a[2])/(b[2]-a[2]);
 }
 if(!Number.isFinite(speed)||speed<0)return null;
 const projected=projectOnRhumbRoute(point);if(!projected||projected.outside)return null;
 const east=velocity[0]*Math.cos(point[1]*NAV_RAD),north=velocity[1],length=Math.hypot(east,north);
 if(length<1e-15&&speed>0)return null;
 const course=projected.bearing*NAV_RAD;
 const vmg=length>0?speed*(east*Math.sin(course)+north*Math.cos(course))/length:0;
 return {...projected,vmg,time};
}
function prepareReferencePassages(boat){
 const intervals=[];
 for(let i=0;i<boat.points.length-1;i++){
  const start=boat.points[i][2],end=boat.points[i+1][2],duration=end-start;
  if(duration<=0||duration>TRACK_MAX_GAP)continue;
  const steps=Math.ceil(duration/5);let a=projectedTrackSample(boat,start);
  for(let j=1;j<=steps;j++){
   const b=projectedTrackSample(boat,start+duration*j/steps);
   if(a&&b&&b.progress>a.progress+1e-9)intervals.push({a,b,low:a.progress,high:b.progress});
   a=b;
  }
 }
 return {stations:prepareReferenceStations(intervals),boat};
}
function prepareReferenceStations(intervals){
 const events=[];
 for(const interval of intervals){events.push({at:interval.low,start:interval},{at:interval.high,end:interval});}
 events.sort((a,b)=>a.at-b.at);
 const heap=[],active=new Set(),stations=[];
 function push(interval){
  active.add(interval);heap.push(interval);let i=heap.length-1;
  while(i){const parent=(i-1)>>>1;if(heap[parent].a.time<=interval.a.time)break;heap[i]=heap[parent];i=parent;}
  heap[i]=interval;
 }
 function firstActive(){
  while(heap.length&&!active.has(heap[0])){
   const last=heap.pop();if(!heap.length)break;
   let i=0;
   while(i*2+1<heap.length){
    let child=i*2+1;if(child+1<heap.length&&heap[child+1].a.time<heap[child].a.time)child++;
    if(last.a.time<=heap[child].a.time)break;heap[i]=heap[child];i=child;
   }
   heap[i]=last;
  }
  return heap[0]||null;
 }
 for(let i=0;i<events.length;){
  const at=events[i].at;let end=i;while(end<events.length&&events[end].at===at)end++;
  for(let j=i;j<end;j++)if(events[j].start)push(events[j].start);
  const point=firstActive();
  for(let j=i;j<end;j++)if(events[j].end)active.delete(events[j].end);
  stations.push({at,point,after:firstActive()});i=end;
 }
 return stations;
}
function packReferenceStations(stations){
 const values=new Float32Array(stations.length*8);
 for(let i=0;i<stations.length;i++){
  const {at,point,after}=stations[i],offset=i*8,high=Math.fround(at),low=Math.fround(at-high);
  if(!Number.isFinite(at)||(i&&(high<values[offset-8]||(high===values[offset-8]&&low<=values[offset-5]))))throw Error('Reference station boundaries cannot be represented distinctly.');
  values[offset]=high;values[offset+3]=low;
  values[offset+1]=values[offset+4]=-1e20;
  if(point){
   const fraction=(at-point.low)/(point.high-point.low);
   values[offset+1]=point.a.vmg+(point.b.vmg-point.a.vmg)*fraction;
   values[offset+2]=point.a.time-D.start+(point.b.time-point.a.time)*fraction;
  }
  if(after){
   const fraction=(at-after.low)/(after.high-after.low);
   values[offset+4]=after.a.vmg+(after.b.vmg-after.a.vmg)*fraction;
   values[offset+5]=(after.b.vmg-after.a.vmg)/(after.high-after.low);
   values[offset+6]=after.a.time-D.start+(after.b.time-after.a.time)*fraction;
   values[offset+7]=(after.b.time-after.a.time)/(after.high-after.low);
  }
  for(let j=0;j<8;j++)if(!Number.isFinite(values[offset+j]))throw Error('Non-finite packed reference station.');
 }
 return values;
}
function packedReferenceAtProgress(progress,values){
 if(!Number.isFinite(progress)||!values.length)return null;
 const high=Math.fround(progress),low=Math.fround(progress-high);
 let lo=0,hi=values.length/8;
 while(lo<hi){
  const mid=(lo+hi)>>>1,offset=mid*8;
  if(values[offset]<high||(values[offset]===high&&values[offset+3]<=low))lo=mid+1;else hi=mid;
 }
 if(!lo)return null;
 const offset=(lo-1)*8,point=values[offset]===high&&values[offset+3]===low;
 const vmg=values[offset+(point?1:4)];if(vmg<=-1e19)return null;
 if(point)return {vmg,time:D.start+values[offset+2]};
 const distance=(progress-values[offset])-values[offset+3];
 return {vmg:vmg+values[offset+5]*distance,time:D.start+values[offset+6]+values[offset+7]*distance};
}
function prepareProjectedTrack(boat){
 const values=new Float32Array((boat.points.length+1)*3);
 for(let i=0;i<boat.points.length;i++){
  const sample=projectedTrackSample(boat,boat.points[i][2]),offset=i*3,progress=sample?.progress??0,high=Math.fround(progress);
  values[offset]=high;values[offset+1]=Math.fround(progress-high);values[offset+2]=sample?.vmg??-1e20;
 }
 if(boat.points.length)values.set(values.subarray((boat.points.length-1)*3,boat.points.length*3),boat.points.length*3);
 else values[2]=-1e20;
 return values;
}
