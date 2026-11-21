let notes=[];
function chronologicalNotes(list){
 for(const note of list){eventMeasurement(note);prepareGateTiming(eventGates(note));}
 return [...list].sort((a,b)=>a.time-b.time);
}
{
 const saved=JSON.parse(SRStorage.getItem('sr2026-notes')??'[]');
 if(!Array.isArray(saved)||saved.some(n=>!n||!Number.isFinite(n.time)||typeof n.text!=='string'))throw Error(srText('De gemte noter er ugyldige.'));
 notes=chronologicalNotes(saved);
 if(notes.some((n,i)=>n!==saved[i]))SRStorage.setItem('sr2026-notes',JSON.stringify(notes));
}
let activePresentationNote=null,openedEvent=null,editingNote=null,newEventDraft=null;
let eventEditTarget=null,placingNote=false;
let sceneCameraBaseline=null,sceneCameraEdited=false,followedScene=false;
let sceneUndo=null,sceneFeedback='';
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
 if(eventPlaybackTarget){$('presentationMessage').textContent='';srBind($('nextEvent'),'title',()=>srText('Afspil frem til næste event'));}
 eventPlaybackTarget=null;
 syncPlaybackAvailability();
}
function cancelPlacement(){
 placingNote=false;$('map').classList.remove('placing');$('cancelNote').hidden=true;
 srBind($('placeNote'),'textContent',()=>srText('Placér markør'));
}
function persistNotes(next){
 if(window.SR_READONLY)return false;
 try{SRStorage.setItem('sr2026-notes',JSON.stringify([...next].sort((a,b)=>a.time-b.time)));return true;}
 catch{srBind($('annotationStatus'),'textContent',()=>srText('Browseren kunne ikke gemme eventet i kladden.'));return false;}
}
function eventHasContent(note){return !!(note.text.trim()||note.image||validatedEventVideo(note.video));}
function mayEditEvent(note){return !!note&&!window.SR_READONLY;}
function updateEventContent(target,changes){
 if(!target||!mayEditEvent(target)||(target!==newEventDraft&&!notes.includes(target)))return false;
 const next={...target,...changes};
 if(target!==newEventDraft&&('text' in changes||'image' in changes||'video' in changes)&&!eventHasContent(next)){
  srBind($('annotationStatus'),'textContent',()=>srText('Eventet skal have tekst, et billede eller en video.'));return false;
 }
 if(target!==newEventDraft&&!persistNotes(notes.map(note=>note===target?next:note)))return false;
 Object.assign(target,changes);
 if(target===editingNote)$('annotationStatus').textContent='';
 return true;
}
function sceneSettings() {
 return {wind:windMode!=='off',windMode,rain:rainEnabled,grid:true,
  ...sceneOverlays,boats:[...chosen],boatNames:boats.map(boat=>boat.id),
  mapVersion:1,comparison:{...comparison},referenceBoatId,trackLengthSeconds,handicapTracksEnabled,boatSearchQuery,boatFavouritesOnly,boatCourseFilter,boatClassFilter};
}
function eventSettings(settings={}){
 if(!settings||typeof settings!=='object'||Array.isArray(settings))throw Error(srText('Eventets kortkonfiguration er ugyldig.'));
 if(settings.mapVersion!==undefined&&settings.mapVersion!==1)throw Error(srText('Eventets kortkonfiguration har en ukendt version.'));
 const next={boatCourseFilter:'',boatClassFilter:'',...(settings.mapVersion===1?settings:{wind:false,rain:false,
  traffic:true,military:true,annotationsVisible:true,boats:[],boatNames:boats.map(boat=>boat.id),
  comparison:{enabled:false,basis:'absolute',boatColour:false},referenceBoatId:window.SR_EVENT.defaultReference,
  trackLengthSeconds:7200,handicapTracksEnabled:false,boatSearchQuery:'',boatFavouritesOnly:Array.isArray(settings.boats),...settings,mapVersion:1})};
 const savedWindMode=next.windMode===undefined?(next.wind?'mean':'off'):next.windMode;
 if(!WIND_MODES.includes(savedWindMode)||!validBoatRaceFilters(next.boatCourseFilter,next.boatClassFilter)||!validComparison(next.comparison)||!TRACK_LENGTHS.has(next.trackLengthSeconds)||!boats.some(boat=>boat.id===next.referenceBoatId)
  ||typeof next.handicapTracksEnabled!=='boolean'||typeof next.boatFavouritesOnly!=='boolean'||typeof next.boatSearchQuery!=='string'
  ||!['boats','boatNames'].every(key=>Array.isArray(next[key])&&next[key].every(value=>typeof value==='string'))
  ||!['wind','rain','traffic','military','annotationsVisible'].every(key=>typeof next[key]==='boolean'))throw Error(srText('Eventets kortkonfiguration er ugyldig.'));
 // Keep the legacy boatNames field in documents; names are always shown.
 const enabledWindMode=window.SR_EVENT.features.weather?savedWindMode:'off';
 return {...next,wind:enabledWindMode!=='off',windMode:enabledWindMode,rain:next.rain&&window.SR_EVENT.features.weather,grid:true,
  comparison:eventComparison(next.comparison),handicapTracksEnabled:next.handicapTracksEnabled&&window.SR_EVENT.features.handicap,
  traffic:next.traffic&&window.SR_EVENT.layers.traffic,military:next.military&&window.SR_EVENT.layers.military,boatNames:boats.map(boat=>boat.id)};
}
function applySceneSettings(settings){
 const next=eventSettings(settings);
 applyLayerSettings(next);
 sceneOverlays={traffic:next.traffic,military:next.military,annotationsVisible:next.annotationsVisible};
 chosen.clear();next.boats.forEach(name=>chosen.add(name));
 boatSearchQuery=next.boatSearchQuery;boatFavouritesOnly=next.boatFavouritesOnly;
 boatCourseFilter=next.boatCourseFilter;boatClassFilter=next.boatClassFilter;
 $('boatSearchInput').value=boatSearchQuery;$('boatFavouritesOnly').setAttribute('aria-pressed',String(boatFavouritesOnly));
 comparison={...next.comparison};trackLengthSeconds=next.trackLengthSeconds;handicapTracksEnabled=next.handicapTracksEnabled;
 if(referenceBoatId!==next.referenceBoatId){
  referenceBoatId=next.referenceBoatId;comparisonRevision++;webglTracks.prepareComparison();
 }
 syncComparisonRoute();
 clearTrackHover();syncBoatChoices();syncHandicapTracks();syncNavigationControls();renderTrackSpeedLegend();
}
function changeEventConfiguration(change){
 const result=change();
 updateEventSceneControls();
 return result;
}
const EVENT_LAYER_KEYS=['windMode','rain'];
function applyLayerSettings(settings){
 setWindMode(settings.windMode);setRainEnabled(settings.rain);
}
function currentMapEvent(){
 const time=currentTime();
 return notes.includes(activePresentationNote)&&activePresentationNote.time===time?activePresentationNote:notes.find(note=>note.time===time)||null;
}
function changeBoatSelection(change){
 stopPlayback();change();prepareSelectedTracks();syncBoatChoices();updateTimeline();
 updateEventSceneControls();requestRender();
}
function eventToolsVisible(){return !$('eventPanel').hidden&&!document.body.classList.contains('event-panel-collapsed');}
function syncEventEditor(){
 const candidate=newEventDraft||eventEditTarget;
 const target=eventToolsVisible()&&!interval&&mayEditEvent(candidate)?candidate:null;
 if(target===editingNote)return;
 endEventTool();editingNote=target;
 $('eventOptions').open=false;
 $('annotationStatus').textContent='';
 if(target){
  $('noteTime').min=eventTimeInputValue(D.start);
  $('noteTime').max=eventTimeInputValue(VIEWER_DATA_END);
  $('noteTime').value=eventTimeInputValue(target.time);
  $('noteVideo').value=validatedEventVideo(target.video)?.url||'';
  $('noteVideo').setCustomValidity('');$('noteVideo').removeAttribute('aria-invalid');
  $('noteVideoStatus').textContent='';
 }
 updateVideoEditor();updateDrawingControls();
}
function endEventTool(){
 cancelPlacement();setDrawingTool('pan');$('drawingTools').hidden=true;
 $('startDrawing').setAttribute('aria-expanded','false');
}
function closeEventEditor(){
 eventEditTarget=null;
 $('eventScene').open=false;
 $('presentationOptions').open=false;
 syncEventEditor();
}
function leaveOpenedEvent(){
 closeEventEditor();
 if(openedEvent){openedEvent=null;sceneUndo=null;sceneFeedback='';}
}
function finishEventEditing(){
 if(!finishInlineTextEditing())return false;
 if(newEventDraft){
  if((eventHasContent(newEventDraft)||eventImageUploads.has(newEventDraft))&&!confirm(srText('Forlad det nye event uden at oprette det?')))return false;
  newEventDraft=null;syncEventEditor();
 }
 return true;
}
function noteNavigationAllowed(){return finishEventEditing();}
function openPresentationNote(note){
 if(!note||!finishEventEditing())return;
 setEventPanelExpanded(true);restoreNote(note);
}
function refreshEditedEvent(){
 refreshPresentationEvents();updateTimeline();requestRender();
}
function eventTimeFromField(){
 const input=$('noteTime'),time=parseEventTimeInput(input.value);
 if(!input.validity.valid||time===null||time<D.start||time>VIEWER_DATA_END){
  srBind($('annotationStatus'),'textContent',()=>srText('Vælg et gyldigt tidspunkt inden for sejladsens tidsrum.'));return null;
 }
 return time;
}
$('noteTime').onchange=()=>{
 const target=editingNote;if(!target)return;
 const time=eventTimeFromField();
 if(time===null){$('noteTime').value=eventTimeInputValue(target.time);return;}
 if(Math.floor(target.time)===time)return;
 if(!updateEventContent(target,{time,utc:new Date(time*1000).toISOString()})){
  $('noteTime').value=eventTimeInputValue(target.time);return;
 }
 if(target!==newEventDraft){notes.sort((a,b)=>a.time-b.time);selectedTime=time;}
 refreshEditedEvent();
};
$('newEvent').onclick=()=>{
 if(!finishEventEditing())return;
 const existing=currentMapEvent();
 if(mayEditEvent(existing)){
  stopPlayback();hideMapEventImage();hideEventVideo();
  leaveOpenedEvent();activePresentationNote=openedEvent=eventEditTarget=existing;
  updatePresentationControls();beginInlineTextEditing();
  return;
 }
 const time=currentTime();
 if(time<D.start||time>VIEWER_DATA_END){
  srBind($('annotationStatus'),'textContent',()=>srText('Vælg et tidspunkt inden for sejladsens tidsrum.'));return;
 }
 stopPlayback();followedBoatId=null;hideMapEventImage();
 newEventDraft={time,utc:new Date(time*1000).toISOString(),text:'',...captureScene()};
 if(eventSetSource.startsWith('private:'))Object.assign(newEventDraft,{private:true,privateId:crypto.randomUUID()});
 updatePresentationControls();beginInlineTextEditing();
};
$('cancelNewEvent').onclick=()=>{
 finishInlineTextEditing(true);newEventDraft=null;syncEventEditor();renderAnnotations();
};
$('save').onclick=()=>{
 const target=newEventDraft;
 if(!target||!finishInlineTextEditing())return;
 if(eventImageUploads.has(target)){srBind($('annotationStatus'),'textContent',()=>srText('Vent, mens billedet klargøres.'));return;}
 if(!validateEventVideoInput())return;
 const time=eventTimeFromField();if(time===null)return;
 if(time!==Math.floor(target.time)){target.time=time;target.utc=new Date(time*1000).toISOString();}
 if(!eventHasContent(target)){
  srBind($('annotationStatus'),'textContent',()=>srText('Skriv en tekst, eller tilføj et billede eller en video.'));return;
 }
 const next=chronologicalNotes([...notes,target]);
 if(!persistNotes(next))return;
 notes=next;newEventDraft=null;restoreNote(target);refreshEditedEvent();
};
$('finishEventEdit').onclick=()=>{
 if(!finishInlineTextEditing())return;
 closeEventEditor();updatePresentationControls();
 $('newEvent').focus();
};
$('deleteNote').onclick=()=>{
 const target=editingNote;
 if(!target||target===newEventDraft||!finishInlineTextEditing())return;
 const question=eventSetSource.startsWith('public:')?
  'Slet eventet fra kladden? Ved udgivelse fjernes det fra det offentlige sæt. Tidligere kopier kan stadig findes.':
  'Slet dette event fra kladden?';
 if(!confirm(srText(question)))return;
 const index=notes.indexOf(target),next=notes.filter(note=>note!==target);
 if(!persistNotes(next))return;
 notes=next;leaveOpenedEvent();activePresentationNote=null;
 const replacement=notes[Math.min(index,notes.length-1)];
 if(replacement)restoreNote(replacement);else {hideMapEventImage();resetMapMeasurement();}
 refreshEditedEvent();
 srBind($('annotationStatus'),'textContent',()=>srText('Eventet er slettet fra kladden.'));
 (replacement?$('presentationEventSelect'):$('newEvent')).focus();
};
$('placeNote').onclick=()=>{
 if(!editingNote||!finishInlineTextEditing())return;
 stopPlayback();endEventTool();if(navigationMode)cancelMapLine();hideMapEventImage();followedBoatId=null;
 placingNote=true;$('map').classList.add('placing');$('cancelNote').hidden=false;
 srBind($('placeNote'),'textContent',()=>srText('Klik på kortet …'));
};
$('cancelNote').onclick=cancelPlacement;
$('removeNotePoint').onclick=()=>{
 if(updateEventContent(editingNote,{point:undefined,lon:undefined,lat:undefined}))renderAnnotations();
};
function placeAnnotation(e){
 const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(mapViewport().inverse),point=[p.x,p.y];
 if(updateEventContent(editingNote,{point,lon:9.5+p.x*4.5/1000,lat:57-p.y*3/1180})){
  cancelPlacement();renderAnnotations();
 }
}
function captureScene(){
 const settings=sceneSettings();
 if(settings.boatSearchQuery){
  const displayed=boats.filter(boatIsDisplayed).map(boat=>boat.name);
  settings.boats=[...new Set(displayed)];settings.boatFavouritesOnly=true;settings.boatSearchQuery='';
 }
 return {view:[...view],settings,measurement:currentMeasurement().map(point=>[...point]),gates:currentGateMeasurement().map(point=>[...point])};
}
const SCENE_BOAT_KEYS=['boats','boatSearchQuery','boatFavouritesOnly','boatCourseFilter','boatClassFilter'];
const SCENE_TRACK_KEYS=['comparison','referenceBoatId','trackLengthSeconds','handicapTracksEnabled'];
const sceneValue=value=>JSON.stringify(value);
function sameCamera(a,b){
 return a&&b&&a.every((value,index)=>Math.abs(value-b[index])<1e-7);
}
function markEventCameraChange(){
 if(!openedEvent)return;
 sceneCameraEdited=!sameCamera(view,sceneCameraBaseline);sceneFeedback='';
 updateEventSceneControls();
}
function resizedSceneCamera(viewBox,oldRect,newRect){
 const [x,y,width,height]=viewBox;
 const unitsPerPixel=Math.max(width/oldRect.width,height/oldRect.height);
 const nextWidth=newRect.width*unitsPerPixel,nextHeight=newRect.height*unitsPerPixel;
 return [x+(width-nextWidth)/2,y+(height-nextHeight)/2,nextWidth,nextHeight];
}
function resizeEventSceneBaseline(oldRect,newRect){
 if(sceneCameraBaseline)sceneCameraBaseline=resizedSceneCamera(sceneCameraBaseline,oldRect,newRect);
}
function sceneDifferences(target){
 const settings=sceneSettings(),saved=eventSettings(target.settings);
 const normalized=(value,key)=>{
  if(key==='boats')return [...new Set(value)].sort();
  if(key==='comparison'&&value)return [value.enabled,value.basis,!!value.boatColour];
  return value;
 };
 const differs=keys=>keys.some(key=>sceneValue(normalized(settings[key],key))!==sceneValue(normalized(saved[key],key)));
 const changes=[];
 if(sceneCameraEdited)changes.push(srText('Udsnit'));
 if(differs(SCENE_BOAT_KEYS))changes.push(srText('Både'));
 if(differs(SCENE_TRACK_KEYS))changes.push(srText('Spor'));
 if(differs(EVENT_LAYER_KEYS))changes.push(srText('Lag'));
 if(sceneValue(currentGateMeasurement())!==sceneValue(eventGates(target)))changes.push(srText('Gates'));
 if(sceneValue(currentMeasurement())!==sceneValue(eventMeasurement(target)))changes.push(srText('Lineal'));
 return changes;
}
function updateEventSceneControls(){
 const target=editingNote===openedEvent?editingNote:null;
 $('eventScene').hidden=!target;
 if(!target)return;
 const changes=sceneDifferences(target),count=boatSearchQuery?boats.filter(boatIsDisplayed).length:null;
 const following=followedScene||!!followedBoatId;
 const base=changes.length?srText('Ændret ')+changes.join(' · ')
  :sceneFeedback?srText(sceneFeedback):(following?srText('Fulgt udsnit'):srText('Eventets gemte visning'));
 const status=base+(count===null?'':srText(" · {0} {1} i eventet",count,count===1?srText('båd'):srText('både')));
 setBoatListText($('eventSceneStatus'),status);
 $('captureEventScene').disabled=!changes.length;
 $('restoreEventScene').disabled=!changes.length&&!following;
 $('undoEventScene').hidden=sceneUndo?.target!==target;
}
$('captureEventScene').onclick=()=>{
 const target=openedEvent;
 if(!target||target!==editingNote||!finishInlineTextEditing()||!sceneDifferences(target).length)return;
 const previous={view:target.view,settings:target.settings,gates:target.gates,measurement:target.measurement},scene=captureScene();
 if(!sceneCameraEdited)scene.view=target.view;
 const capturedCamera=sceneCameraEdited;
 if(!updateEventContent(target,scene))return;
 if(capturedCamera){followedBoatId=null;followedScene=false;}
 applySceneSettings(scene.settings);
 sceneCameraBaseline=[...view];sceneCameraEdited=false;
 sceneUndo={target,previous};
 sceneFeedback='✓ Kortvisning gemt i kladden';
 updateTimeline();updateEventSceneControls();requestRender();
};
$('restoreEventScene').onclick=()=>{
 if(editingNote===openedEvent&&openedEvent&&finishInlineTextEditing())restoreNote(openedEvent,{keepEditing:true});
};
$('undoEventScene').onclick=()=>{
 const undo=sceneUndo;
 if(!undo||undo.target!==editingNote||!finishInlineTextEditing())return;
 if(updateEventContent(undo.target,undo.previous)){
  sceneUndo=null;restoreNote(undo.target,{keepEditing:true});sceneFeedback='Forrige kortvisning gendannet i kladden';updateEventSceneControls();
 }
};
function restoreNote(note,{showImage=false,restoreView=true,keepEditing=false}={}){
 if(!noteNavigationAllowed()||!notes.includes(note))return;
 prepareGateTiming(eventGates(note));
 hideMapEventImage();hideEventVideo();
 if(keepEditing)endEventTool();else closeEventEditor();
 if(openedEvent!==note)sceneUndo=null;
 followedBoatId=null;
 activePresentationNote=openedEvent=note;
 stopPlayback();selectedTime=note.time;resetMapMeasurement();
 applySceneSettings(note.settings);prepareSelectedTracks();
 if(restoreView){
  const saved=note.view;
  view=Array.isArray(saved)&&saved.length===4&&saved.every(Number.isFinite)&&saved[2]>0&&saved[3]>0?[...saved]:[...window.SR_EVENT.initialView];
  setview();
 }
 sceneCameraBaseline=[...view];sceneCameraEdited=false;followedScene=!restoreView;sceneFeedback='';
 updateTimeline();render();updatePresentationControls();
 if(showImage&&note.image)showMapEventImage(note.image,note);
}
function refreshPresentationEvents(){
 const select=$('presentationEventSelect');
 select.replaceChildren(...notes.map((note,index)=>new Option(`${index+1} · ${fmt(note.time)} · ${note.private?srText('Privat')+' · ':''}${eventNoteLabel(note).replace(/\s+/g,' ')}`,String(index))));
 if(!notes.length)select.append(new Option(srText('Ingen events endnu'),''));
 presentationControlsKey=null;updatePresentationControls();
}
let presentationControlsKey=null,presentationControlsNote=null;
function updatePresentationControls(){
 syncEventEditor();updateEventSceneControls();
 const index=notes.indexOf(activePresentationNote),note=notes[index],preview=newEventDraft||note;
 const editable=!!editingNote;
 const key=JSON.stringify([index,notes.length,preview?.time,preview?.text,preview?.image,preview?.video,preview?.point,preview?.private,editable,!!newEventDraft,notes.indexOf(nextPresentationNote()),!!eventPlaybackTarget]);
 if(key===presentationControlsKey&&preview===presentationControlsNote)return;
 presentationControlsKey=key;presentationControlsNote=preview;
 $('previousEvent').disabled=!notes.length||index===0;
 $('nextEvent').disabled=!nextPresentationNote();
 srBind($('nextEvent'),'title',()=>eventPlaybackTarget?srText('Spring direkte til næste event'):srText('Afspil frem til næste event'));
 $('presentationEventSelect').disabled=!notes.length;
 $('presentationEventSelect').selectedIndex=notes.length?index:0;
 srBind($('eventCounter'),'textContent',()=>newEventDraft?srText('Nyt event'):note?srText("Event {0} af {1}",index+1,notes.length):'');
 $('eventTime').textContent=preview?fmt(preview.time):'';
 $('privateEventBadge').hidden=preview?.private!==true;
 if(preview)$('eventTime').dateTime=new Date(preview.time*1000).toISOString();else $('eventTime').removeAttribute('datetime');
 if(!inlineTextSession)$('eventText').textContent=preview?.text??(notes.length?srText('Vælg et event.'):srText('Ingen events endnu.'));
 renderEventImage(preview?.image,preview);renderEventVideo(preview?.video,preview);
 $('eventText').classList.toggle('inline-editable',editable);
 if(editable){
  $('eventText').tabIndex=0;$('eventText').setAttribute('role','button');srBind($('eventText'),'title',()=>srText('Klik for at redigere teksten'));
 }else{
  $('eventText').removeAttribute('tabindex');$('eventText').removeAttribute('role');$('eventText').removeAttribute('title');
 }
 $('eventEditor').hidden=window.SR_READONLY;
 $('eventContentTools').hidden=!editable;
 $('newEvent').hidden=editable;
 $('finishEventEdit').hidden=!editable||!!newEventDraft;
 $('newEventActions').hidden=!newEventDraft;
 $('deleteNote').hidden=!editable||!!newEventDraft;
 $('removeNotePoint').hidden=!editingNote?.point;
 updateImageEditor();
}
function showPresentationEvent(index,{expandPanel=true}={}){
 if(!notes.length||!noteNavigationAllowed())return;
 const target=notes[Math.max(0,Math.min(notes.length-1,index))];
 if(expandPanel)setEventPanelExpanded(true);
 restoreNote(target,{showImage:true});
}
function movePresentationEvent(delta){
 if(delta===1){playToNextPresentationEvent();return;}
 showPresentationEvent(notes.indexOf(activePresentationNote)+delta);
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
 setEventPanelExpanded(true);
 const onEvent=notes.some(note=>Math.abs(note.time-currentTime())<1e-6);
 if(eventPlaybackTarget||target.time<=currentTime()||(interval&&!onEvent)){
  restoreNote(target,{showImage:true});return;
 }
 stopPlayback();hideMapEventImage();hideEventVideo();cancelPlacement();
 startPlayback({target});
 srBind($('presentationMessage'),'textContent',()=>srText("Afspiller frem til event {0}. Tryk Næste event igen for at springe frem.",notes.indexOf(target)+1));
 updatePresentationControls();
}
function handlePresentationKey(event){
 if(eventVideoView)return;
 if(window.SR_RHUMBLINE_SETUP||event.altKey||event.ctrlKey||event.metaKey)return;
 if(event.target.closest('[data-gate-results-scroll]'))return;
 if(event.key==='Escape'){
  if(!event.target.closest('input,textarea,select,dialog')&&(placingNote||drawingTool!=='pan')){event.preventDefault();event.stopImmediatePropagation();endEventTool();requestRender();return;}
  if(navigationMode||event.target.closest('input,textarea,select,dialog,[contenteditable="true"]'))return;
  if(followedBoatId||pickedTrackSpeed||windSelection){
   event.preventDefault();event.stopImmediatePropagation();
   if(followedBoatId){followedBoatId=null;updateEventSceneControls();}
   if(pickedTrackSpeed)closeTrackSpeedSelection();
   closeWindSelection();
  }
  return;
 }
 if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 if(event.target.closest('[data-boat-marker],[data-speed-key]')&&['Enter',' '].includes(event.key))return;
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
 const label=active?srText('Forlad fuld skærm'):srText('Fuld skærm');
 $('presentationFullscreen').hidden=!document.fullscreenEnabled;
 $('presentationFullscreen').setAttribute('aria-label',label);$('presentationFullscreen').title=label;
 $('presentationFullscreen').setAttribute('aria-pressed',String(active));
 $('fullscreenEnterIcon').toggleAttribute('hidden',active);$('fullscreenExitIcon').toggleAttribute('hidden',!active);
}
updateFullscreenButton();
$('previousEvent').onclick=()=>movePresentationEvent(-1);
$('nextEvent').onclick=()=>movePresentationEvent(1);
$('presentationEventSelect').onchange=()=>{
 showPresentationEvent(Number($('presentationEventSelect').value));
 $('presentationEventSelect').selectedIndex=notes.length?notes.indexOf(activePresentationNote):0;
};
document.addEventListener('keydown',handlePresentationKey,true);
document.addEventListener('fullscreenchange',()=>{
 updateFullscreenButton();requestRender({viewportOnly:true});
});
$('presentationFullscreen').onclick=async()=>{
 $('presentationMessage').textContent='';
 try{
  if(document.fullscreenElement){await document.exitFullscreen();}
  else{await document.documentElement.requestFullscreen();}
 }catch{setEventPanelExpanded(true);srBind($('presentationMessage'),'textContent',()=>srText('Browseren kunne ikke åbne fuld skærm. Du kan fortsætte præsentationen her.'));}
 updateFullscreenButton();
};
function renderAnnotations() {
 syncEventEditor();
 $('annotations').replaceChildren();
 renderSpeedPins();
 renderNoteDrawings();
 updatePresentationControls();
 if(!sceneOverlays.annotationsVisible&&!placingNote) return;
 const matrix=mapViewport()?.matrix;if(!matrix)return;
 const scale=Math.hypot(matrix.a,matrix.b);
 const n=newEventDraft||activePresentationNote,i=notes.indexOf(n);
 if(n&&(n===newEventDraft||noteIsVisible(n))&&Array.isArray(n.point)&&n.point.every(Number.isFinite)){
  const [x,y]=n.point;
  const group=screenGroup(x,y,$('annotations'));group.dataset.noteIndex=i;
  group.setAttribute('transform',`translate(${x} ${y}) scale(${1/scale})`);
  el('title',{},group).textContent=eventNoteLabel(n);
  el('circle',{r:10,fill:'#fff',stroke:'#34404b','stroke-width':2},group);
  const number=el('text',{'text-anchor':'middle',y:4,fill:'#132d3d','font-size':11,'font-weight':800},group);number.textContent=i+1;
 }
}
function download(blob,filename) {
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('export').onclick=()=>{if(finishEventEditing())exportEventNotes();};
window.addEventListener('beforeunload',event=>{
 if((inlineTextSession&&$('eventTextEditor').value.trim()!==inlineTextSession.text)||newEventDraft&&eventHasContent(newEventDraft)||[...eventImageUploads.keys()].some(note=>notes.includes(note)||note===newEventDraft)){
  event.preventDefault();event.returnValue=true;
 }
});

updateTimeline();refreshPresentationEvents();render();
new ResizeObserver(()=>resizeMapViewport()).observe($('map'));
