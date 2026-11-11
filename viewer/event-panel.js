function setEventPanelExpanded(expanded){
 if(expanded===!document.body.classList.contains('event-panel-collapsed'))return;
 if(!expanded&&!finishInlineTextEditing())return;
 const viewport=mapViewport();
 const active=document.activeElement;
 if(!expanded&&(active?.closest('#eventPanel')||active?.closest('#presentationFooter')))
  $('eventPanelToggle').focus({preventScroll:true});
 document.body.classList.toggle('event-panel-collapsed',!expanded);
 const button=$('eventPanelToggle'),label=expanded?'Skjul eventpanel':'Vis eventpanel';
 button.setAttribute('aria-expanded',String(expanded));
 button.setAttribute('aria-label',label);button.title=label;
 const rect=$('map').getBoundingClientRect();
 invalidateMapLayout();
 if(viewport&&(rect.width!==viewport.rect.width||rect.height!==viewport.rect.height)){
  // Keep the actual geographic centre and screen scale, including SVG letterboxing.
  const [x,y,width,height]=viewport.viewBox,unitsPerPixel=1/Math.hypot(viewport.matrix.a,viewport.matrix.b);
  const nextWidth=rect.width*unitsPerPixel,nextHeight=rect.height*unitsPerPixel;
  view=[x+width/2-nextWidth/2,y+height/2-nextHeight/2,nextWidth,nextHeight];
  $('map').setAttribute('viewBox',view.join(' '));
 }
}
$('eventPanelToggle').onclick=()=>setEventPanelExpanded(document.body.classList.contains('event-panel-collapsed'));
function resizeMapViewport(){
 invalidateMapLayout();
 invalidateTimelineViewport();requestRender({viewportOnly:true});
}
