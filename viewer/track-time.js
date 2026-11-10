function timeBoundary(points,time,after=false){
 let lo=0,hi=points.length;
 while(lo<hi){
  const mid=(lo+hi)>>>1,stamp=points[mid][2];
  if(stamp<time||(after&&stamp===time))lo=mid+1;else hi=mid;
 }
 return lo;
}
