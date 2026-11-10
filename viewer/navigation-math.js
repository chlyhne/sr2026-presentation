const REFERENCE_STATION_METERS=10,REFERENCE_SPEED_MAX=25,REFERENCE_SPEED_CODES=1022,REFERENCE_SPEED_SCALE=REFERENCE_SPEED_CODES/25,REFERENCE_MISSING=1023;
function packedSpeedBytes(count){return Math.ceil(count*10/8);}
function packSpeedCodes(values){
 const bytes=new Uint8Array(packedSpeedBytes(values.length));
 for(let index=0;index<values.length;index++){
  const code=values[index],bit=index*10,offset=Math.floor(bit/8),shift=bit%8;
  if(!Number.isInteger(code)||code<0||code>REFERENCE_MISSING)throw Error('Invalid 10-bit speed code.');
  bytes[offset]|=code<<shift;bytes[offset+1]|=code>>>(8-shift);
 }
 return bytes;
}
function unpackSpeedCodes(bytes,count){
 if(Object.prototype.toString.call(bytes)!=='[object Uint8Array]'||!Number.isSafeInteger(count)||count<0||bytes.length!==packedSpeedBytes(count))throw Error('Invalid packed speed byte length or type.');
 const usedBits=count*10%8;
 if(usedBits&&bytes[bytes.length-1]>>>usedBits)throw Error('Nonzero packed speed padding.');
 const values=new Uint16Array(count);
 for(let index=0;index<count;index++){
  const bit=index*10,offset=Math.floor(bit/8),shift=bit%8;
  values[index]=((bytes[offset]|bytes[offset+1]<<8)>>>shift)&REFERENCE_MISSING;
 }
 return values;
}
function referenceStationCount(){return Math.ceil(rhumbRoute.total*1852/REFERENCE_STATION_METERS)+1;}
function referenceStationIndex(progress){
 if(!Number.isFinite(progress)||progress<0||progress>rhumbRoute.total)return -1;
 return Math.floor(progress*(1852/REFERENCE_STATION_METERS)+0.5);
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
function prepareReferenceProfile(boat){
 const values=new Uint16Array(referenceStationCount());values.fill(REFERENCE_MISSING);
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
  let endpointIndex=i+1;
  while(endpointIndex+1<boat.points.length&&boat.points[endpointIndex+1][2]===b[2])endpointIndex++;
  let previous=projectedTrackSample(boat,a[2],i);
  function sampleSpan(left,right,evaluation=null){
   const latitude=left[1]*right[1]<=0?0:Math.min(Math.abs(left[1]),Math.abs(right[1]));
   const meters=NAV_RADIUS_NM*1852*NAV_RAD*(Math.abs(right[1]-left[1])+Math.cos(latitude*NAV_RAD)*Math.abs(right[0]-left[0]));
   if(!Number.isFinite(meters))throw Error('Non-finite reference sampling distance.');
   if(meters>REFERENCE_STATION_METERS){
    const time=(left[2]+right[2])/2;
    if(time===left[2]||time===right[2])throw Error('Reference spatial sampling cannot resolve source time.');
    const middle=trackValue(boat.points,i,time,model);
    sampleSpan(left,middle.point,middle);sampleSpan(middle.point,right,evaluation);
   }else{
    const next=projectedTrackSample(boat,right[2],right[2]===b[2]?endpointIndex:i,evaluation);fill(previous,next);previous=next;
   }
  }
  sampleSpan(a,b);
 }
 finish();
 return values;
}
function referenceAtStation(index,values){
 if(!Number.isInteger(index)||index<0||index>=values.length||values[index]===REFERENCE_MISSING)return null;
 return {vmg:values[index]*REFERENCE_SPEED_MAX/REFERENCE_SPEED_CODES};
}
function packedReferenceAtProgress(progress,values){
 return referenceAtStation(referenceStationIndex(progress),values);
}
function quantizeProjectedSpeed(speed){
 if(!Number.isFinite(speed))throw Error('Projected speed must be finite.');
 return Math.sign(speed)*Math.round(Math.min(Math.abs(speed),REFERENCE_SPEED_MAX)*REFERENCE_SPEED_SCALE)*REFERENCE_SPEED_MAX/REFERENCE_SPEED_CODES;
}
function packProjectedTrack(samples){
 if(samples.length%3)throw Error('Projected track must contain triplets.');
 const count=samples.length/3,bytes=new Uint8Array(count*8+packedSpeedBytes(count)),view=new DataView(bytes.buffer),codes=new Uint16Array(count);
 for(let index=0;index<count;index++){
  const station=samples[index*3],progress=samples[index*3+1],speed=samples[index*3+2];
  if(!Number.isInteger(station)||station< -1||!Number.isFinite(progress)||progress<0||!Number.isFinite(speed))throw Error('Invalid projected track sample.');
  const signedIndex=station===-1?-1:(speed<0||Object.is(speed,-0)?-station-2:station);
  if(Math.fround(signedIndex)!==signedIndex)throw Error('Projected station index cannot be represented distinctly.');
  view.setFloat32(index*8,signedIndex,true);view.setFloat32(index*8+4,progress,true);
  codes[index]=station===-1?REFERENCE_MISSING:Math.round(Math.min(Math.abs(speed),REFERENCE_SPEED_MAX)*REFERENCE_SPEED_SCALE);
 }
 bytes.set(packSpeedCodes(codes),count*8);
 return bytes;
}
function unpackProjectedTrack(bytes){
 if(Object.prototype.toString.call(bytes)!=='[object Uint8Array]')throw Error('Invalid packed projected track byte length or type.');
 const count=Math.floor(bytes.length*8/74);
 if(bytes.length!==count*8+packedSpeedBytes(count))throw Error('Invalid packed projected track byte length or type.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),values=new Float32Array(count*3),codes=unpackSpeedCodes(bytes.subarray(count*8),count);
 for(let i=0;i<count;i++){
  const signedIndex=view.getFloat32(i*8,true),progress=view.getFloat32(i*8+4,true),code=codes[i],offset=i*3;
  if(!Number.isFinite(signedIndex)||!Number.isInteger(signedIndex)||!Number.isFinite(progress)||progress<0)throw Error('Invalid packed projected track position.');
  if((code===REFERENCE_MISSING)!==(signedIndex===-1))throw Error('Packed projected track missing speed/index mismatch.');
  values[offset]=signedIndex<-1?-signedIndex-2:signedIndex;values[offset+1]=progress;
  values[offset+2]=code===REFERENCE_MISSING?-1e20:(signedIndex<-1?-1:1)*code*REFERENCE_SPEED_MAX/REFERENCE_SPEED_CODES;
 }
 return values;
}
function prepareProjectedTrack(boat){
 const values=new Float32Array((boat.points.length+1)*3);
 let sampleIndex=0;
 for(let i=0;i<boat.points.length;i++){
  while(sampleIndex+1<boat.points.length&&boat.points[sampleIndex+1][2]<=boat.points[i][2])sampleIndex++;
  const sample=projectedTrackSample(boat,boat.points[i][2],sampleIndex),offset=i*3;
  values[offset]=sample?referenceStationIndex(sample.progress):-1;values[offset+1]=sample?.progress??0;values[offset+2]=sample?quantizeProjectedSpeed(sample.vmg):-1e20;
 }
 if(boat.points.length)values.set(values.subarray((boat.points.length-1)*3,boat.points.length*3),boat.points.length*3);
 else {values[0]=-1;values[2]=-1e20;}
 return values;
}
