// The slider measures visible seconds, joining disjoint visits to the map.
// Weather keeps its source cadence. Visibility uses the same interpolated curve
// as the boat markers, including crossings with no source point in the viewport.
let selectedTime=D.start,visibleTimeRanges=[],boatTimeRanges=[],timelineLength=0;
const currentTime=()=>selectedTime;
const trackBlockCache=new WeakMap();
const EVENT_SNAP_FRACTION=.01;
function eventSnapWindowSeconds(){
 return Math.max(0,timelineLength-1)*EVENT_SNAP_FRACTION;
}
function timelineNotes(){
 return notes.filter(n=>n.time>=D.start&&n.time<=D.end);
}
function snappableTimelineNotes(){
 return timelineNotes().filter(n=>boatTimeRanges.some(range=>n.time>=range.start&&n.time<=range.end));
}
function renderTimelineEvents(){
 const marks=$('timelineEvents');marks.replaceChildren();
 if(!timelineLength)return;
 const times=new Set(snappableTimelineNotes().map(n=>n.time));
 for(const time of times){
  const ratio=offsetAtTime(time)/Math.max(1,timelineLength-1),mark=document.createElement('span');
  mark.className='timeline-event';mark.dataset.time=time;
  mark.style.left=`calc(${ratio*100}% + ${8-16*ratio}px)`;marks.append(mark);
 }
}
function syncTimelineEvent(){
 const matches=timelineNotes().filter(n=>n.time===selectedTime);
 if(!matches.length)return;
 if(!matches.includes(activePresentationNote))activePresentationNote=matches[0];
 updatePresentationControls();
}
function seekTimeline(offset){
 if(!finishInlineTextEditing()){$('time').value=offsetAtTime(currentTime());return;}
 hideMapEventImage();
 hideEventVideo();
 stopPlayback();
 const snapWindow=eventSnapWindowSeconds(),candidateTime=timeAtOffset(offset);
 let nearest=null,distance=Infinity;
 for(const n of snappableTimelineNotes()){
  const delta=Math.abs(offsetAtTime(n.time)-offset);
  // Joined visits can be adjacent on the slider but hours apart in real time.
  if(delta<=snapWindow&&Math.abs(n.time-candidateTime)<=snapWindow&&(delta<distance||(delta===distance&&n===activePresentationNote))){nearest=n;distance=delta;}
 }
 if(nearest){
  selectedTime=nearest.time;activePresentationNote=nearest;
  $('time').value=offsetAtTime(selectedTime);$('time').setAttribute('aria-valuetext',fmt(selectedTime));
  updatePresentationControls();
 }else setCurrentTime(timeAtOffset(offset));
 render();
}

function trackBlocks(points){
 if(trackBlockCache.has(points))return trackBlockCache.get(points);
 const blocks=[];
 for(let start=0;start<points.length;start+=128){
  const end=Math.min(points.length,start+128);
  let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
  for(let i=start;i<Math.min(points.length,end+1);i++){
   const [lon,lat]=points[i];west=Math.min(west,lon);east=Math.max(east,lon);
   south=Math.min(south,lat);north=Math.max(north,lat);
  }
  blocks.push({start,end,west,east,south,north});
 }
 trackBlockCache.set(points,blocks);return blocks;
}

function visibleBoatRanges(points,bounds){
 const ranges=[];
 for(const block of trackBlocks(points)){
  if(block.east<bounds.west||block.west>bounds.east||block.north<bounds.south||block.south>bounds.north)continue;
  if(points[block.end-1][2]+300<D.start||points[block.start][2]>D.end)continue;
  for(let i=block.start;i<block.end;i++){
   const [lon,lat,time]=points[i],next=points[i+1];
   let from=time,to;
   if(next&&next[2]>time&&next[2]-time<=TRACK_MAX_GAP){
    const interval=trackIntervalInBounds(points,i,bounds);if(!interval)continue;
    from=interval.start;to=interval.end;
   }else{
    if(lon<bounds.west||lon>bounds.east||lat<bounds.south||lat>bounds.north)continue;
    to=Math.min(time+TRACK_MAX_GAP,next?next[2]-1e-6:D.end);
   }
   const start=Math.max(D.start,Math.ceil(from-1e-6));
   const end=Math.min(D.end,Math.floor(to+1e-6));
   if(start>end)continue;
   const previous=ranges.at(-1);
   if(previous&&start<=previous.end+1)previous.end=Math.max(previous.end,end);
   else ranges.push({start,end});
  }
 }
 return ranges;
}

function timeAtOffset(offset){
 if(!timelineLength)return selectedTime;
 offset=Math.max(0,Math.min(timelineLength-1,Math.round(offset)));
 for(const range of visibleTimeRanges){
  const length=range.end-range.start+1;
  if(offset<length)return range.start+offset;
  offset-=length;
 }
 return visibleTimeRanges.at(-1).end;
}

function offsetAtTime(time){
 let offset=0;
 for(const range of visibleTimeRanges){
  if(time<=range.end)return offset+Math.max(0,time-range.start);
  offset+=range.end-range.start+1;
 }
 return Math.max(0,timelineLength-1);
}

function setCurrentTime(time){
 time=Math.max(D.start,Math.min(D.end,Math.round(time)));
 let nearest=time,distance=Infinity;
 for(const range of visibleTimeRanges){
  const candidate=Math.max(range.start,Math.min(range.end,time));
  if(Math.abs(candidate-time)<distance){nearest=candidate;distance=Math.abs(candidate-time);}
 }
 if(selectedTime!==nearest){hideMapEventImage();hideEventVideo();}
 selectedTime=nearest;
 $('time').value=offsetAtTime(selectedTime);
 $('time').setAttribute('aria-valuetext',fmt(selectedTime));
 syncTimelineEvent();
}

function updateTimeline(){
 if(editingNote)return false;
 const presenting=document.body.classList.contains('presenting');
 const bounds=visibleMapBounds();if(!bounds)return false;
 const ranges=[];
 for(const boat of boats)if(chosen.has(boat.name))ranges.push(...visibleBoatRanges(boat.points,bounds));
 ranges.sort((a,b)=>a.start-b.start);
 boatTimeRanges=[];
 for(const range of ranges){
  const previous=boatTimeRanges.at(-1);
  if(previous&&range.start<=previous.end+1)previous.end=Math.max(previous.end,range.end);
  else boatTimeRanges.push({...range});
 }
 // Events in excluded gaps remain available through event navigation only.
 // Keep a manually selected event's exact time without inserting it into the slider.
 visibleTimeRanges=boatTimeRanges.length?boatTimeRanges:presenting?[{start:D.start,end:D.end}]:[];
 timelineLength=visibleTimeRanges.reduce((sum,r)=>sum+r.end-r.start+1,0);
 const slider=$('time');slider.min=0;slider.max=Math.max(0,timelineLength-1);slider.step=1;slider.disabled=timelineLength<2;
 $('back').disabled=$('next').disabled=$('play').disabled=timelineLength<2;
 if(slider.disabled&&interval)stopPlayback();
 const before=selectedTime;
 if(presenting){$('time').value=offsetAtTime(selectedTime);$('time').setAttribute('aria-valuetext',fmt(selectedTime));}
 else setCurrentTime(selectedTime);
 renderTimelineEvents();
 $('timeWindow').textContent=timelineLength
  ? `I udsnittet: ${fmt(visibleTimeRanges[0].start)} – ${fmt(visibleTimeRanges.at(-1).end)} · ${visibleTimeRanges.length} ${visibleTimeRanges.length===1?'periode':'perioder'} · trin: 1 sekund · pauser uden både springes over`
  : chosen.size?'Ingen valgte både passerer dette udsnit. Zoom ud eller flyt kortet.':'Vælg mindst én båd for at bruge tidslinjen.';
 return selectedTime!==before;
}

$('time').oninput=()=>seekTimeline(+$('time').value);
$('time').onkeydown=e=>{
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
  e.preventDefault();e.stopPropagation();stopPlayback();step((['ArrowRight','ArrowUp'].includes(e.key)?1:-1)*(e.shiftKey?60:1));
 }
};
