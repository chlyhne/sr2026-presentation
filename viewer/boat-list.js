let visibleBoatEntries=[],hoveredVisibleBoatId=null,hoveredMapBoatId=null;
const visibleBoatRows=new Map();
// Measure fixed text once. Layout and animation never run on playback ticks.
const boatDetailMeasure=document.createElement('canvas').getContext('2d');
if(!boatDetailMeasure)throw Error('Bådlistens tekstbredder kunne ikke måles.');
boatDetailMeasure.font='11px system-ui';
const boatDetailSegments=new Intl.Segmenter('da',{granularity:'grapheme'}),boatDetailMetrics=new Map(),boatDetailLayouts=new Map();
function boatDetailWidths(text){
 if(!boatDetailMetrics.has(text)){
  let prefix='';const widths=[0];
  for(const {segment} of boatDetailSegments.segment(text)){prefix+=segment;widths.push(Math.ceil(boatDetailMeasure.measureText(prefix).width));}
  boatDetailMetrics.set(text,widths);
 }
 return boatDetailMetrics.get(text);
}
for(const boat of boats){boatDetailWidths(boat.skipper||'Ikke oplyst');boatDetailWidths(boat.boatType||boat.metadata.boatType||'Ikke oplyst');}
function allocateBoatDetailWidths(left,right,width){
 const a=left.at(-1),b=right.at(-1);
 if(a+b<=width)return [a,width-a];
 // Keep at least a short fragment of each field, then maximise visible letters.
 const minLeft=Math.min(left[Math.min(3,left.length-1)],width/2),minRight=Math.min(right[Math.min(3,right.length-1)],width/2);
 let best=[minLeft,width-minLeft],most=-1,balance=Infinity;
 for(let i=0;i<left.length;i++){
  const first=Math.max(minLeft,left[i]);if(first>width-minRight)break;
  let j=0;while(j+1<right.length&&right[j+1]<=width-first)j++;
  const visible=i+j,difference=Math.abs(i/(left.length-1||1)-j/(right.length-1||1));
  if(visible>most||(visible===most&&difference<balance)){best=[first,width-first];most=visible;balance=difference;}
 }
 return best;
}
let boatDetailAvailableWidth=0;
function layoutBoatDetails(row){
 if(boatDetailAvailableWidth<=0)return;
 const texts=[row.skipper.textContent,row.type.textContent],key=JSON.stringify([boatDetailAvailableWidth,...texts]);
 if(row.detailLayoutKey===key)return;row.detailLayoutKey=key;
 const metrics=texts.map(boatDetailWidths);
 if(!boatDetailLayouts.has(key))boatDetailLayouts.set(key,allocateBoatDetailWidths(...metrics,boatDetailAvailableWidth));
 const widths=boatDetailLayouts.get(key);
 row.details.style.gridTemplateColumns=`${widths[0]}px 12px ${widths[1]}px`;
 for(const [i,text] of [row.skipper,row.type].entries()){
  const travel=Math.max(0,metrics[i].at(-1)-widths[i]);
  text.classList.toggle('streaming',travel>0);
  text.style.setProperty('--detail-travel',-travel+'px');
  text.style.setProperty('--detail-duration',Math.max(5,travel/18+3)+'s');
 }
}
new ResizeObserver(entries=>{
 boatDetailAvailableWidth=Math.max(0,entries[0].contentRect.width-24-12);
 for(const row of visibleBoatRows.values())layoutBoatDetails(row);
}).observe($('visibleBoatsList'));
let boatListSource=[],boatListOrder=[];
let boatRaceControlsKey=null;
function syncBoatRaceControls(){
 const key=boatCourseFilter+':'+boatClassFilter;
 if(key===boatRaceControlsKey)return;boatRaceControlsKey=key;
 $('boatCourseSelect').value=boatCourseFilter;
 const classes=boatCourseFilter?boatRaceClasses.get(boatCourseFilter):new Map([...boatRaceClasses.values()].flatMap(classes=>[...classes]));
 $('boatClassSelect').replaceChildren(new Option('Alle løb',''),...[...classes].sort((a,b)=>a[1].localeCompare(b[1],'da',{numeric:true})).map(([id,name])=>new Option(name,id)));
 $('boatClassSelect').value=boatClassFilter;
 $('boatCourseSelect').title='Bane: '+$('boatCourseSelect').selectedOptions[0].textContent;
 $('boatClassSelect').title='Løb: '+$('boatClassSelect').selectedOptions[0].textContent;
}
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
 const details=document.createElement('div');details.className='visible-boat-details';
 const skipperField=document.createElement('span');skipperField.className='visible-boat-skipper';
 const typeField=document.createElement('span');typeField.className='visible-boat-type';
 const skipper=document.createElement('span'),type=document.createElement('span');skipper.className=type.className='boat-detail-text';
 const separator=document.createElement('span');separator.className='boat-detail-separator';separator.textContent='·';separator.setAttribute('aria-hidden','true');
 skipperField.append(skipper);typeField.append(type);details.append(skipperField,separator,typeField);
 heading.append(choice,heart,name,speed);node.append(heading,details);
 node.onclick=event=>{
  // The heading label already activates its checkbox, including keyboard clicks.
  if(event.target.closest('label,input'))return;
  choice.click();
 };
 node.onpointerenter=()=>{hoveredVisibleBoatId=boat.id;refreshVisibleBoatHighlight();};
 node.onpointerleave=()=>{if(hoveredVisibleBoatId===boat.id)hoveredVisibleBoatId=null;refreshVisibleBoatHighlight();};
 node.addEventListener('focusin',refreshVisibleBoatHighlight);node.addEventListener('focusout',refreshVisibleBoatHighlight);
 return {node,choice,name,speed,skipper,type,details};
}
function setBoatListText(node,text){if(node.textContent!==text)node.textContent=text;}
let visibleBoatLayoutKey=null;
function updateBoatOverlayBounds(){
 const bounds=$('visibleBoats').getBoundingClientRect(),previous=visibleBoatOverlayBounds;
 if(previous&&['left','top','right','bottom'].every(key=>previous[key]===bounds[key]))return;
 visibleBoatOverlayBounds=bounds;mapCreditKey=null;requestRender({viewportOnly:true});
}
// Filtering changes the panel's natural height without changing the viewport.
new ResizeObserver(updateBoatOverlayBounds).observe($('visibleBoats'));
function layoutVisibleBoats(){
 const viewport=mapViewport();if(!viewport)return;
 const {rect}=viewport,layout=trackSpeedLegendLayout();
 const top=trackUsesBoatColour()?50:layout.top+layout.height+8;
 const key=[rect.width,rect.height,layout.width,top,$('visibleBoatsPanel').hidden].join(':');
 if(key===visibleBoatLayoutKey)return;visibleBoatLayoutKey=key;
 $('mapHeading').style.width=layout.width+'px';
 $('visibleBoats').style.width=layout.width+'px';
 $('visibleBoats').style.marginLeft=layout.left+'px';
 $('visibleBoats').style.marginTop=top+'px';
 const availableHeight=Math.max(32,rect.height-top);
 $('visibleBoats').style.maxHeight=availableHeight+'px';
 $('visibleBoats').style.height='auto';
 updateBoatOverlayBounds();
}
function updateVisibleBoats(time=currentTime()){
 syncBoatRaceControls();
 layoutVisibleBoats();
 const entries=[];
 for(const boat of orderedListBoats()){
  if(!boatIsDisplayed(boat))continue;
  const position=$('visibleBoatsPanel').hidden?null:displayBoatPosition(boat,time);
  const sample=position?trackSpeedSample(boat,position.interpolated?position.replayTime:position.sourceTime):null;
  const display=sample?trackPinValue(boat,sample,{includeReference:true}):{label:trackUsesComparison()?'Sammenligning mangler':'Fart mangler',description:''};
  entries.push({boat,display});
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
  for(const {boat,display} of entries){
   let row=visibleBoatRows.get(boat.id);
   if(!row){row=createVisibleBoatRow(boat);visibleBoatRows.set(boat.id,row);}
   row.choice.checked=chosen.has(boat.name);
   setBoatListText(row.name,boat.name);
   setBoatListText(row.speed,display.label);
   row.speed.title=display.description;
   setBoatListText(row.skipper,boat.skipper||'Ikke oplyst');
   setBoatListText(row.type,boat.boatType||boat.metadata.boatType||'Ikke oplyst');
   row.name.title=boat.name;row.skipper.title=row.skipper.textContent;row.type.title=row.type.textContent;
   layoutBoatDetails(row);
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
function setBoatRaceFilters(course,raceClass){
 if(!validBoatRaceFilters(course,raceClass))throw Error('Ugyldigt bane- eller løbsvalg.');
 return changeEventConfiguration(()=>{
  boatCourseFilter=course;boatClassFilter=raceClass;$('visibleBoatsPanel').scrollTop=0;
  updateTimeline();requestRender();
 });
}
$('boatCourseSelect').onchange=event=>setBoatRaceFilters(event.target.value,'');
$('boatClassSelect').onchange=event=>setBoatRaceFilters(boatCourseFilter,event.target.value);
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
 if(event.target.matches('select')){event.stopImmediatePropagation();return;}
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
