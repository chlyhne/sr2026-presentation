// Points use the same geographic map coordinates as note markers, not pixels.
let drawingTool='pan',drawingGesture=null;
const DRAWING_TOOLS=new Set(['pen','arrow','line','circle']);
function noteIsVisible(note){
 if(!$('annotationsVisible').checked||note.time!==currentTime())return false;
 if(editingNote)return note===editingNote;
 return !document.body.classList.contains('presenting')||note===activePresentationNote;
}
function validDrawing(d){
 return d&&DRAWING_TOOLS.has(d.tool)&&/^#[0-9a-f]{6}$/i.test(d.colour)
  &&Number.isFinite(d.width)&&d.width>=1&&d.width<=12
  &&Array.isArray(d.points)&&d.points.length>=2
  &&d.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));
}
function drawNoteShape(d,parent){
 if(!validDrawing(d))return;
 const attrs={fill:'none',stroke:d.colour,'stroke-width':d.width,
  'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'};
 const first=d.points[0],last=d.points.at(-1);
 if(d.tool==='circle'){
  el('circle',{...attrs,cx:first[0],cy:first[1],r:Math.hypot(last[0]-first[0],last[1]-first[1])},parent);
 }else{
  const points=d.tool==='pen'?d.points:[first,last];
  el('path',{...attrs,d:points.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ')},parent);
  if(d.tool==='arrow'){
   const matrix=mapViewport()?.matrix;if(!matrix)return;
   const size=(10+d.width)/Math.hypot(matrix.a,matrix.b),angle=Math.atan2(last[1]-first[1],last[0]-first[0]);
   const head=[-.5,.5].map(offset=>[last[0]-size*Math.cos(angle+offset),last[1]-size*Math.sin(angle+offset)]);
   el('path',{...attrs,d:`M ${head[0].join(' ')} L ${last.join(' ')} L ${head[1].join(' ')}`},parent);
  }
 }
}
function renderNoteDrawings(){
 const layer=$('noteDrawings');layer.replaceChildren();
 for(const [i,saved] of notes.entries()){
  if(!noteIsVisible(saved))continue;
  const note=saved;
  if(!Array.isArray(note.drawings)||!note.drawings.length)continue;
  const group=el('g',{'data-drawing-note-index':i},layer);
  for(const shape of note.drawings)drawNoteShape(shape,group);
 }
 renderDrawingPreview();
}
function renderDrawingPreview(){
 $('drawingPreview').replaceChildren();
 if(drawingGesture&&$('annotationsVisible').checked)drawNoteShape(drawingGesture.shape,$('drawingPreview'));
}
function updateDrawingControls(){
 const count=Array.isArray(editingNote?.drawings)?editingNote.drawings.length:0;
 $('undoDrawing').disabled=$('clearDrawings').disabled=count===0;
 $('drawingCount').textContent=`${count} ${count===1?'tegning':'tegninger'} til denne note`;
}
function setDrawingTool(tool){
 cancelDrawingGesture();drawingTool=DRAWING_TOOLS.has(tool)?tool:'pan';
 $('drawingTool').value=drawingTool;$('map').classList.toggle('drawing',drawingTool!=='pan');
}
function mapDrawingPoint(e,inverse){
 const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(inverse);return [p.x,p.y];
}
function beginDrawingGesture(e){
 if(drawingGesture){e.preventDefault();return true;}
 if(!editingNote||drawingTool==='pan'||placingNote||document.body.classList.contains('presenting'))return false;
 e.preventDefault();stopPlayback();
 if(!persistEventSettings(editingNote,{annotationsVisible:true}))return true;
 $('annotationsVisible').checked=true;
 const inverse=mapViewport().inverse,point=mapDrawingPoint(e,inverse);
 drawingGesture={pointerId:e.pointerId,inverse,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,
  shape:{tool:drawingTool,colour:$('drawingColour').value,width:+$('drawingWidth').value,points:[point,point]}};
 $('map').setPointerCapture(e.pointerId);renderAnnotations();return true;
}
function moveDrawingGesture(e){
 const gesture=drawingGesture;if(!gesture||e.pointerId!==gesture.pointerId)return false;
 e.preventDefault();
 const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];
 for(const sample of events.length?events:[e]){
  if(Math.hypot(sample.clientX-gesture.x,sample.clientY-gesture.y)>3)gesture.moved=true;
  const point=mapDrawingPoint(sample,gesture.inverse);
  if(gesture.shape.tool==='pen'){
   if(Math.hypot(sample.clientX-gesture.lastX,sample.clientY-gesture.lastY)<2)continue;
   gesture.shape.points.push(point);gesture.lastX=sample.clientX;gesture.lastY=sample.clientY;
  }else gesture.shape.points[1]=point;
 }
 renderDrawingPreview();return true;
}
function endDrawingGesture(e){
 if(!drawingGesture||e.pointerId!==drawingGesture.pointerId)return false;
 const gesture=drawingGesture;
 if(e.type==='pointerup'){
  moveDrawingGesture(e);
  if(gesture.moved){
   const point=mapDrawingPoint(e,gesture.inverse);
   if(gesture.shape.tool==='pen')gesture.shape.points.push(point);else gesture.shape.points[1]=point;
   persistEventChanges(editingNote,{drawings:[...(editingNote.drawings||[]),gesture.shape]});
  }
 }
 cancelDrawingGesture();updateDrawingControls();renderAnnotations();return true;
}
function cancelDrawingGesture(){
 if(!drawingGesture)return;
 const pointerId=drawingGesture.pointerId;drawingGesture=null;
 if($('map').hasPointerCapture(pointerId))$('map').releasePointerCapture(pointerId);
 $('drawingPreview').replaceChildren();
}
$('drawingTool').onchange=()=>{cancelPlacement();setDrawingTool($('drawingTool').value);};
$('undoDrawing').onclick=()=>{
 if(!editingNote)return;cancelDrawingGesture();persistEventChanges(editingNote,{drawings:(editingNote.drawings||[]).slice(0,-1)});updateDrawingControls();renderAnnotations();
};
$('clearDrawings').onclick=()=>{
 if(!editingNote)return;cancelDrawingGesture();persistEventChanges(editingNote,{drawings:[]});updateDrawingControls();renderAnnotations();
};
