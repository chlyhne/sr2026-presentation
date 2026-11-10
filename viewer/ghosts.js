const HANDICAP_TRACKS_KEY='sr2026-handicap-compensated-tracks',GHOST_FINISH_HOLD=300;
const ghostClocks=new Map();
let handicapTracksEnabled=false,handicapPreferenceError='';
// Prepare every boat before interaction. Selection and styling only read clocks.
const ghostCourses=new Map();
for(const boat of boats){
 let course=ghostCourses.get(boat.course);
 if(!course){course={start:-Infinity,handicap:0};ghostCourses.set(boat.course,course);}
 course.start=Math.max(course.start,boat.raceStartTime);
 course.handicap=Math.max(course.handicap,boat.handicapSecondsPerNm);
}
for(const boat of boats){
 const course=ghostCourses.get(boat.course);
 ghostClocks.set(boat.id,prepareGhostClock(boat,course.start,course.handicap));
}
const VIEWER_DATA_END=Math.ceil(Math.max(D.end,...[...ghostClocks.values()].filter(clock=>!clock.error).map(clock=>clock.end+GHOST_FINISH_HOLD)));
try{
 const stored=JSON.parse(localStorage.getItem(HANDICAP_TRACKS_KEY)??'false');
 if(typeof stored!=='boolean')throw Error('Ugyldigt valg.');
 handicapTracksEnabled=stored;
}catch(error){handicapPreferenceError='Handicapkompenseret spor kunne ikke indlæses: '+error.message;}
function showHandicapGhost(boat){return handicapTracksEnabled&&chosen.has(boat.name)&&boatIsDisplayed(boat);}
function syncHandicapTracks(){
 $('handicapCompensatedTracks').checked=handicapTracksEnabled;
 const missing=boats.filter(boat=>showHandicapGhost(boat)&&ghostClocks.get(boat.id).error);
 const message=handicapPreferenceError||(missing.length?`Handicapkompensation mangler for ${missing.map(boat=>boat.name).join(', ')}: ${[...new Set(missing.map(boat=>ghostClocks.get(boat.id).error))].join(' · ')}.`:'');
 if($('ghostStatus').textContent!==message)$('ghostStatus').textContent=message;
 $('ghostStatus').hidden=!message;
}
function setHandicapTracks(enabled){
 try{localStorage.setItem(HANDICAP_TRACKS_KEY,JSON.stringify(enabled));}
 catch{handicapPreferenceError='Handicapkompenseret spor kunne ikke gemmes.';syncHandicapTracks();return false;}
 handicapTracksEnabled=enabled;handicapPreferenceError='';syncHandicapTracks();
 updateTimeline({preserveTime:true});requestRender();return true;
}
$('handicapCompensatedTracks').onchange=event=>setHandicapTracks(event.target.checked);
function ghostPosition(boat,time){
 const clock=ghostClocks.get(boat.id);if(!clock||clock.error||time<clock.start||time>clock.end+GHOST_FINISH_HOLD)return null;
 const sourceTime=time>=clock.end?clock.sourceEnd:ghostSourceAtTime(clock,time);
 const position=trackPosition(boat.points,sourceTime);
 return position?{...position,replayTime:sourceTime,finished:time>=clock.end}:null;
}
function viewerEndTime(){
 let end=D.end;
 for(const boat of boats)if(showHandicapGhost(boat)){
  const clock=ghostClocks.get(boat.id);if(!clock.error)end=Math.max(end,Math.ceil(clock.end+GHOST_FINISH_HOLD));
 }
 return end;
}
function renderGhostBoats(time,order){
 const layer=$('ghostBoatMarkers');layer.replaceChildren();syncHandicapTracks();
 for(const boat of order){
  if(!showHandicapGhost(boat))continue;
  const position=ghostPosition(boat,time);if(!position)continue;
  const [x,y]=xy(position.point),group=screenGroup(x,y,layer),colour=colours[boat.name];
  group.setAttribute('class','ghost-boat');group.dataset.ghostBoat=boat.id;group.dataset.sourceTime=position.replayTime;
  group.setAttribute('opacity','.38');group.setAttribute('role','img');
  group.setAttribute('aria-label',`${boat.name} · handicapkompenseret${position.finished?' · i mål':''}`);
  renderBoatIcon(group,boat,position,position.replayTime,colour);
  if(shownBoatNames.has(boat.id))el('text',{class:'boat-name',x:7,y:-12,fill:colour,'font-size':12,'font-weight':700,
   stroke:'#14212a','stroke-width':3,'paint-order':'stroke'},group).textContent=boat.name+' · handicap'+(position.finished?' · i mål':'');
 }
}
