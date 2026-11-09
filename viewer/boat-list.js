// Keep rows alive during playback so scrolling, hover and keyboard focus survive redraws.
let visibleBoatEntries=[],hoveredVisibleBoatId=null;
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
 const id=hoveredVisibleBoatId||focused;
 highlightVisibleBoat(!$('visibleBoatsPanel').hidden&&!$('visibleBoats').hidden&&visibleBoatEntries.some(entry=>entry.boat.id===id)?id:null);
}
function createVisibleBoatRow(boat){
 const node=document.createElement('li');node.className='visible-boat';node.dataset.boatId=boat.id;node.tabIndex=0;
 node.style.setProperty('--boat-colour',colours[boat.name]);
 const heading=document.createElement('div');heading.className='visible-boat-heading';
 const name=document.createElement('span');name.className='visible-boat-name';
 const speed=document.createElement('span');speed.className='visible-boat-speed';
 const skipper=document.createElement('span');skipper.className='visible-boat-skipper';
 const type=document.createElement('span');type.className='visible-boat-type';
 heading.append(name,speed);node.append(heading,skipper,type);
 node.onpointerenter=()=>{hoveredVisibleBoatId=boat.id;refreshVisibleBoatHighlight();};
 node.onpointerleave=()=>{if(hoveredVisibleBoatId===boat.id)hoveredVisibleBoatId=null;refreshVisibleBoatHighlight();};
 node.onfocus=refreshVisibleBoatHighlight;node.onblur=()=>highlightVisibleBoat(hoveredVisibleBoatId);
 return {node,name,speed,skipper,type};
}
function setBoatListText(node,text){if(node.textContent!==text)node.textContent=text;}
function updateVisibleBoats(time=currentTime()){
 const viewport=mapViewport();if(!viewport)return;
 const {rect,matrix}=viewport,layout=trackSpeedLegendLayout();
 $('visibleBoats').style.width=layout.width+'px';
 $('visibleBoats').style.marginLeft=layout.left+'px';
 $('visibleBoats').style.marginTop=layout.top+layout.height+8+'px';
 $('visibleBoats').style.maxHeight=Math.max(32,rect.height-layout.top-layout.height-20)+'px';
 const entries=[];
 for(const boat of boats){
  if(!chosen.has(boat.name))continue;
  const position=trackPosition(boat.points,time);if(!position)continue;
  const [x,y]=xy(position.point),point=new DOMPoint(x,y).matrixTransform(matrix);
  if(point.x<rect.left||point.x>rect.right||point.y<rect.top||point.y>rect.bottom)continue;
  const sample=trackSpeedSample(boat,position.interpolated?time:position.sourceTime);
  entries.push({boat,speed:sample?.speed});
 }
 entries.sort((a,b)=>a.boat.name.localeCompare(b.boat.name,'da'));
 visibleBoatEntries=entries;
 setBoatListText($('visibleBoatsCount'),'· '+entries.length);
 $('visibleBoatsEmpty').hidden=!!entries.length;
 const ids=new Set(entries.map(entry=>entry.boat.id));
 for(const [id,row] of visibleBoatRows)if(!ids.has(id)){row.node.remove();visibleBoatRows.delete(id);}
 if(hoveredVisibleBoatId&&!ids.has(hoveredVisibleBoatId))hoveredVisibleBoatId=null;
 if(!$('visibleBoatsPanel').hidden){
  let previous=null;
  for(const {boat,speed} of entries){
   let row=visibleBoatRows.get(boat.id);
   if(!row){row=createVisibleBoatRow(boat);visibleBoatRows.set(boat.id,row);}
   setBoatListText(row.name,boat.name);
   setBoatListText(row.speed,Number.isFinite(speed)?boatListSpeedFormat.format(speed)+' kn':'Fart mangler');
   row.speed.title='Fart over grunden (SOG)';
   setBoatListText(row.skipper,'Skipper: '+(boat.skipper||'Ikke oplyst'));
   setBoatListText(row.type,'Bådtype: '+(boat.boatType||boat.metadata.boatType||'Ikke oplyst'));
   const next=previous?previous.nextElementSibling:$('visibleBoatsList').firstElementChild;
   if(next!==row.node)$('visibleBoatsList').insertBefore(row.node,next);
   previous=row.node;
  }
 }
 refreshVisibleBoatHighlight();
}
function setVisibleBoatsExpanded(expanded){
 $('visibleBoatsToggle').setAttribute('aria-expanded',String(expanded));
 $('visibleBoatsPanel').hidden=!expanded;
 if(!expanded){hoveredVisibleBoatId=null;highlightVisibleBoat(null);}
 updateVisibleBoats();
}
$('visibleBoatsToggle').onclick=()=>setVisibleBoatsExpanded($('visibleBoatsPanel').hidden);
document.addEventListener('keydown',event=>{
 if(!event.target.closest('#visibleBoats'))return;
 if(event.key==='Escape'&&!$('visibleBoatsPanel').hidden){
  event.preventDefault();event.stopImmediatePropagation();setVisibleBoatsExpanded(false);$('visibleBoatsToggle').focus();return;
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
