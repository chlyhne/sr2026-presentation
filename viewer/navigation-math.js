const REFERENCE_STATION_METERS=10,REFERENCE_SPEED_MAX=25,REFERENCE_SPEED_SCALE=254/25,REFERENCE_MISSING=255;
function referenceStationCount(){return Math.ceil(rhumbRoute.total*1852/REFERENCE_STATION_METERS)+1;}
function referenceStationIndex(progress){
 if(!Number.isFinite(progress)||progress<0||progress>rhumbRoute.total)return -1;
 return Math.floor(progress*(1852/REFERENCE_STATION_METERS)+0.5);
}
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
function prepareReferenceProfile(boat){
 const values=new Uint8Array(referenceStationCount());values.fill(REFERENCE_MISSING);
 const step=REFERENCE_STATION_METERS/1852,last=values.length-1,model=getTrackModel(boat.points);
 let passage=null;
 function write(index,progress,a,b){
  if(values[index]!==REFERENCE_MISSING)return;
  const fraction=(Math.max(a.progress,Math.min(b.progress,progress))-a.progress)/(b.progress-a.progress);
  const speed=a.vmg+(b.vmg-a.vmg)*fraction;
  values[index]=Math.round(Math.max(0,Math.min(REFERENCE_SPEED_MAX,speed))*REFERENCE_SPEED_SCALE);
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
  if(!a||!b||b.progress<=a.progress){finish();return;}
  if(passage&&(passage.b.time!==a.time||passage.b.progress!==a.progress))finish();
  if(!passage)passage={a,b};else passage.b=b;
  const first=Math.max(0,Math.ceil(a.progress/step)),end=Math.min(last,Math.floor(b.progress/step));
  for(let index=first;index<=end;index++)write(index,index*step,a,b);
 }
 for(let i=0;i<boat.points.length-1;i++){
  const a=boat.points[i],b=boat.points[i+1],duration=b[2]-a[2];
  if(duration<=0||duration>TRACK_MAX_GAP){finish();continue;}
  if(!Number.isFinite(boat.speeds?.[i])||boat.speeds[i]<0||!Number.isFinite(boat.speeds?.[i+1])||boat.speeds[i+1]<0){finish();continue;}
  let previous=projectedTrackSample(boat,a[2]);
  function sampleSpan(left,right){
   const latitude=left[1]*right[1]<=0?0:Math.min(Math.abs(left[1]),Math.abs(right[1]));
   const meters=NAV_RADIUS_NM*1852*NAV_RAD*(Math.abs(right[1]-left[1])+Math.cos(latitude*NAV_RAD)*Math.abs(right[0]-left[0]));
   if(!Number.isFinite(meters))throw Error('Non-finite reference sampling distance.');
   if(meters>REFERENCE_STATION_METERS){
    const time=(left[2]+right[2])/2;
    if(time===left[2]||time===right[2])throw Error('Reference spatial sampling cannot resolve source time.');
    const middle=trackValue(boat.points,i,time,model).point;
    sampleSpan(left,middle);sampleSpan(middle,right);
   }else{
    const next=projectedTrackSample(boat,right[2]);fill(previous,next);previous=next;
   }
  }
  sampleSpan(a,b);
 }
 finish();
 return values;
}
function referenceAtStation(index,values){
 if(!Number.isInteger(index)||index<0||index>=values.length||values[index]===REFERENCE_MISSING)return null;
 return {vmg:values[index]*REFERENCE_SPEED_MAX/254};
}
function packedReferenceAtProgress(progress,values){
 return referenceAtStation(referenceStationIndex(progress),values);
}
function quantizeProjectedSpeed(speed){
 if(!Number.isFinite(speed))throw Error('Projected speed must be finite.');
 return Math.sign(speed)*Math.round(Math.min(Math.abs(speed),REFERENCE_SPEED_MAX)*REFERENCE_SPEED_SCALE)*REFERENCE_SPEED_MAX/254;
}
function unpackProjectedTrack(bytes){
 if(Object.prototype.toString.call(bytes)!=='[object Uint8Array]'||bytes.length%9)throw Error('Invalid packed projected track byte length or type.');
 const count=bytes.length/9,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),values=new Float32Array(count*3);
 for(let i=0;i<count;i++){
  const signedIndex=view.getFloat32(i*8,true),progress=view.getFloat32(i*8+4,true),code=bytes[count*8+i],offset=i*3;
  if(!Number.isFinite(signedIndex)||!Number.isInteger(signedIndex)||!Number.isFinite(progress)||progress<0)throw Error('Invalid packed projected track position.');
  if((code===REFERENCE_MISSING)!==(signedIndex===-1))throw Error('Packed projected track missing speed/index mismatch.');
  values[offset]=signedIndex<-1?-signedIndex-2:signedIndex;values[offset+1]=progress;
  values[offset+2]=code===REFERENCE_MISSING?-1e20:(signedIndex<-1?-1:1)*code*REFERENCE_SPEED_MAX/254;
 }
 return values;
}
function prepareProjectedTrack(boat){
 const values=new Float32Array((boat.points.length+1)*3);
 for(let i=0;i<boat.points.length;i++){
  const sample=projectedTrackSample(boat,boat.points[i][2]),offset=i*3;
  values[offset]=sample?referenceStationIndex(sample.progress):-1;values[offset+1]=sample?.progress??0;values[offset+2]=sample?quantizeProjectedSpeed(sample.vmg):-1e20;
 }
 if(boat.points.length)values.set(values.subarray((boat.points.length-1)*3,boat.points.length*3),boat.points.length*3);
 else {values[0]=-1;values[2]=-1e20;}
 return values;
}
