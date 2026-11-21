const REFERENCE_STATION_METERS=10;
const TRACK_TIME_OVERFLOW=Math.fround(1e15);
function timeGainPer100Meters(ownTime,referenceTime){
 if(typeof ownTime!=='number'||typeof referenceTime!=='number'||!(ownTime>=0)||!(referenceTime>=0))return null;
 const own=Math.min(ownTime,TRACK_TIME_OVERFLOW),reference=Math.min(referenceTime,TRACK_TIME_OVERFLOW);
 if(own===TRACK_TIME_OVERFLOW&&reference===TRACK_TIME_OVERFLOW)return null;
 return 100*(reference-own);
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
