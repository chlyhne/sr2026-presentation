// The slider measures visible seconds, joining disjoint visits to the map.
// Weather keeps its source cadence. Visibility uses the same interpolated curve
// as the boat markers, including crossings with no source point in the viewport.
let selectedTime=D.start,visibleTimeRanges=[],boatTimeRanges=[],timelineLength=0;
const currentTime=()=>selectedTime;
const timelineTrackCache=new WeakMap(),TIMELINE_LEAF_SIZE=16;
const EVENT_SNAP_FRACTION=.01;
function eventSnapWindowSeconds(){
 return Math.max(0,timelineLength-1)*EVENT_SNAP_FRACTION;
}
function timelineNotes(){
 return notes.filter(n=>n.time>=D.start&&n.time<=VIEWER_DATA_END);
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
function syncTimelineEvent(previousTime=selectedTime,{crossedEvents=false}={}){
 let matches=timelineNotes().filter(n=>n.time===selectedTime);
 if(crossedEvents&&previousTime!==selectedTime){
  const forward=selectedTime>previousTime;
  const crossed=snappableTimelineNotes().filter(n=>forward
   ?n.time>previousTime&&n.time<=selectedTime
   :n.time<previousTime&&n.time>=selectedTime);
  if(crossed.length){
   const time=forward?Math.max(...crossed.map(n=>n.time)):Math.min(...crossed.map(n=>n.time));
   matches=crossed.filter(n=>n.time===time);
  }
 }
 if(!matches.length)return;
 if(!matches.includes(activePresentationNote))activePresentationNote=matches[0];
 updatePresentationControls();
}
function seekTimeline(offset,{snap=true}={}){
 if(!finishInlineTextEditing()){$('time').value=offsetAtTime(currentTime());return;}
 hideMapEventImage();
 hideEventVideo();
 stopPlayback();
 const snapWindow=eventSnapWindowSeconds(),candidateTime=timeAtOffset(offset);
 let nearest=null,distance=Infinity;
 for(const n of snap?snappableTimelineNotes():[]){
  const delta=Math.abs(offsetAtTime(n.time)-offset);
  // Joined visits can be adjacent on the slider but hours apart in real time.
  if(delta<=snapWindow&&Math.abs(n.time-candidateTime)<=snapWindow&&(delta<distance||(delta===distance&&n===activePresentationNote))){nearest=n;distance=delta;}
 }
 if(nearest){
  activePresentationNote=nearest;setCurrentTime(nearest.time);
 }else setCurrentTime(candidateTime,{crossedEvents:true});
 requestRender();
}

function appendTimelineRange(ranges,start,end){
 if(start>end)return;
 const previous=ranges.at(-1);
 // Cached ranges are shared by parents and queries; never mutate them.
 if(previous&&start<=previous.end+1){
  if(end>previous.end)ranges[ranges.length-1]={start:previous.start,end};
 }else ranges.push({start,end});
}
function prepareTimelineTrack(points,clock=null){
 const cached=clock?clock.timelineIndex:timelineTrackCache.get(points);if(cached)return cached;
 const sourceStart=clock?clock.sourceStart:D.start,sourceEnd=clock?clock.sourceEnd:D.end;
 const clockAt=time=>clock?ghostClockAtSource(clock,time):time;
 const build=(first,end)=>{
  const node={first,end,west:Infinity,east:-Infinity,south:Infinity,north:-Infinity,ranges:[],left:null,right:null};
  if(end-first>TIMELINE_LEAF_SIZE){
   const middle=(first+end)>>>1;node.left=build(first,middle);node.right=build(middle,end);
   const {left,right}=node;
   node.west=Math.min(left.west,right.west);node.east=Math.max(left.east,right.east);
   node.south=Math.min(left.south,right.south);node.north=Math.max(left.north,right.north);
   node.ranges=left.ranges.slice();
   for(const range of right.ranges)appendTimelineRange(node.ranges,range.start,range.end);
  }else{
   for(let i=first;i<end;i++){
    const a=points[i],b=points[i+1],connected=b&&b[2]>a[2]&&b[2]-a[2]<=TRACK_MAX_GAP;
    const from=Math.max(sourceStart,a[2]),to=Math.min(sourceEnd,connected?b[2]:Math.min(a[2]+TRACK_MAX_GAP,b?b[2]-1e-6:sourceEnd));
    if(from>to)continue;
    const start=Math.ceil(clockAt(from)-1e-6),stop=Math.floor(clockAt(to)+1e-6);
    if(start>stop)continue;
    appendTimelineRange(node.ranges,start,stop);
    node.west=Math.min(node.west,a[0]);node.east=Math.max(node.east,a[0]);
    node.south=Math.min(node.south,a[1]);node.north=Math.max(node.north,a[1]);
    // PCHIP stays inside each pair of endpoints on both coordinate axes.
    // A gap holds only the first position; it must not connect distant points.
    if(connected){
     node.west=Math.min(node.west,b[0]);node.east=Math.max(node.east,b[0]);
     node.south=Math.min(node.south,b[1]);node.north=Math.max(node.north,b[1]);
    }
   }
  }
  return node;
 };
 const root=build(0,points.length);if(clock)clock.timelineIndex=root;else timelineTrackCache.set(points,root);return root;
}
const EMPTY_TIMELINE_RANGES=[];
function visibleBoatRanges(points,bounds,clock=null){
 const root=prepareTimelineTrack(points,clock);
 const sourceStart=clock?clock.sourceStart:D.start,sourceEnd=clock?clock.sourceEnd:D.end;
 const clockAt=time=>clock?ghostClockAtSource(clock,time):time;
 const outside=node=>!node.ranges.length||!mapBoundsIntersect(node,bounds);
 const inside=node=>node.west>=bounds.west&&node.east<=bounds.east&&node.south>=bounds.south&&node.north<=bounds.north;
 if(outside(root))return EMPTY_TIMELINE_RANGES;
 if(inside(root))return root.ranges;
 const ranges=[];
 const visit=node=>{
  if(outside(node))return;
  if(inside(node)){
   for(const range of node.ranges)appendTimelineRange(ranges,range.start,range.end);
  }else if(node.left){visit(node.left);visit(node.right);}
  else for(let i=node.first;i<node.end;i++){
   const [lon,lat,time]=points[i],next=points[i+1];let from=time,to;
   if(next&&next[2]>time&&next[2]-time<=TRACK_MAX_GAP){
    const interval=trackIntervalInBounds(points,i,bounds);if(!interval)continue;
    from=interval.start;to=interval.end;
   }else{
    if(lon<bounds.west||lon>bounds.east||lat<bounds.south||lat>bounds.north)continue;
    to=Math.min(time+TRACK_MAX_GAP,next?next[2]-1e-6:sourceEnd);
   }
   from=Math.max(sourceStart,from);to=Math.min(sourceEnd,to);if(from>to)continue;
   appendTimelineRange(ranges,Math.ceil(clockAt(from)-1e-6),Math.floor(clockAt(to)+1e-6));
  }
 };
 visit(root);
 return ranges;
}
// Prepare the complete fleet before interaction, including currently hidden boats.
for(const boat of boats){
 prepareTimelineTrack(boat.points);
 const clock=ghostClocks.get(boat.id);if(clock&&!clock.error)prepareTimelineTrack(boat.points,clock);
}

function timeAtOffset(offset,{fractional=false}={}){
 if(!timelineLength)return selectedTime;
 offset=Math.max(0,Math.min(timelineLength-1,fractional?offset:Math.round(offset)));
 for(const range of visibleTimeRanges){
  const length=range.end-range.start+1;
  if(offset<length)return Math.min(range.end,range.start+offset);
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

function setCurrentTime(time,{fractional=false,crossedEvents=false,allowOutsideVisibleRanges=false}={}){
 const previousTime=selectedTime;
 time=Math.max(D.start,Math.min(allowOutsideVisibleRanges?VIEWER_DATA_END:viewerEndTime(),fractional?time:Math.round(time)));
 let nearest=time,distance=Infinity;
 for(const range of allowOutsideVisibleRanges?[]:visibleTimeRanges){
  const candidate=Math.max(range.start,Math.min(range.end,time));
  if(Math.abs(candidate-time)<distance){nearest=candidate;distance=Math.abs(candidate-time);}
 }
 if(selectedTime!==nearest){hideMapEventImage();hideEventVideo();}
 selectedTime=nearest;
 $('time').value=offsetAtTime(selectedTime);
 $('time').setAttribute('aria-valuetext',fmt(selectedTime));
 syncTimelineEvent(previousTime,{crossedEvents});
}

function updateTimeline({preserveTime=false}={}){
 if(editingNote)return false;
 const presenting=document.body.classList.contains('presenting');
 const bounds=visibleMapBounds();if(!bounds)return false;
 const ranges=[];
 for(const boat of boats)if(boatIsDisplayed(boat)){
  if(!handicapTracksEnabled)ranges.push(...visibleBoatRanges(boat.points,bounds));
  else{
   const clock=ghostClocks.get(boat.id);
   if(!clock.error){
    ranges.push(...visibleBoatRanges(boat.points,bounds,clock));
    const finish=trackPosition(boat.points,clock.sourceEnd)?.point;
    if(finish&&finish[0]>=bounds.west&&finish[0]<=bounds.east&&finish[1]>=bounds.south&&finish[1]<=bounds.north)
     ranges.push({start:Math.ceil(clock.end),end:Math.floor(clock.end+GHOST_FINISH_HOLD)});
   }
  }
 }
 ranges.sort((a,b)=>a.start-b.start);
 boatTimeRanges=[];
 for(const range of ranges){
  const previous=boatTimeRanges.at(-1);
  if(previous&&range.start<=previous.end+1)previous.end=Math.max(previous.end,range.end);
  else boatTimeRanges.push({...range});
 }
 // Events in excluded gaps remain available through event navigation only.
 // Keep a manually selected event's exact time without inserting it into the slider.
 visibleTimeRanges=boatTimeRanges.length?boatTimeRanges:presenting?[{start:D.start,end:viewerEndTime()}]:[];
 timelineLength=visibleTimeRanges.reduce((sum,r)=>sum+r.end-r.start+1,0);
 const slider=$('time');slider.min=0;slider.max=Math.max(0,timelineLength-1);slider.step=1;slider.disabled=timelineLength<2;
 $('play').disabled=hasRenderingFailure()||(timelineLength<2&&!eventPlaybackTarget);
 if(slider.disabled&&interval&&!eventPlaybackTarget)stopPlayback();
 const before=selectedTime;
 if(presenting||preserveTime){$('time').value=offsetAtTime(selectedTime);$('time').setAttribute('aria-valuetext',fmt(selectedTime));}
 else setCurrentTime(selectedTime);
 renderTimelineEvents();
 $('timeWindow').textContent=timelineLength
  ? `I udsnittet: ${fmt(visibleTimeRanges[0].start)} – ${fmt(visibleTimeRanges.at(-1).end)} · ${visibleTimeRanges.length} ${visibleTimeRanges.length===1?'periode':'perioder'} · trin: 1 sekund · pauser uden både springes over`
  : isBoatFilterActive()?'Ingen både i filteret passerer dette udsnit. Ret filteret eller zoom ud.':'Ingen både passerer dette udsnit. Zoom ud eller flyt kortet.';
 if(interval&&!eventPlaybackTarget){playbackOffset=offsetAtTime(selectedTime);playbackTickTime=performance.now();}
 return selectedTime!==before;
}

$('time').oninput=()=>seekTimeline(+$('time').value);
$('time').addEventListener('wheel',e=>{
 if($('time').disabled||(!e.deltaY&&!e.deltaX))return;
 e.preventDefault();seekTimeline(+$('time').value+Math.sign(e.deltaY||e.deltaX)*(e.shiftKey?60:1),{snap:false});
},{passive:false});
$('time').onkeydown=e=>{
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
  e.preventDefault();e.stopPropagation();stopPlayback();step((['ArrowRight','ArrowUp'].includes(e.key)?1:-1)*(e.shiftKey?60:1));
 }
};
