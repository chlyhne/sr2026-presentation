const REFERENCE_STATION_METERS=10;
const TRACK_TIME_MISSING=-1e20,TRACK_TIME_OVERFLOW=Math.fround(1e15);
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
function referenceStationCount(){return Math.ceil(rhumbRoute.total*1852/REFERENCE_STATION_METERS)+1;}
function referenceStationIndex(progress){
 if(!Number.isFinite(progress)||progress<0||progress>rhumbRoute.total)return -1;
 return Math.floor(progress*(1852/REFERENCE_STATION_METERS)+0.5);
}
function referenceAtStation(index,values){
 if(!Number.isInteger(index)||index<0||index>=values.length||!(values[index]>=0))return null;
 return {vmg:values[index]};
}
function referenceProfileAtProgress(progress,values){return referenceAtStation(referenceStationIndex(progress),values);}
