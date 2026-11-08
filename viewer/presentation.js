let notes=[];
function chronologicalNotes(list){return [...list].sort((a,b)=>a.time-b.time);}
try {
 const saved=JSON.parse(SRStorage.getItem('sr2026-notes')||'[]');
 if(Array.isArray(saved)){
  notes=chronologicalNotes(saved.filter(n=>n && Number.isFinite(n.time) && typeof n.text==='string'));
  if(notes.length===saved.length&&notes.some((n,i)=>n!==saved[i]))SRStorage.setItem('sr2026-notes',JSON.stringify(notes));
 }
} catch {}
const EVENT_BOATS_INITIALIZED_KEY='sr2026-event-boats-initialized-v1';
try{
 if(window.SR_CONFIG?.local && SRStorage.getItem(EVENT_BOATS_INITIALIZED_KEY)!=='1'){
  const initialized=notes.map(n=>({...n,settings:{...n.settings,boats:[...featured]}}));
  if(!notes.length||persistNotes(initialized)){
   notes=initialized;SRStorage.setItem(EVENT_BOATS_INITIALIZED_KEY,'1');
  }
 }
}catch{}
const ROSA_LUX_ADDED_KEY='sr2026-event-boats-rosa-lux-v1';
try{
 if(window.SR_CONFIG?.local && SRStorage.getItem(ROSA_LUX_ADDED_KEY)!=='1'){
  const updated=notes.map(n=>({...n,settings:{...n.settings,
   boats:[...new Set([...(Array.isArray(n.settings?.boats)?n.settings.boats:featured),'Rosa-Lux'])]}}));
  if(!notes.length||persistNotes(updated)){
   notes=updated;SRStorage.setItem(ROSA_LUX_ADDED_KEY,'1');
  }
 }
}catch{}
const EVENT_BOAT_NAMES_SHOWN_KEY='sr2026-event-boat-names-shown-v1';
try{
 if(window.SR_CONFIG?.local && SRStorage.getItem(EVENT_BOAT_NAMES_SHOWN_KEY)!=='1'){
  const updated=notes.map(n=>{
   const active=new Set(Array.isArray(n.settings?.boats)?n.settings.boats:featured);
   const names=boats.filter(b=>active.has(b.name)).map(b=>b.id);
   return {...n,settings:{...n.settings,boatNames:[...new Set([...(Array.isArray(n.settings?.boatNames)?n.settings.boatNames:[]),...names])]}};
  });
  if(!notes.length||persistNotes(updated)){
   notes=updated;SRStorage.setItem(EVENT_BOAT_NAMES_SHOWN_KEY,'1');
  }
 }
}catch{}
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
 if(interval) {clearInterval(interval);interval=null;$('play').textContent='Afspil';}
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
function saveNotes() {
 if(!persistNotes(notes))return false;
 showNotes();updateTimeline();renderAnnotations();
 return true;
}
function sceneSettings() {
 return {wind:$('wind').checked,windModel:$('windModel').value,windNumbers:$('windNumbers').checked,
  rain:$('rain').checked,rainOpacity:+$('rainOpacity').value,traffic:$('traffic').checked,military:$('military').checked,annotationsVisible:$('annotationsVisible').checked,boats:[...chosen],boatNames:[...shownBoatNames]};
}
const EVENT_LAYER_KEYS=['wind','windNumbers','rain','traffic','military','annotationsVisible','windModel','rainOpacity'];
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
 if(!finishInlineTextEditing()){applyLayerSettings(lastLayerSettings);render();return;}
 const target=editableSettingsEvent();
 if(target){
  const updated={...target,settings:{...target.settings,...changes}};
  if(!persistNotes(notes.map(n=>n===target?updated:n))){
   applyLayerSettings(lastLayerSettings);render();return;
  }
  target.settings=updated.settings;
 }else if(editingNote)noteDraft.settings={...noteDraft.settings,...changes};
 lastLayerSettings=next;render();
}
for(const id of EVENT_LAYER_KEYS)$(id).onchange=changeEventLayers;
function changeBoatSelection(change){
 if(!finishInlineTextEditing()){syncBoatChoices();return;}
 stopPlayback();
 const before=[...chosen],time=currentTime();
 const target=editableSettingsEvent();
 change();
 if(target){
  const updated={...target,settings:{...target.settings,boats:[...chosen]}};
  if(!persistNotes(notes.map(n=>n===target?updated:n))){
   chosen.clear();before.forEach(name=>chosen.add(name));syncBoatChoices();
   $('eventBoatStatus').textContent='Bådvalget kunne ikke gemmes til eventet.';return;
  }
  target.settings=updated.settings;
 }else if(editingNote)noteDraft.settings={...noteDraft.settings,boats:[...chosen]};
 prepareSelectedTracks();
 $('eventBoatStatus').textContent='';syncBoatChoices();updateTimeline();
 if(target){activePresentationNote=target;selectedTime=time;$('time').value=offsetAtTime(time);$('time').setAttribute('aria-valuetext',fmt(time));}
 render();
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
  if(!$('noteTime').validity.valid||time===null||time<D.start||time>D.end){
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
 $('noteTimeField').hidden=false;$('noteTime').min=eventTimeInputValue(D.start);$('noteTime').max=eventTimeInputValue(D.end);$('noteTime').value=eventTimeInputValue(n.time);
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
function restoreNote(n,{showImage=false}={}) {
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
 if(Array.isArray(n.view)&&n.view.length===4&&n.view.every(Number.isFinite)&&n.view[2]>0&&n.view[3]>0) {view=[...n.view];setview();}
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
 $('nextEvent').disabled=!note||index===notes.length-1;
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
 showPresentationEvent(Math.max(0,notes.indexOf(activePresentationNote))+delta);
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
 let index;
 if(['ArrowRight','ArrowDown','PageDown'].includes(event.key))index=Math.max(0,notes.indexOf(activePresentationNote))+1;
 else if(['ArrowLeft','ArrowUp','PageUp'].includes(event.key))index=Math.max(0,notes.indexOf(activePresentationNote))-1;
 else if(event.key==='Home')index=0;
 else if(event.key==='End')index=notes.length-1;
 else if(event.key===' '&&event.target.tagName!=='BUTTON')index=Math.max(0,notes.indexOf(activePresentationNote))+1;
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
 updateFullscreenButton();requestAnimationFrame(()=>webglTracks.redraw());
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

const embeddedImages=new Map();
async function embedImage(href) {
 if(href.startsWith('data:'))return href;
 if(embeddedImages.has(href))return embeddedImages.get(href);
 let blob;
 try {
  const response=await fetch(href);if(!response.ok)throw new Error('Billedet kunne ikke hentes.');blob=await response.blob();
 } catch {
  throw new Error(location.protocol==='file:'
   ? 'Åbn siden via den lokale server: python3 scripts/serve_viewer.py'
   : 'Radaren kunne ikke indlæses til billedet. Prøv igen.');
 }
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
 if(embeddedImages.size>=8)embeddedImages.delete(embeddedImages.keys().next().value);
 embeddedImages.set(href,data);return data;
}
async function captureMap() {
 stopPlayback();const button=$('capture');button.disabled=true;$('captureStatus').textContent='Gør kortbilledet klar …';
 let svgURL;
 try {
  // Await the currently requested radar frame, even after a rapid time change.
  let radarPending,windPending;
  do {
   radarPending=radarReady;windPending=windReady;await Promise.all([radarPending,windPending]);
   await Promise.all([radarImageBuffer.paintReady,windImageBuffer.paintReady]);
  }
  while(radarPending!==radarReady||windPending!==windReady);
  if($('wind').checked&&windFieldError)throw new Error('Vindkortet kunne ikke indlæses. Prøv igen.');
  if($('rain').checked && radarStatus==='kunne ikke indlæses')throw new Error('Radaren kunne ikke indlæses. Prøv igen, eller slå radarlaget fra.');
  await document.fonts.ready;
  const map=$('map'),rect=map.getBoundingClientRect(),inverse=map.getScreenCTM().inverse();
  const topLeft=new DOMPoint(rect.left,rect.top).matrixTransform(inverse);
  const bottomRight=new DOMPoint(rect.right,rect.bottom).matrixTransform(inverse);
  // Expand viewBox to include the exact visible area, including SVG's side gutters.
  const bounds=[topLeft.x,topLeft.y,bottomRight.x-topLeft.x,bottomRight.y-topLeft.y];
  const clone=map.cloneNode(true),width=Math.round(rect.width),height=Math.round(rect.height);
  if(webglTracks.active){
   const routes=clone.querySelector('#routes');routes.replaceChildren();
   // Export native cubic SVG at the requested PNG resolution. Canvas elements
   // inside foreignObject are not serializable, and a screen bitmap loses detail.
   for(const boat of webglTracks.order||[]){
    const geometry=trackGeometry(boat.points,currentTime()-7200,currentTime());if(!geometry)continue;
    const group=el('g',{},routes);
    el('path',{d:geometry,fill:'none',stroke:'#17313e','stroke-width':TRACK_OUTLINE_WIDTH,'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'},group);
    for(const segment of trackSpeedGeometry(boat.points,boat.speeds,currentTime()-7200,currentTime()))
     el('path',{d:segment.d,fill:'none',stroke:segment.colour,'stroke-width':TRACK_STROKE_WIDTH,'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'},group);
   }
  }
  for(const host of clone.querySelectorAll('[data-webgl-tracks]'))host.remove();
  for(const control of clone.querySelectorAll('[data-speed-action],.track-hit-targets'))control.remove();
  const time=currentTime(),model=$('windModel').value,radarMissing=$('rain').checked&&radarStatus==='mangler';
  clone.setAttribute('width',width);clone.setAttribute('height',height);clone.setAttribute('viewBox',bounds.join(' '));
  clone.removeAttribute('id');clone.removeAttribute('class');clone.setAttribute('style','font-family:system-ui,sans-serif');
  const background=el('rect',{x:bounds[0],y:bounds[1],width:bounds[2],height:bounds[3],fill:getComputedStyle(map).backgroundColor});
  clone.insertBefore(background,clone.firstChild);
  for(const img of clone.querySelectorAll('image')) {
   const href=img.getAttribute('href');
   if(!href||img.getAttribute('visibility')==='hidden'){img.remove();continue;}
   img.setAttribute('href',await embedImage(href));
  }
  const description=el('desc',{},clone);
  description.textContent=`Sjælland Rundt 2026 · ${fmt(time)} CEST · Vind: ${windLabels[model]}, ${fmt(Math.floor(time/3600)*3600)} · Radar: DMI dBZ · Tracks: TracTrac · Kyst: ${D.coast_metadata?.source||'Natural Earth'}${$('traffic').checked?' · TSS: OpenSeaMap / OpenStreetMap, '+D.traffic_separation?.metadata.snapshot:''}${$('military').checked?' · Skydeområde: '+D.military_areas?.features[0]?.properties.name:''}`;
  svgURL=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'}));
  const image=new Image();
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Kortbilledet kunne ikke tegnes. Prøv igen.'));image.src=svgURL;});
  const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('Browseren kunne ikke danne PNG-billedet.');
  const stamp=new Date(time*1000+7200000).toISOString().slice(0,19).replace(/[-:]/g,'').replace('T','-');
  download(blob,`sr2026-kort-${stamp}.png`);
  $('captureStatus').textContent=`PNG klar · ${canvas.width} × ${canvas.height} px · kun kortet${radarMissing?' · radar mangler ved dette tidspunkt':''}`;
 } catch(error) {$('captureStatus').textContent=error.message||'Billedet kunne ikke gemmes.';}
 finally {if(svgURL)URL.revokeObjectURL(svgURL);button.disabled=false;}
}
$('capture').onclick=captureMap;
$('note').addEventListener('input',()=>{if(editingNote)renderAnnotations();else if(pendingEventImage||hasPendingEventVideo())updatePresentationControls();});
updateTimeline();showNotes();render();
new ResizeObserver(()=>{if(updateTimeline())render();else{renderCoast();renderWindArrows();renderTraffic();renderMilitary();webglTracks.redraw();resizeSymbols();renderAnnotations();renderMapCredit()}}).observe($('map'));
