let visibleBoatEntries=[],hoveredVisibleBoatId=null,hoveredMapBoatId=null;
const visibleBoatRows=new Map();
const boatListSpeedFormat=new Intl.NumberFormat('da-DK',{minimumFractionDigits:1,maximumFractionDigits:1});
function highlightVisibleBoat(id){
 for(const marker of $('boatMarkers').querySelectorAll('.boat-marker')){
  const active=marker.dataset.boatMarker===id;
  marker.classList.toggle('boat-list-highlighted',active);
  const emphasis=marker.querySelector('.boat-emphasis');
  if(active)emphasis?.setAttribute('transform','scale(1.8)');else emphasis?.removeAttribute('transform');
 }
 for(const [boatId,row] of visibleBoatRows)row.node.classList.toggle('highlighted',boatId===id);
}
function refreshVisibleBoatHighlight(){
 const focused=document.activeElement?.closest('#visibleBoatsList [data-boat-id]')?.dataset.boatId;
 const id=hoveredVisibleBoatId||hoveredMapBoatId||focused;
 highlightVisibleBoat(!$('visibleBoatsPanel').hidden&&!$('visibleBoats').hidden&&visibleBoatEntries.some(entry=>entry.boat.id===id)?id:null);
}
function createVisibleBoatRow(boat){
 const node=document.createElement('li');node.className='visible-boat';node.dataset.boatId=boat.id;node.tabIndex=0;
 node.style.setProperty('--boat-colour',colours[boat.name]);
 const heading=document.createElement('label');heading.className='visible-boat-heading';
 const choice=document.createElement('input');choice.type='checkbox';choice.className='visible-boat-choice';choice.value=boat.name;
 choice.setAttribute('aria-label','Vælg båd: '+boat.name);choice.onchange=()=>setBoatSelected(boat,choice.checked);
 const name=document.createElement('span');name.className='visible-boat-name';
 const speed=document.createElement('span');speed.className='visible-boat-speed';
 const skipper=document.createElement('span');skipper.className='visible-boat-skipper';
 const type=document.createElement('span');type.className='visible-boat-type';
 heading.append(choice,name,speed);node.append(heading,skipper,type);
 node.onpointerenter=()=>{hoveredVisibleBoatId=boat.id;refreshVisibleBoatHighlight();};
 node.onpointerleave=()=>{if(hoveredVisibleBoatId===boat.id)hoveredVisibleBoatId=null;refreshVisibleBoatHighlight();};
 node.addEventListener('focusin',refreshVisibleBoatHighlight);node.addEventListener('focusout',refreshVisibleBoatHighlight);
 return {node,choice,name,speed,skipper,type};
}
function setBoatListText(node,text){if(node.textContent!==text)node.textContent=text;}
function updateVisibleBoats(time=currentTime()){
 const viewport=mapViewport();if(!viewport)return;
 const {rect,matrix}=viewport,layout=trackSpeedLegendLayout();
 $('visibleBoats').style.width=layout.width+'px';
 $('visibleBoats').style.marginLeft=layout.left+'px';
 $('visibleBoats').style.marginTop=layout.top+layout.height+8+'px';
 const availableHeight=Math.max(32,rect.height-layout.top-layout.height-8);
 $('visibleBoats').style.maxHeight=availableHeight+'px';
 $('visibleBoats').style.height=$('visibleBoatsPanel').hidden?'auto':availableHeight+'px';
 const entries=[];
 for(const boat of boats){
  if(!boatIsDisplayed(boat))continue;
  const position=displayBoatPosition(boat,time);
  if(!isBoatSearchActive()){
   if(!position)continue;
   const [x,y]=xy(position.point),point=new DOMPoint(x,y).matrixTransform(matrix);
   if(point.x<rect.left||point.x>rect.right||point.y<rect.top||point.y>rect.bottom)continue;
  }
  const sample=position?trackSpeedSample(boat,position.interpolated?position.replayTime:position.sourceTime):null;
  entries.push({boat,speed:sample?.speed});
 }
 entries.sort((a,b)=>a.boat.name.localeCompare(b.boat.name,'da'));
 visibleBoatEntries=entries;
 const scope=boatSelectionScope();
 for(const [id,action] of [['boatSelectAll','Vælg'],['boatDeselectAll','Fravælg']]){
  $(id).disabled=!scope.length;
  $(id).title=action+(isBoatSearchActive()?' alle søgeresultater':' alle både');
 }
 setBoatListText($('visibleBoatsTitle'),isBoatSearchActive()?'Søgeresultater':'Både i udsnittet');
 setBoatListText($('visibleBoatsCount'),'· '+entries.length);
 $('visibleBoatsEmpty').hidden=!!entries.length;
 setBoatListText($('visibleBoatsEmpty'),isBoatSearchActive()?'Ingen både matcher søgningen.':'Ingen både i udsnittet ved dette tidspunkt.');
 const ids=new Set(entries.map(entry=>entry.boat.id));
 for(const [id,row] of visibleBoatRows)if(!ids.has(id)){row.node.remove();visibleBoatRows.delete(id);}
 if(hoveredVisibleBoatId&&!ids.has(hoveredVisibleBoatId))hoveredVisibleBoatId=null;
 if(hoveredMapBoatId&&!ids.has(hoveredMapBoatId))hoveredMapBoatId=null;
 if(!$('visibleBoatsPanel').hidden){
  let previous=null;
  for(const {boat,speed} of entries){
   let row=visibleBoatRows.get(boat.id);
   if(!row){row=createVisibleBoatRow(boat);visibleBoatRows.set(boat.id,row);}
   row.choice.checked=chosen.has(boat.name);
   setBoatListText(row.name,boat.name);
   setBoatListText(row.speed,Number.isFinite(speed)?boatListSpeedFormat.format(speed)+' kn':'Fart mangler');
   row.speed.title=handicapTracksEnabled?'Registreret SOG ved den viste position på sporet':'Fart over grunden (SOG)';
   setBoatListText(row.skipper,'Skipper: '+(boat.skipper||'Ikke oplyst'));
   setBoatListText(row.type,'Bådtype: '+(boat.boatType||boat.metadata.boatType||'Ikke oplyst'));
   row.name.title=boat.name;row.skipper.title=row.skipper.textContent;row.type.title=row.type.textContent;
   const next=previous?previous.nextElementSibling:$('visibleBoatsList').firstElementChild;
   if(next!==row.node)$('visibleBoatsList').insertBefore(row.node,next);
   previous=row.node;
  }
 }
 refreshVisibleBoatHighlight();
}
function hoverMapBoat(event){
 const id=event.pointerType==='touch'||event.buttons?null:event.target.closest('[data-boat-marker]')?.dataset.boatMarker||null;
 if(id===hoveredMapBoatId)return;
 hoveredMapBoatId=id;refreshVisibleBoatHighlight();
 if(!id||$('visibleBoatsPanel').hidden||$('visibleBoats').hidden)return;
 const row=visibleBoatRows.get(id)?.node;if(!row)return;
 // Scroll only the list, keeping the page, keyboard focus and map scene unchanged.
 const panel=$('visibleBoatsPanel'),bounds=panel.getBoundingClientRect(),item=row.getBoundingClientRect();
 const top=bounds.top+panel.clientTop+$('boatSearch').offsetHeight,bottom=bounds.top+panel.clientTop+panel.clientHeight;
 if(item.top<top)panel.scrollTop+=item.top-top;
 else if(item.bottom>bottom)panel.scrollTop+=item.bottom-bottom;
}
$('map').addEventListener('pointerover',hoverMapBoat);
$('map').addEventListener('pointermove',hoverMapBoat);
$('map').addEventListener('pointerleave',()=>{hoveredMapBoatId=null;refreshVisibleBoatHighlight();});
function setVisibleBoatsExpanded(expanded){
 $('visibleBoatsToggle').setAttribute('aria-expanded',String(expanded));
 $('visibleBoatsPanel').hidden=!expanded;
 if(!expanded){
  $('boatSearchInput').value='';setBoatSearch('');
  hoveredVisibleBoatId=null;hoveredMapBoatId=null;highlightVisibleBoat(null);
  visibleBoatRows.clear();$('visibleBoatsList').replaceChildren();
 }
 updateVisibleBoats();
}
function setBoatSearch(value){
 const query=value.trim().toLocaleLowerCase('da');
 $('boatSearchClear').hidden=!query;
 if(query===boatSearchQuery)return;
 boatSearchQuery=query;
 $('visibleBoatsPanel').scrollTop=0;
 updateTimeline({preserveTime:true});requestRender();
}
$('boatSearchInput').oninput=event=>setBoatSearch(event.target.value);
$('boatSelectAll').onclick=()=>setAllBoatsSelected(true);
$('boatDeselectAll').onclick=()=>setAllBoatsSelected(false);
$('boatSearchClear').onclick=()=>{$('boatSearchInput').value='';setBoatSearch('');$('boatSearchInput').focus();};
$('visibleBoatsToggle').onclick=()=>setVisibleBoatsExpanded($('visibleBoatsPanel').hidden);
document.addEventListener('keydown',event=>{
 if(!event.target.closest('#visibleBoats'))return;
 if(event.key==='Escape'&&!$('visibleBoatsPanel').hidden){
  if(isBoatSearchActive()){event.preventDefault();event.stopImmediatePropagation();$('boatSearchClear').click();return;}
  event.preventDefault();event.stopImmediatePropagation();setVisibleBoatsExpanded(false);$('visibleBoatsToggle').focus();return;
 }
 if(event.target===$('boatSearchInput')){
  event.stopPropagation();
  if(event.key==='Enter'&&!event.isComposing){
   event.preventDefault();
   if(!event.repeat){
    updateVisibleBoats();
    const listed=visibleBoatEntries.map(entry=>entry.boat);
    if(listed.length)changeBoatSelection(()=>{
     for(const boat of listed)chosen.has(boat.name)?chosen.delete(boat.name):chosen.add(boat.name);
    });
   }
  }
  return;
 }
 if((event.key===' '||event.key==='Enter')&&event.target.matches('.visible-boat')){
  event.preventDefault();event.stopImmediatePropagation();event.target.querySelector('input').click();return;
 }
 if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 event.stopImmediatePropagation();
 if(event.target===$('visibleBoatsToggle'))return;
 const rows=[...$('visibleBoatsList').children],index=rows.indexOf(event.target.closest('.visible-boat'));
 let next=index;
 if(event.key==='ArrowDown')next=Math.min(rows.length-1,index+1);
 if(event.key==='ArrowUp')next=Math.max(0,index-1);
 if(event.key==='Home')next=0;if(event.key==='End')next=rows.length-1;
 event.preventDefault();rows[next]?.focus();
},true);
