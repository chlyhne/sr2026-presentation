let eventMapRect=null;
function updateEventPanelLabel(){
 const expanded=!document.body.classList.contains('event-panel-collapsed');
 const button=$('eventPanelToggle'),label=srText(expanded?'Skjul eventpanel':'Vis eventpanel');
 button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',label);button.title=label;
}
srOnLanguageChange(updateEventPanelLabel);
function setEventPanelExpanded(expanded){
 if(expanded&&!SIMPLE_IPHONE_TRACKS)closeBoatCompare();
 if(expanded===!document.body.classList.contains('event-panel-collapsed'))return;
 if(!expanded){
  if(!finishEventEditing())return;
  closeEventEditor();
 }
 const viewport=mapViewport();
 const active=document.activeElement;
 if(!expanded&&(active?.closest('#eventPanel')||active?.closest('#presentationFooter')))
  $('eventPanelToggle').focus({preventScroll:true});
 document.body.classList.toggle('event-panel-collapsed',!expanded);
 updateEventPanelLabel();
 resizeMapViewport(viewport?.rect);
 updatePresentationControls();requestRender({viewportOnly:true});
}
$('eventPanelToggle').onclick=()=>setEventPanelExpanded(document.body.classList.contains('event-panel-collapsed'));
function resizeMapViewport(previous=eventMapRect){
 const rect=$('map').getBoundingClientRect();eventMapRect=rect;
 invalidateMapLayout();
 if(previous?.width&&previous.height&&rect.width&&rect.height&&(rect.width!==previous.width||rect.height!==previous.height)){
  view=resizedSceneCamera(view,previous,rect);
  resizeEventSceneBaseline(previous,rect);
  $('map').setAttribute('viewBox',view.join(' '));
 }
 invalidateTimelineViewport();requestRender({viewportOnly:true});
}
