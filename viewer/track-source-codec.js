// Native source resolution: int32 degrees * 1e7, uint64 epoch milliseconds,
// int16 tenths of km/h (-32768 means missing). Each boat has four channels.
// Consecutive native words are XORed, then written as little-endian byte planes.
const SOURCE_POINT_BYTES=18,SOURCE_SPEED_MISSING=-32768;
function sourceTrackBytes(count){
 if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(count*SOURCE_POINT_BYTES))throw Error('Invalid source point count.');
 return count*SOURCE_POINT_BYTES;
}
function packSourceTrack(points,speeds){
 if(!Array.isArray(points)||!Array.isArray(speeds)||points.length!==speeds.length)throw Error('Invalid source track.');
 const count=points.length,bytes=new Uint8Array(sourceTrackBytes(count));let offset=0;
 function channel(width,word){
  const previous=new Uint8Array(width),buffer=new ArrayBuffer(width),view=new DataView(buffer),raw=new Uint8Array(buffer);
  for(let index=0;index<count;index++){
   word(view,index);
   for(let byte=0;byte<width;byte++){const value=raw[byte];bytes[offset+byte*count+index]=value^previous[byte];previous[byte]=value;}
  }
  offset+=count*width;
 }
 for(let index=0;index<count;index++){
  const point=points[index],speed=speeds[index];
  if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite)
   ||Math.abs(point[0])>180||Math.abs(point[1])>=85||!Number.isSafeInteger(point[2])||point[2]<0
   ||(index&&point[2]<=points[index-1][2]))throw Error('Invalid source coordinate or timestamp.');
  for(let axis=0;axis<2;axis++)if(Math.round(point[axis]*1e7)/1e7!==point[axis])throw Error('Coordinate is outside the native source grid.');
  if(speed!==null&&(!Number.isFinite(speed)||speed<0||Math.round(speed*10)>32767||Math.round(speed*10)/10!==speed))throw Error('Speed is outside the native source grid.');
 }
 for(let axis=0;axis<2;axis++)channel(4,(view,index)=>view.setInt32(0,Math.round(points[index][axis]*1e7),true));
 channel(8,(view,index)=>{
  const stamp=points[index][2];view.setUint32(0,stamp%4294967296,true);view.setUint32(4,Math.floor(stamp/4294967296),true);
 });
 channel(2,(view,index)=>view.setInt16(0,speeds[index]===null?SOURCE_SPEED_MISSING:Math.round(speeds[index]*10),true));
 return bytes;
}
function unpackSourceTrack(bytes,count){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength!==sourceTrackBytes(count))throw Error('Invalid source track byte length or type.');
 const points=Array.from({length:count},()=>[0,0,0]),speeds=new Array(count);let offset=0;
 function channel(width,read){
  const buffer=new ArrayBuffer(width),view=new DataView(buffer),previous=new Uint8Array(buffer);
  for(let index=0;index<count;index++){
   for(let byte=0;byte<width;byte++)previous[byte]^=bytes[offset+byte*count+index];
   read(view,index);
  }
  offset+=count*width;
 }
 for(let axis=0;axis<2;axis++)channel(4,(view,index)=>points[index][axis]=view.getInt32(0,true)/1e7);
 channel(8,(view,index)=>{
  const stamp=view.getUint32(4,true)*4294967296+view.getUint32(0,true);
  if(!Number.isSafeInteger(stamp)||(index&&stamp/1000<=points[index-1][2]))throw Error('Invalid source timestamp.');
  points[index][2]=stamp/1000;
 });
 channel(2,(view,index)=>{
  const code=view.getInt16(0,true);
  if(code<0&&code!==SOURCE_SPEED_MISSING)throw Error('Invalid source speed.');
  speeds[index]=code===SOURCE_SPEED_MISSING?null:(code/10)/1.852;
 });
 for(const point of points)if(Math.abs(point[0])>180||Math.abs(point[1])>=85)throw Error('Invalid source coordinate.');
 return {points,speeds};
}
