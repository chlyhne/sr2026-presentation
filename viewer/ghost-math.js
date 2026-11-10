// A ghost changes only the clock used to sample the original PCHIP track.
// The ToD allowance uses the race's official length, never extra sailed miles.
function prepareGhostClock(boat,commonStart,baselineHandicap){
 const {points,raceStartTime:start,raceFinishTime:finish,courseLengthNm:length,handicapSecondsPerNm:handicap}=boat;
 if(!Number.isFinite(start))return {error:'Klassestart mangler'};
 if(!Number.isFinite(finish)||finish<=start)return {error:'Registreret måltid mangler'};
 if(!Number.isFinite(length)||length<=0||!Number.isFinite(handicap)||handicap<=0)return {error:'Handicap eller banelængde mangler'};
 if(commonStart<start||baselineHandicap<handicap)throw Error('Spøgelsesbådens fælles grundlag er ugyldigt.');
 const first=trackPosition(points,start),last=trackPosition(points,finish);
 if(!first||!last)return {error:'Tracking mangler ved start eller mål'};
 const stamps=[start],distances=[0];let previous=first.point,total=0;
 for(const point of points){
  if(point[2]<=start||point[2]>=finish)continue;
  total+=rhumbLeg(previous,point).distance;stamps.push(point[2]);distances.push(total);previous=point;
 }
 total+=rhumbLeg(previous,last.point).distance;stamps.push(finish);distances.push(total);
 if(!(total>0))return {error:'Sejlet distance mangler'};
 const allowance=(baselineHandicap-handicap)*length;
 const sourceTimes=Float64Array.from(stamps),times=Float64Array.from(stamps,(time,i)=>commonStart+(time-start)+allowance*distances[i]/total);
 for(let i=1;i<times.length;i++)if(!(times[i]>times[i-1]))throw Error('Spøgelsesbådens tidsforløb er ikke stigende.');
 return {sourceTimes,times,sourceStart:start,sourceEnd:finish,start:commonStart,end:times.at(-1),allowance,baselineHandicap};
}
function ghostClockLookup(from,to,time){
 if(time<from[0]||time>from.at(-1))return null;
 let lo=0,hi=from.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(from[mid]<=time)lo=mid+1;else hi=mid;}
 const i=lo-1;
 if(time===from[i]||i===from.length-1)return to[i];
 return to[i]+(to[i+1]-to[i])*(time-from[i])/(from[i+1]-from[i]);
}
function ghostClockAtSource(clock,time){return ghostClockLookup(clock.sourceTimes,clock.times,time);}
function ghostSourceAtTime(clock,time){return ghostClockLookup(clock.times,clock.sourceTimes,time);}
