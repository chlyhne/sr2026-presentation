const HANDICAP_TRACKS_KEY='sr2026-handicap-compensated-tracks',GHOST_FINISH_HOLD=300;
const ghostClocks=new Map();
let handicapTracksEnabled=false,handicapPreferenceError='';
// Prepare every boat before interaction. Selection and styling only read clocks.
const ghostCourses=new Map();
const HANDICAP_COMMON_START=Math.max(...boats.map(boat=>boat.raceStartTime));
for(const boat of boats){
 let course=ghostCourses.get(boat.course);
 if(!course){course={handicap:0};ghostCourses.set(boat.course,course);}
 course.handicap=Math.max(course.handicap,boat.handicapSecondsPerNm);
}
for(const boat of boats){
 const course=ghostCourses.get(boat.course);
 ghostClocks.set(boat.id,prepareGhostClock(boat,HANDICAP_COMMON_START,course.handicap));
}
const VIEWER_DATA_END=Math.ceil(Math.max(D.end,...[...ghostClocks.values()].filter(clock=>!clock.error).map(clock=>clock.end+GHOST_FINISH_HOLD)));
try{
 const stored=JSON.parse(localStorage.getItem(HANDICAP_TRACKS_KEY)??'false');
 if(typeof stored!=='boolean')throw Error('Ugyldigt valg.');
 handicapTracksEnabled=stored;
}catch(error){handicapPreferenceError='Handicapkompenseret spor kunne ikke indlæses: '+error.message;}
function trackUsesBoatColour(){return handicapTracksEnabled||comparison.boatColour;}
function trackUsesComparison(){return !handicapTracksEnabled&&comparison.enabled;}
function syncHandicapTracks(){
 $('handicapCompensatedTracks').checked=handicapTracksEnabled;
 const missing=handicapTracksEnabled?boats.filter(boat=>boatIsDisplayed(boat)&&chosen.has(boat.name)&&ghostClocks.get(boat.id).error):[];
 const message=handicapPreferenceError||(missing.length?`Handicapkompensation mangler for ${missing.map(boat=>boat.name).join(', ')}: ${[...new Set(missing.map(boat=>ghostClocks.get(boat.id).error))].join(' · ')}.`:'');
 if($('ghostStatus').textContent!==message)$('ghostStatus').textContent=message;
 $('ghostStatus').hidden=!message;
}
function setHandicapTracks(enabled){
 try{localStorage.setItem(HANDICAP_TRACKS_KEY,JSON.stringify(enabled));}
 catch{handicapPreferenceError='Handicapkompenseret spor kunne ikke gemmes.';syncHandicapTracks();return false;}
 handicapTracksEnabled=enabled;handicapPreferenceError='';syncHandicapTracks();
 clearTrackHover();comparisonMessage('');syncNavigationControls();renderTrackSpeedLegend();
 updateTimeline({preserveTime:true});requestRender();return true;
}
$('handicapCompensatedTracks').onchange=event=>setHandicapTracks(event.target.checked);
function handicapBoatPosition(boat,time){
 const clock=ghostClocks.get(boat.id);if(!clock||clock.error||time<clock.start||time>clock.end+GHOST_FINISH_HOLD)return null;
 const sourceTime=time>=clock.end?clock.sourceEnd:ghostSourceAtTime(clock,time);
 const position=trackPosition(boat.points,sourceTime);
 return position?{...position,replayTime:sourceTime,finished:time>=clock.end}:null;
}
function displayBoatPosition(boat,time){
 if(handicapTracksEnabled)return handicapBoatPosition(boat,time);
 const position=trackPosition(boat.points,time);return position?{...position,replayTime:time}:null;
}
function displayTrackWindow(boat,time){
 const from=time-trackWindowSeconds();
 if(!handicapTracksEnabled)return {from,to:time};
 const clock=ghostClocks.get(boat.id);
 if(!clock||clock.error||time<clock.start||time>clock.end+GHOST_FINISH_HOLD)return null;
 return {from:ghostSourceAtTime(clock,trackLengthSeconds===0?clock.start:Math.min(clock.end,Math.max(clock.start,from))),
  to:ghostSourceAtTime(clock,Math.min(clock.end,time))};
}
function displayedTrackTime(boat,sourceTime){
 if(!handicapTracksEnabled)return sourceTime;
 const clock=ghostClocks.get(boat.id);return clock&&!clock.error?ghostClockAtSource(clock,sourceTime):null;
}
function viewerEndTime(){
 let end=D.end;
 for(const boat of boats)if(handicapTracksEnabled&&boatIsDisplayed(boat)){
  const clock=ghostClocks.get(boat.id);if(!clock.error)end=Math.max(end,Math.ceil(clock.end+GHOST_FINISH_HOLD));
 }
 return end;
}
syncNavigationControls();
