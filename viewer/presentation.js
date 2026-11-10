let notes=[];
function chronologicalNotes(list){return [...list].sort((a,b)=>a.time-b.time);}
{
 const saved=JSON.parse(SRStorage.getItem('sr2026-notes')??'[]');
 if(!Array.isArray(saved)||saved.some(n=>!n||!Number.isFinite(n.time)||typeof n.text!=='string'))throw Error('De gemte noter er ugyldige.');
 notes=chronologicalNotes(saved);
 if(notes.some((n,i)=>n!==saved[i]))SRStorage.setItem('sr2026-notes',JSON.stringify(notes));
}
let activePresentationNote=null,presentationOwnsFullscreen=false;
let editingNote=null,noteDraft=null;
let placingNote=false;
const annotationHelp='Skriv en tekst, og placér den på kortet. Noten husker tidspunkt, udsnit og valgte lag.';
const eventDateFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function eventTimeInputValue(time){
 const p=Object.fromEntries(eventDateFormatter.formatToParts(new Date(time*1000)).map(p=>[p.type,p.value]));
 return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
function parseEventTimeInput(value){
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);if(!match)return null;
 const [,year,month,day,hour,minute,second='00']=match;
 const target=Date.UTC(+year,+month-1,+day,+hour,+minute,+second)/1000;
 let time=target;
 // Resolve the entered Copenhagen wall time independently of the browser zone.
 for(let i=0;i<3;i++)time+=target-Date.parse(eventTimeInputValue(time)+'Z')/1000;
 return eventTimeInputValue(time)===`${year}-${month}-${day}T${hour}:${minute}:${second}`?time:null;
}
function stopPlayback() {
 if(interval) {clearInterval(interval);interval=null;}
 syncPlaybackControls();
 if(eventPlaybackTarget){$('presentationMessage').textContent='';$('nextEvent').title='Afspil frem til næste event';}
 eventPlaybackTarget=null;
 $('play').disabled=$('time').disabled;
}
function cancelPlacement() {
 placingNote=false;$('map').classList.remove('placing');$('cancelNote').hidden=true;
 $('placeNote').textContent=editingNote?'Flyt / tilføj markør':'Placér på kortet';
 $('annotationStatus').textContent=editingNote?'Redigér tidspunkt, tekst, markør eller tegninger. Gem ændringer gemmer også det aktuelle kortudsnit og lag.':annotationHelp;
}
function persistNotes(next){
 if(window.SR_READONLY)return false;
 try {SRStorage.setItem('sr2026-notes',JSON.stringify(chronologicalNotes(next)));return true;}
 catch {$('annotationStatus').textContent='Browseren kan ikke gemme noter. Eksportér dem før du lukker.';return false;}
}
function sceneSettings() {
 return {wind:$('wind').checked,windModel:$('windModel').value,windNumbers:$('windNumbers').checked,
  rain:$('rain').checked,rainOpacity:+$('rainOpacity').value,grid:$('grid').checked,traffic:$('traffic').checked,military:$('military').checked,annotationsVisible:$('annotationsVisible').checked,boats:[...chosen],boatNames:[...shownBoatNames]};
}
const EVENT_LAYER_KEYS=['wind','windNumbers','rain','grid','traffic','military','annotationsVisible','windModel','rainOpacity'];
function layerSettings(){
 const settings=sceneSettings();
 return Object.fromEntries(EVENT_LAYER_KEYS.map(key=>[key,settings[key]]));
}
function applyLayerSettings(settings){
 for(const id of EVENT_LAYER_KEYS){
  if(typeof settings[id]==='boolean')$(id).checked=settings[id];
 }
 if(D.wind_models[settings.windModel])$('windModel').value=settings.windModel;
 if(Number.isFinite(settings.rainOpacity))$('rainOpacity').value=settings.rainOpacity;
}
function editableSettingsEvent(){
 return !window.SR_READONLY&&!document.body.classList.contains('presenting')&&!editingNote&&!pendingEventImage&&!hasPendingEventVideo()&&!eventImageLoading&&!$('note').value.trim()
  &&notes.includes(activePresentationNote)&&activePresentationNote.time===currentTime()?activePresentationNote:null;
}
let lastLayerSettings=layerSettings();
function changeEventLayers(event){
 const next=layerSettings(),key=event.currentTarget.id,changes={[key]:next[key]};
 if(!finishInlineTextEditing()){applyLayerSettings(lastLayerSettings);requestRender();return;}
 const target=editableSettingsEvent();
 if(target){
  const updated={...target,settings:{...target.settings,...changes}};
  if(!persistNotes(notes.map(n=>n===target?updated:n))){
   applyLayerSettings(lastLayerSettings);requestRender();return;
  }
  target.settings=updated.settings;
 }else if(editingNote)noteDraft.settings={...noteDraft.settings,...changes};
 lastLayerSettings=next;requestRender();
}
for(const id of EVENT_LAYER_KEYS)$(id).onchange=changeEventLayers;
function changeBoatSelection(change){
 if(!finishInlineTextEditing()){syncBoatChoices();return;}
 stopPlayback();
 const before=[...chosen],beforeNames=[...shownBoatNames],time=currentTime();
 const target=editableSettingsEvent();
 change();
 for(const boat of boats)if(chosen.has(boat.name)&&!before.includes(boat.name))shownBoatNames.add(boat.id);
 if(target){
  const updated={...target,settings:{...target.settings,boats:[...chosen],boatNames:[...shownBoatNames]}};
  if(!persistNotes(notes.map(n=>n===target?updated:n))){
   shownBoatNames.clear();beforeNames.forEach(id=>shownBoatNames.add(id));
   chosen.clear();before.forEach(name=>chosen.add(name));syncBoatChoices();
   $('eventBoatStatus').textContent='Bådvalget kunne ikke gemmes til eventet.';return;
  }
  target.settings=updated.settings;
 }else if(editingNote)noteDraft.settings={...noteDraft.settings,boats:[...chosen],boatNames:[...shownBoatNames]};
 prepareSelectedTracks();
 $('eventBoatStatus').textContent='';syncBoatChoices();updateTimeline({preserveTime:isBoatSearchActive()});
 if(target){activePresentationNote=target;selectedTime=time;$('time').value=offsetAtTime(time);$('time').setAttribute('aria-valuetext',fmt(time));}
 requestRender();
}
function saveAnnotation(point) {
 if(!finishInlineTextEditing())return;
 const text=$('note').value.trim();
 if(eventImageLoading)return;
 if(!validateEventVideoInput())return;
 if(!text&&!currentAttachedImage()&&!currentAttachedVideo()){$('annotationStatus').textContent='Skriv en tekst, vælg et billede, eller indsæt et YouTube-link til eventet.';$('note').focus();return;}
 if(editingNote){
  if(point){noteDraft.point=point;noteDraft.lon=9.5+point[0]*4.5/1000;noteDraft.lat=57-point[1]*3/1180;cancelPlacement();renderAnnotations();return;}
  const time=parseEventTimeInput($('noteTime').value);
  if(!$('noteTime').validity.valid||time===null||time<D.start||time>VIEWER_DATA_END){
   $('annotationStatus').textContent='Vælg et gyldigt tidspunkt inden for sejladsens tidsrum (dansk tid).';$('noteTime').focus();return;
  }
  cancelDrawingGesture();
  const updated={...noteDraft,text,view:[...view],settings:sceneSettings()};
  if(time!==Math.floor(editingNote.time)){
   updated.time=time;updated.utc=new Date(time*1000).toISOString();
  }
  if(!persistNotes(notes.map(n=>n===editingNote?updated:n)))return;
  Object.assign(editingNote,updated);
  const saved=editingNote;finishNoteEditing();showNotes();updateTimeline();restoreNote(saved);return;
 }
 const time=currentTime();
 const note={time,utc:new Date(time*1000).toISOString(),text,view:[...view],settings:sceneSettings()};
 if(pendingEventImage)note.image=pendingEventImage;
 if(pendingEventVideo)note.video=pendingEventVideo;
 if(point){note.point=point;note.lon=9.5+point[0]*4.5/1000;note.lat=57-point[1]*3/1180;}
 const next=chronologicalNotes([...notes,note]);
 if(!persistNotes(next))return;
 notes=next;pendingEventImage=null;clearPendingEventImage();clearPendingEventVideo();$('note').value='';
 activePresentationNote=note;cancelPlacement();showNotes();updateTimeline();renderAnnotations();
}
$('placeNote').onclick=()=>{
 if(!validateEventVideoInput())return;
 if(!$('note').value.trim()&&!currentAttachedImage()&&!currentAttachedVideo()) {$('annotationStatus').textContent='Skriv en tekst, vælg et billede, eller indsæt et YouTube-link til eventet.';$('note').focus();return;}
 stopPlayback();setDrawingTool('pan');placingNote=true;$('map').classList.add('placing');$('cancelNote').hidden=false;
 $('placeNote').textContent='Klik på kortet …';$('annotationStatus').textContent='Klik dér, hvor hændelsen skete. Du kan stadig zoome og trække. Escape annullerer.';
};
$('cancelNote').onclick=cancelPlacement;
function placeAnnotation(e) {
 const p=new DOMPoint(e.clientX,e.clientY).matrixTransform($('map').getScreenCTM().inverse());
 saveAnnotation([p.x,p.y]);
}
$('save').onclick=()=>saveAnnotation();

function noteNavigationAllowed(){
 if(!finishInlineTextEditing())return false;
 if(!editingNote&&!eventImageLoading&&!pendingEventImage&&!hasPendingEventVideo())return true;
 $('annotationStatus').textContent=editingNote?'Gem ændringer eller annullér redigeringen, før du vælger en anden note eller starter præsentationen.':'Gem eventet eller fjern billedet/videoen, før du vælger en anden note eller starter præsentationen.';
 $('save').scrollIntoView({block:'nearest'});return false;
}
function beginNoteEditing(n){
 if(!finishInlineTextEditing())return;
 if(editingNote){if(editingNote!==n)noteNavigationAllowed();return;}
 if(!noteNavigationAllowed())return;
 restoreNote(n);editingNote=n;noteDraft=JSON.parse(JSON.stringify(n));
 $('noteTimeField').hidden=false;$('noteTime').min=eventTimeInputValue(D.start);$('noteTime').max=eventTimeInputValue(VIEWER_DATA_END);$('noteTime').value=eventTimeInputValue(n.time);
 $('noteVideo').value=validatedEventVideo(n.video)?.url||'';updateVideoEditor();
 $('note').value=n.text;$('drawingTools').hidden=false;$('cancelEdit').hidden=false;
 $('noteEditorTitle').textContent=`Redigerer note ${notes.indexOf(n)+1} · ${fmt(n.time)}`;
 $('save').textContent='Gem ændringer';
 for(const id of ['time','back','next','play'])$(id).disabled=true;
 cancelPlacement();updateImageEditor();updateDrawingControls();showNotes();renderAnnotations();
 $('note').scrollIntoView({block:'center'});$('note').focus({preventScroll:true});
}
function finishNoteEditing(){
 imageUploadToken++;eventImageLoading=false;$('noteImage').value='';
 cancelDrawingGesture();setDrawingTool('pan');editingNote=null;noteDraft=null;
 clearPendingEventVideo();
 $('note').value='';$('drawingTools').hidden=true;$('cancelEdit').hidden=true;
 $('noteTimeField').hidden=true;$('noteTime').value='';
 $('noteEditorTitle').textContent='Ny note · vælg Redigér ved en eksisterende note for at ændre den eller tegne.';
 updateImageEditor();cancelPlacement();updateTimeline();
}
$('cancelEdit').onclick=()=>{finishInlineTextEditing(true);const original=editingNote;finishNoteEditing();showNotes();if(original)restoreNote(original);};
function restoreNote(n,{showImage=false,restoreView=true}={}) {
 if(!finishInlineTextEditing())return;
 if(editingNote){if(editingNote!==n)noteNavigationAllowed();return;}
 if(!noteNavigationAllowed())return;
 hideMapEventImage();hideEventVideo();
 activePresentationNote=n;
 stopPlayback();cancelPlacement();selectedTime=n.time;
 if(n.settings) {
  const s=n.settings;
  applyLayerSettings(s);
  if(Array.isArray(s.boats)) {
   chosen.clear();s.boats.forEach(name=>chosen.add(name));
   syncBoatChoices();
  }
  if(Array.isArray(s.boatNames)) {
   shownBoatNames.clear();s.boatNames.forEach(id=>shownBoatNames.add(id));
  }
 }
 prepareSelectedTracks();
 if(restoreView&&Array.isArray(n.view)&&n.view.length===4&&n.view.every(Number.isFinite)&&n.view[2]>0&&n.view[3]>0) {view=[...n.view];setview();}
 updateTimeline();selectedTime=n.time;$('time').value=offsetAtTime(n.time);
 $('time').setAttribute('aria-valuetext',fmt(n.time));
 $('annotationsVisible').checked=typeof n.settings?.annotationsVisible==='boolean'?n.settings.annotationsVisible:true;
 lastLayerSettings=layerSettings();render();updatePresentationControls();
 if(showImage&&n.image)showMapEventImage(n.image,n);
}
function showNotes() {
 notes.sort((a,b)=>a.time-b.time);
 $('notes').replaceChildren();
 for(const [i,n] of notes.entries()) {
  const row=document.createElement('div');row.className='note'+(n===editingNote?' editing':'');
  const jump=document.createElement('button');jump.className='note-jump';
  jump.textContent=`${i+1}. ${fmt(n.time)} — ${eventNoteLabel(n)}`;jump.onclick=()=>restoreNote(n,{showImage:true});
  const actions=document.createElement('div');actions.className='note-actions';
  const edit=document.createElement('button');edit.className='note-edit';edit.textContent='Redigér';
  edit.setAttribute('aria-label',`Redigér note: ${n.text}`);edit.onclick=()=>beginNoteEditing(n);
  const remove=document.createElement('button');remove.className='note-delete';remove.textContent='Slet';
  remove.setAttribute('aria-label',`Slet note: ${n.text}`);
  remove.onclick=()=>{if(!noteNavigationAllowed())return;const next=notes.filter((_,j)=>j!==i);if(!persistNotes(next))return;notes=next;showNotes();updateTimeline();renderAnnotations();};
  actions.append(edit,remove);row.append(jump,actions);$('notes').append(row);
 }
 refreshPresentationEvents();
}

function refreshPresentationEvents(){
 const select=$('eventSelect');select.replaceChildren();
 for(const [i,n] of notes.entries()){
  const option=document.createElement('option');option.value=i;
  option.textContent=`${i+1} · ${fmt(n.time)} · ${eventNoteLabel(n).replace(/\s+/g,' ')}`;
  select.append(option);
 }
 if(!notes.length){
  const option=document.createElement('option');option.textContent='Ingen events endnu';select.append(option);
 }
 updatePresentationControls();
}
function updatePresentationControls(){
 const index=Math.max(0,notes.indexOf(activePresentationNote)),note=notes[index];
 const pendingMedia=!!pendingEventImage||hasPendingEventVideo();
 const preview=editingNote?{...noteDraft,text:$('note').value}:pendingMedia?{time:currentTime(),text:$('note').value,image:pendingEventImage,video:pendingEventVideo}:note;
 $('previousEvent').disabled=!note||index===0;
 $('nextEvent').disabled=document.body.classList.contains('presenting')?!nextPresentationNote():!note||index===notes.length-1;
 $('nextEvent').title=eventPlaybackTarget?'Spring direkte til næste event':document.body.classList.contains('presenting')?'Afspil frem til næste event':'Næste event';
 $('eventSelect').disabled=!note;
 if(note)$('eventSelect').value=String(index);
 if(preview){
  $('eventCounter').textContent=pendingMedia?'Nyt event':`Event ${index+1} af ${notes.length}${editingNote?' · redigerer':''}`;
  $('eventTime').textContent=fmt(preview.time);
  $('eventTime').dateTime=new Date(preview.time*1000).toISOString();
  $('eventText').textContent=preview.text;
 }else{
  $('eventCounter').textContent='0 events';$('eventTime').textContent='';$('eventTime').removeAttribute('datetime');
  $('eventText').textContent='Ingen events endnu. Tryk Redigér, og gem dine events som noter på kortet.';
 }
 renderEventImage(preview?.image,editingNote||(pendingMedia?null:note));
 renderEventVideo(preview?.video,editingNote||(pendingMedia?null:note));
 const editable=!!preview&&!document.body.classList.contains('presenting')&&!eventImageLoading;
 $('eventText').classList.toggle('inline-editable',editable);
 if(editable){$('eventText').setAttribute('tabindex','0');$('eventText').setAttribute('role','button');$('eventText').title='Klik for at redigere teksten';}
 else{$('eventText').removeAttribute('tabindex');$('eventText').removeAttribute('role');$('eventText').removeAttribute('title');}
}
function showPresentationEvent(index){
 if(!notes.length)return;
 restoreNote(notes[Math.max(0,Math.min(notes.length-1,index))],{showImage:true});
}
function movePresentationEvent(delta){
 if(delta===1&&document.body.classList.contains('presenting')){playToNextPresentationEvent();return;}
 showPresentationEvent(Math.max(0,notes.indexOf(activePresentationNote))+delta);
}
function nextPresentationNote(){
 if(eventPlaybackTarget&&notes.includes(eventPlaybackTarget))return eventPlaybackTarget;
 const time=currentTime(),index=notes.indexOf(activePresentationNote);
 if(index>=0&&Math.abs(activePresentationNote.time-time)<1e-6)return notes[index+1]||null;
 return notes.find(note=>note.time>time+1e-6)||null;
}
function playToNextPresentationEvent(){
 if(hasRenderingFailure())return;
 if(!noteNavigationAllowed())return;
 const target=nextPresentationNote();if(!target)return;
 const onEvent=notes.some(note=>Math.abs(note.time-currentTime())<1e-6);
 if(eventPlaybackTarget||target.time<=currentTime()||(interval&&!onEvent)){
  restoreNote(target,{showImage:true});return;
 }
 stopPlayback();hideMapEventImage();hideEventVideo();cancelPlacement();
 startPlayback({target});
 $('presentationMessage').textContent=`Afspiller frem til event ${notes.indexOf(target)+1}. Tryk Næste event igen for at springe frem.`;
 updatePresentationControls();
}
function setPresentationMode(enabled){
 if(!enabled&&window.SR_READONLY)return;
 if(!finishInlineTextEditing())return;
 if(document.body.classList.contains('presenting')===enabled)return;
 if(enabled&&!noteNavigationAllowed())return;
 if(!enabled){hideMapEventImage();hideEventVideo();}
 stopPlayback();cancelPlacement();
 document.body.classList.toggle('presenting',enabled);
 $('editingTimeline').hidden=false;$('presentationFooter').hidden=false;
 $('startPresentation').hidden=enabled;$('endPresentation').hidden=!enabled;
 $('presentationFullscreen').hidden=!enabled||!document.fullscreenEnabled;
 $('presentationMessage').textContent='';refreshPresentationEvents();
 if(enabled){
  if(notes.length)showPresentationEvent(Math.max(0,notes.indexOf(activePresentationNote)));
  else {updateTimeline();render();}
  ($('nextEvent').disabled?$('endPresentation'):$('nextEvent')).focus();
 }else{
  if(presentationOwnsFullscreen&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  presentationOwnsFullscreen=false;updateTimeline();render();$('startPresentation').focus();
 }
}
function handlePresentationKey(event){
 if(eventVideoView)return;
 if(!document.body.classList.contains('presenting')||event.altKey||event.ctrlKey||event.metaKey)return;
 if(event.key==='Escape'){
  event.preventDefault();event.stopImmediatePropagation();setPresentationMode(false);return;
 }
 if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 if(event.target.closest('[data-boat-marker]')&&['Enter',' '].includes(event.key))return;
 let index;
 if(['ArrowRight','ArrowDown','PageDown'].includes(event.key)||(event.key===' '&&event.target.tagName!=='BUTTON')){
  event.preventDefault();event.stopImmediatePropagation();movePresentationEvent(1);return;
 }
 else if(['ArrowLeft','ArrowUp','PageUp'].includes(event.key))index=Math.max(0,notes.indexOf(activePresentationNote))-1;
 else if(event.key==='Home')index=0;
 else if(event.key==='End')index=notes.length-1;
 if(index!==undefined){event.preventDefault();event.stopImmediatePropagation();showPresentationEvent(index);}
}
function updateFullscreenButton(){
 const active=!!document.fullscreenElement;
 $('presentationFullscreen').textContent=active?'Forlad fuld skærm':'Fuld skærm';
 $('presentationFullscreen').setAttribute('aria-pressed',String(active));
}
$('startPresentation').onclick=()=>setPresentationMode(true);
$('endPresentation').onclick=()=>setPresentationMode(false);
$('previousEvent').onclick=()=>movePresentationEvent(-1);
$('nextEvent').onclick=()=>movePresentationEvent(1);
$('eventSelect').onchange=()=>showPresentationEvent(Number($('eventSelect').value));
document.addEventListener('keydown',handlePresentationKey,true);
document.addEventListener('fullscreenchange',()=>{
 updateFullscreenButton();requestRender({viewportOnly:true});
});
$('presentationFullscreen').onclick=async()=>{
 $('presentationMessage').textContent='';
 try{
  if(document.fullscreenElement){await document.exitFullscreen();presentationOwnsFullscreen=false;}
  else{await document.documentElement.requestFullscreen();presentationOwnsFullscreen=true;}
 }catch{$('presentationMessage').textContent='Browseren kunne ikke åbne fuld skærm. Du kan fortsætte præsentationen her.';}
 updateFullscreenButton();
};
function renderAnnotations() {
 $('annotations').replaceChildren();
 renderSpeedPins();
 renderNoteDrawings();
 updatePresentationControls();
 if(!$('annotationsVisible').checked) return;
 const map=$('map'), matrix=map.getScreenCTM();if(!matrix)return;
 const rect=map.getBoundingClientRect(),scale=Math.hypot(matrix.a,matrix.b);
 for(const [i,saved] of notes.entries()) {
  if(!noteIsVisible(saved))continue;
  const n=saved===editingNote?{...noteDraft,text:$('note').value}:saved;
  if(n.time!==currentTime()||!Array.isArray(n.point)||!n.point.every(Number.isFinite))continue;
  const [x,y]=n.point,screen=new DOMPoint(x,y).matrixTransform(matrix);
  if(screen.x<rect.left||screen.x>rect.right||screen.y<rect.top||screen.y>rect.bottom)continue;
  const group=screenGroup(x,y,$('annotations'));group.dataset.noteIndex=i;
  group.setAttribute('transform',`translate(${x} ${y}) scale(${1/scale})`);
  el('title',{},group).textContent=eventNoteLabel(n);
  el('circle',{r:10,fill:'#ffce5c',stroke:'#132d3d','stroke-width':2},group);
  const number=el('text',{'text-anchor':'middle',y:4,fill:'#132d3d','font-size':11,'font-weight':800},group);number.textContent=i+1;
 }
}
function download(blob,filename) {
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('export').onclick=exportEventNotes;

$('note').addEventListener('input',()=>{if(editingNote)renderAnnotations();else if(pendingEventImage||hasPendingEventVideo())updatePresentationControls();});
updateTimeline();showNotes();render();
new ResizeObserver(resizeMapViewport).observe($('map'));
