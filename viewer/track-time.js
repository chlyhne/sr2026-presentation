const TRACK_SAMPLE_SECONDS=10;
const trackTimeIndexes=new WeakMap();
function prepareTrackTimeIndex(points){
 if(trackTimeIndexes.has(points))return trackTimeIndexes.get(points);
 const start=points.length?Math.floor(points[0][2]/TRACK_SAMPLE_SECONDS)*TRACK_SAMPLE_SECONDS:0;
 const count=points.length?Math.floor((points.at(-1)[2]-start)/TRACK_SAMPLE_SECONDS)+1:0;
 const boundaries=new Uint32Array(count);
 let pointIndex=0;
 for(let index=0;index<count;index++){
  const time=start+index*TRACK_SAMPLE_SECONDS;
  while(pointIndex<points.length&&points[pointIndex][2]<time)pointIndex++;
  boundaries[index]=pointIndex;
 }
 const result={start,boundaries};trackTimeIndexes.set(points,result);return result;
}
function timeBoundary(points,time,after=false){
 if(!points.length||time<points[0][2])return 0;
 if(time>points.at(-1)[2])return points.length;
 const {start,boundaries}=prepareTrackTimeIndex(points);
 const cell=Math.floor((time-start)/TRACK_SAMPLE_SECONDS);
 let index=boundaries[cell];
 while(index<points.length&&(points[index][2]<time||(after&&points[index][2]===time)))index++;
 return index;
}
