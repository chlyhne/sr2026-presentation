function resampleBoatTrack(boat,origin,coordinateOrigin){
 const source=boat.points,segments=[];
 if(!Array.isArray(source)||!Array.isArray(boat.speeds)||boat.speeds.length!==source.length)throw Error('Invalid source track: '+boat.id);
 for(let index=0;index<source.length;index++){
  const point=source[index],previous=source[index-1];
  if(!point.every(Number.isFinite)||point.length!==3||(previous&&point[2]<=previous[2]))throw Error('Invalid source timestamp or position: '+boat.id);
  if(!previous||point[2]-previous[2]>TRACK_MAX_GAP)segments.push([point[2],point[2]]);
  else segments.at(-1)[1]=point[2];
 }
 const model=getTrackModel(source),speedPoints=source.map((point,index)=>[Number.isFinite(boat.speeds[index])&&boat.speeds[index]>=0?boat.speeds[index]:NaN,0,point[2]]);
 const speedModel=getTrackModel(speedPoints),points=[],speeds=[];
 let sourceIndex=0;
 visitTrackSampleTimes(segments,origin,time=>{
  while(sourceIndex+1<source.length&&source[sourceIndex+1][2]<=time)sourceIndex++;
  const first=source[sourceIndex],last=source[sourceIndex+1],exact=time===first[2];
  const point=exact?first:trackValue(source,sourceIndex,time,model).point;
  let speed=null;
  if(exact)speed=Number.isFinite(speedPoints[sourceIndex][0])?speedPoints[sourceIndex][0]:null;
  else if(last&&Number.isFinite(speedPoints[sourceIndex][0])&&Number.isFinite(speedPoints[sourceIndex+1][0]))speed=trackValue(speedPoints,sourceIndex,time,speedModel).point[0];
  points.push([coordinateOrigin[0]+Math.fround(point[0]-coordinateOrigin[0]),coordinateOrigin[1]+Math.fround(point[1]-coordinateOrigin[1]),time]);
  speeds.push(speed===null?null:Math.fround(speed));
 });
 prepareTrackTimeIndex(points);
 return {...boat,points,speeds,trackSegments:segments};
}
