const REFERENCE_STATION_METERS=10,REFERENCE_SPEED_MAX=25,REFERENCE_SPEED_CODES=1022,REFERENCE_SPEED_SCALE=REFERENCE_SPEED_CODES/25,REFERENCE_MISSING=1023;
const TRACK_TIME_MISSING=-1e20,TRACK_TIME_OVERFLOW=1e15;
const TRACK_TIME_BLOCK_SIZE=256,TRACK_TIME_CODES=1021,TRACK_TIME_INFINITY=1022;
function timeGainPer100Meters(ownTime,referenceTime){
 if(typeof ownTime!=='number'||typeof referenceTime!=='number'||!(ownTime>=0)||!(referenceTime>=0))return null;
 const own=Math.min(ownTime,TRACK_TIME_OVERFLOW),reference=Math.min(referenceTime,TRACK_TIME_OVERFLOW);
 if(own===TRACK_TIME_OVERFLOW&&reference===TRACK_TIME_OVERFLOW)return null;
 return 100*(reference-own);
}
function preparedTimeGain(boat,time,profile,reference){
 const index=timeBoundary(boat.points,time,true)-1;if(index<0)return null;
 const current=boat.points[index],next=boat.points[index+1],connects=next&&next[2]>current[2]&&next[2]-current[2]<=TRACK_MAX_GAP;
 if(time!==current[2]&&(!connects||time>next[2]))return null;
 function gain(sampleIndex){
  const station=profile.timeSamples[sampleIndex*2];
  return station<0?null:timeGainPer100Meters(profile.timeSamples[sampleIndex*2+1],reference.timeStations[station]);
 }
 const start=gain(index),end=gain(connects?index+1:index);
 if(start===null||end===null)return null;
 return connects?start+(end-start)*(time-current[2])/(next[2]-current[2]):start;
}
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
 const count=boat.points.length,timeSamples=new Float32Array((count+1)*2),timeStations=new Float32Array(referenceStationCount());
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
function packedTimeBytes(count){return Math.ceil(count/TRACK_TIME_BLOCK_SIZE)*4+packedSpeedBytes(count);}
function packTimeValues(values){
 const blocks=Math.ceil(values.length/TRACK_TIME_BLOCK_SIZE),bytes=new Uint8Array(packedTimeBytes(values.length)),view=new DataView(bytes.buffer),codes=new Uint16Array(values.length);
 for(let block=0;block<blocks;block++){
  const start=block*TRACK_TIME_BLOCK_SIZE,end=Math.min(values.length,start+TRACK_TIME_BLOCK_SIZE);let maximum=0;
  for(let index=start;index<end;index++){
   const value=values[index];
   if(value!==TRACK_TIME_MISSING&&value!==Math.fround(TRACK_TIME_MISSING)&&!(value>=0))throw Error('Invalid time density.');
   if(Number.isFinite(value))maximum=Math.max(maximum,value);
  }
  const scale=maximum>0?Math.fround(maximum/TRACK_TIME_CODES):1;
  if(!(scale>0)||!Number.isFinite(scale))throw Error('Time scale cannot be represented.');
  view.setFloat32(block*4,scale,true);
  for(let index=start;index<end;index++)codes[index]=values[index]<0?REFERENCE_MISSING:values[index]===Infinity?TRACK_TIME_INFINITY:Math.min(TRACK_TIME_CODES,Math.round(values[index]/scale));
 }
 bytes.set(packSpeedCodes(codes),blocks*4);return bytes;
}
function unpackTimeValues(bytes,count){
 if(Object.prototype.toString.call(bytes)!=='[object Uint8Array]'||!Number.isSafeInteger(count)||count<0||bytes.length!==packedTimeBytes(count))throw Error('Invalid time profile byte length or type.');
 const blocks=Math.ceil(count/TRACK_TIME_BLOCK_SIZE),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),codes=unpackSpeedCodes(bytes.subarray(blocks*4),count),values=new Float32Array(count);
 for(let block=0;block<blocks;block++){
  const scale=view.getFloat32(block*4,true);
  if(!(scale>0)||!Number.isFinite(scale)||!Number.isFinite(Math.fround(scale*TRACK_TIME_CODES)))throw Error('Invalid time scale.');
  for(let index=block*TRACK_TIME_BLOCK_SIZE;index<Math.min(count,(block+1)*TRACK_TIME_BLOCK_SIZE);index++){
   const code=codes[index];values[index]=code===REFERENCE_MISSING?TRACK_TIME_MISSING:code===TRACK_TIME_INFINITY?Infinity:code*scale;
  }
 }
 return values;
}
function packTimeSamples(samples){
 if(samples.length<2||samples.length%2)throw Error('Time samples must contain padded pairs.');
 const count=samples.length/2-1,bytes=new Uint8Array(count*4+packedTimeBytes(count)),view=new DataView(bytes.buffer),values=new Float32Array(count);
 for(let index=0;index<count;index++){
  const station=samples[index*2],value=samples[index*2+1];
  if(!Number.isInteger(station)||station< -1||Math.fround(station)!==station||(station===-1)!==(value<0))throw Error('Invalid time sample position.');
  view.setFloat32(index*4,station,true);values[index]=value;
 }
 for(let index=0;index<2;index++)if(samples[count*2+index]!==samples[(count?count-1:0)*2+index])throw Error('Invalid time sample padding.');
 bytes.set(packTimeValues(values),count*4);return bytes;
}
function unpackTimeSamples(bytes,count){
 if(Object.prototype.toString.call(bytes)!=='[object Uint8Array]'||!Number.isSafeInteger(count)||count<0||bytes.length!==count*4+packedTimeBytes(count))throw Error('Invalid time sample byte length or type.');
 const values=unpackTimeValues(bytes.subarray(count*4),count),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),samples=new Float32Array((count+1)*2);
 for(let index=0;index<count;index++){
  const station=view.getFloat32(index*4,true);
  if(!Number.isInteger(station)||station< -1||(station===-1)!==(values[index]<0))throw Error('Invalid time sample position.');
  samples[index*2]=station;samples[index*2+1]=values[index];
 }
 if(count)samples.set(samples.subarray((count-1)*2,count*2),count*2);
 else {samples[0]=-1;samples[1]=TRACK_TIME_MISSING;}
 return samples;
}
