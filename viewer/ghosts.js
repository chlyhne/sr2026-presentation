const GHOST_BOATS_KEY='sr2026-ghost-boats',GHOST_FINISH_HOLD=300;
const ghostClocks=new Map(),ghostBoatIds=new Set();
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
function ghostMessage(message){$('ghostStatus').textContent=message;$('ghostStatus').hidden=!message;}
try{
 const stored=JSON.parse(localStorage.getItem(GHOST_BOATS_KEY)??'[]');
 if(!Array.isArray(stored)||stored.some(id=>!ghostClocks.has(id))||new Set(stored).size!==stored.length)throw Error('Ugyldigt bådvalg.');
 for(const id of stored)ghostBoatIds.add(id);
 const missing=boats.filter(boat=>ghostBoatIds.has(boat.id)&&ghostClocks.get(boat.id).error);
 if(missing.length)ghostMessage(missing.map(boat=>boat.name+': '+ghostClocks.get(boat.id).error).join(' · '));
}catch(error){ghostMessage('Spøgelsesbåde kunne ikke indlæses: '+error.message);}
let ghostChoicesKey=null;
function syncGhostChoices(){
 const displayed=boats.filter(boat=>boatIsDisplayed(boat)||ghostBoatIds.has(boat.id));
 const key=JSON.stringify([displayed.map(boat=>boat.id),[...ghostBoatIds]]);if(key===ghostChoicesKey)return;
 ghostChoicesKey=key;$('ghostBoatChoices').replaceChildren();
 $('ghostBoatsEmpty').hidden=displayed.length>0;
 for(const boat of displayed){
  const clock=ghostClocks.get(boat.id),label=document.createElement('label'),input=document.createElement('input');
  input.type='checkbox';input.checked=ghostBoatIds.has(boat.id);input.value=boat.id;
  input.disabled=!!clock.error&&!input.checked;input.setAttribute('aria-label','Spøgelse: '+boat.name);
  input.onchange=()=>setGhostBoat(boat.id,input.checked);
  const name=document.createElement('span');name.textContent=boat.name;label.append(input,name);
  label.style.setProperty('--boat-colour',colours[boat.name]);
  if(clock.error){const reason=document.createElement('small');reason.textContent=clock.error;label.append(reason);}
  else label.title=`Eget handicap: ${boat.handicapSecondsPerNm} s/sm · fælles start ${fmt(clock.start)} · spøgelse i mål ${fmt(clock.end)}`;
  $('ghostBoatChoices').append(label);
 }
}
function setGhostBoat(id,enabled){
 const clock=ghostClocks.get(id);
 if(!clock||(enabled&&clock.error)){ghostMessage(clock?.error||'Ukendt båd.');ghostChoicesKey=null;syncGhostChoices();return false;}
 const next=new Set(ghostBoatIds);if(enabled)next.add(id);else next.delete(id);
 try{localStorage.setItem(GHOST_BOATS_KEY,JSON.stringify([...next]));}
 catch{ghostMessage('Valget af spøgelsesbåde kunne ikke gemmes.');ghostChoicesKey=null;syncGhostChoices();return false;}
 ghostBoatIds.clear();for(const selected of next)ghostBoatIds.add(selected);
 ghostMessage('');syncGhostChoices();updateTimeline({preserveTime:true});requestRender();return true;
}
function ghostPosition(boat,time){
 const clock=ghostClocks.get(boat.id);if(!clock||clock.error||time<clock.start||time>clock.end+GHOST_FINISH_HOLD)return null;
 const sourceTime=time>=clock.end?clock.sourceEnd:ghostSourceAtTime(clock,time);
 const position=trackPosition(boat.points,sourceTime);
 return position?{...position,replayTime:sourceTime,finished:time>=clock.end}:null;
}
function viewerEndTime(){
 let end=D.end;
 for(const boat of boats)if(ghostBoatIds.has(boat.id)&&boatIsDisplayed(boat)){
  const clock=ghostClocks.get(boat.id);if(!clock.error)end=Math.max(end,Math.ceil(clock.end+GHOST_FINISH_HOLD));
 }
 return end;
}
function renderGhostBoats(time,order){
 const layer=$('ghostBoatMarkers');layer.replaceChildren();syncGhostChoices();
 for(const boat of order){
  if(!ghostBoatIds.has(boat.id))continue;
  const position=ghostPosition(boat,time);if(!position)continue;
  const [x,y]=xy(position.point),group=screenGroup(x,y,layer),colour=colours[boat.name];
  group.setAttribute('class','ghost-boat');group.dataset.ghostBoat=boat.id;group.dataset.sourceTime=position.replayTime;
  group.setAttribute('opacity','.38');group.setAttribute('role','img');
  group.setAttribute('aria-label',`${boat.name} · spøgelse${position.finished?' · i mål':''}`);
  renderBoatIcon(group,boat,position,position.replayTime,colour);
  if(shownBoatNames.has(boat.id))el('text',{class:'boat-name',x:7,y:-12,fill:colour,'font-size':12,'font-weight':700,
   stroke:'#14212a','stroke-width':3,'paint-order':'stroke'},group).textContent=boat.name+' · spøgelse'+(position.finished?' · i mål':'');
 }
}
