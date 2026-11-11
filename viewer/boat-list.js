let visibleBoatEntries=[],hoveredVisibleBoatId=null,hoveredMapBoatId=null;
const visibleBoatRows=new Map();
const boatListSpeedFormat=new Intl.NumberFormat('da-DK',{minimumFractionDigits:1,maximumFractionDigits:1});
let boatListSource=[],boatListOrder=[];
function orderedListBoats(){
 if(boats.length!==boatListSource.length||boats.some((boat,i)=>boat!==boatListSource[i])){
  boatListSource=boats.slice();boatListOrder=boats.slice().sort((a,b)=>a.name.localeCompare(b.name,'da'));
 }
 return boatListOrder;
}
orderedListBoats();
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
 const {choice,heart}=createBoatHeartChoice(boat,'visible-boat-choice');
 const name=document.createElement('span');name.className='visible-boat-name';
 const speed=document.createElement('span');speed.className='visible-boat-speed';
 const skipper=document.createElement('span');skipper.className='visible-boat-skipper';
 const type=document.createElement('span');type.className='visible-boat-type';
 heading.append(choice,heart,name,speed);node.append(heading,skipper,type);
 node.onclick=event=>{
  // The heading label already activates its checkbox, including keyboard clicks.
  if(event.target.closest('label,input'))return;
  choice.click();
 };
 node.onpointerenter=()=>{hoveredVisibleBoatId=boat.id;refreshVisibleBoatHighlight();};
 node.onpointerleave=()=>{if(hoveredVisibleBoatId===boat.id)hoveredVisibleBoatId=null;refreshVisibleBoatHighlight();};
 node.addEventListener('focusin',refreshVisibleBoatHighlight);node.addEventListener('focusout',refreshVisibleBoatHighlight);
 return {node,choice,name,speed,skipper,type};
}
function setBoatListText(node,text){if(node.textContent!==text)node.textContent=text;}
let visibleBoatLayoutKey=null;
function layoutVisibleBoats(){
 const viewport=mapViewport();if(!viewport)return;
 const {rect}=viewport,layout=trackSpeedLegendLayout();
 const key=[rect.width,rect.height,layout.width,layout.height,$('visibleBoatsPanel').hidden].join(':');
 if(key===visibleBoatLayoutKey)return;visibleBoatLayoutKey=key;
 $('mapHeading').style.width=layout.width+'px';
 $('visibleBoats').style.width=layout.width+'px';
 $('visibleBoats').style.marginLeft=layout.left+'px';
 $('visibleBoats').style.marginTop=layout.top+layout.height+8+'px';
 const availableHeight=Math.max(32,rect.height-layout.top-layout.height-8);
 $('visibleBoats').style.maxHeight=availableHeight+'px';
 $('visibleBoats').style.height=$('visibleBoatsPanel').hidden?'auto':availableHeight+'px';
}
function updateVisibleBoats(time=currentTime()){
 layoutVisibleBoats();
 const entries=[];
 for(const boat of orderedListBoats()){
  if(!boatIsDisplayed(boat))continue;
  const position=$('visibleBoatsPanel').hidden?null:displayBoatPosition(boat,time);
  const sample=position?trackSpeedSample(boat,position.interpolated?position.replayTime:position.sourceTime):null;
  entries.push({boat,speed:sample?.speed});
 }
 visibleBoatEntries=entries;
 $('boatFavouritesOnly').setAttribute('aria-pressed',String(boatFavouritesOnly));
 $('boatClearFavourites').disabled=!chosen.size;
 setBoatListText($('visibleBoatsTitle'),boatFavouritesOnly?'Favoritter':'Både');
 setBoatListText($('visibleBoatsCount'),'· '+entries.length);
 $('visibleBoatsEmpty').hidden=!!entries.length;
 setBoatListText($('visibleBoatsEmpty'),isBoatSearchActive()?'Ingen både matcher filteret.':boatFavouritesOnly?'Ingen favoritter.':'Ingen både.');
 const ids=new Set(entries.map(entry=>entry.boat.id));
 for(const [id,row] of visibleBoatRows)if(!ids.has(id)){if(row.node.contains(document.activeElement))$('boatSearchInput').focus({preventScroll:true});row.node.remove();visibleBoatRows.delete(id);}
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
  hoveredVisibleBoatId=null;hoveredMapBoatId=null;highlightVisibleBoat(null);
  visibleBoatRows.clear();$('visibleBoatsList').replaceChildren();
 }
 updateVisibleBoats();
}
function setBoatSearch(value){
 return changeEventConfiguration(()=>{
  const query=value.trim().toLocaleLowerCase('da');
  if(query===boatSearchQuery)return;
  boatSearchQuery=query;
  $('visibleBoatsPanel').scrollTop=0;
  updateTimeline();requestRender();
 });
}
$('boatSearchInput').oninput=event=>setBoatSearch(event.target.value);
function setBoatFavouritesOnly(enabled){
 return changeEventConfiguration(()=>{
  boatFavouritesOnly=enabled;$('boatFavouritesOnly').setAttribute('aria-pressed',String(enabled));
  $('visibleBoatsPanel').scrollTop=0;updateTimeline();requestRender();
 });
}
$('boatFavouritesOnly').onclick=()=>setBoatFavouritesOnly(!boatFavouritesOnly);
$('boatClearFavourites').onclick=()=>setAllBoatsSelected(false);
$('visibleBoatsToggle').onclick=()=>setVisibleBoatsExpanded($('visibleBoatsPanel').hidden);
document.addEventListener('keydown',event=>{
 if(!event.target.closest('#visibleBoats'))return;
 if(event.key==='Escape'&&!$('visibleBoatsPanel').hidden){
  if(isBoatSearchActive()){event.preventDefault();event.stopImmediatePropagation();$('boatSearchInput').value='';setBoatSearch('');$('boatSearchInput').focus();return;}
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
