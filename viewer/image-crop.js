// Cropping creates a new attachment and saves it to the current event.
let imageCropState=null;
const cropClamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function renderImageCrop(){
 const state=imageCropState;if(!state?.bitmap)return;
 const {x,y,width,height}=state.rect,w=state.bitmap.naturalWidth,h=state.bitmap.naturalHeight;
 Object.assign($('imageCropSelection').style,{left:100*x/w+'%',top:100*y/h+'%',width:100*width/w+'%',height:100*height/h+'%'});
 for(const [id,value,max] of [['X',x,w-1],['Y',y,h-1],['Width',width,w-x],['Height',height,h-y]]){
  $('imageCrop'+id).value=value;$('imageCrop'+id).max=max;
 }
}
function closeImageCrop(){
 const state=imageCropState;imageCropState=null;
 if(state?.uploadToken===imageUploadToken){imageUploadToken++;eventImageLoading=false;updateImageEditor();updatePresentationControls();}
 $('imageCropDialog').close();$('imageCropSource').removeAttribute('src');$('imageCropStage').hidden=true;
}
async function openImageCrop(){
 const image=currentAttachedImage();
 if(window.SR_READONLY||eventImageLoading||!image||!finishInlineTextEditing())return;
 stopPlayback();cancelPlacement();setDrawingTool('pan');hideMapEventImage();
 const state={image,target:editingNote,bitmap:null,rect:null,gesture:null,saving:false};imageCropState=state;
 $('imageCropStage').hidden=true;$('imageCropFields').disabled=true;
 $('applyImageCrop').disabled=$('resetImageCrop').disabled=true;
 $('imageCropStatus').textContent='Indlæser billede …';
 $('imageCropDialog').showModal();$('cancelImageCrop').focus();
 try{
  if(!validEventImageURL(image.url))throw new Error('Billedets serveradresse mangler.');
  const bitmap=new Image();
  await new Promise((resolve,reject)=>{bitmap.onload=resolve;bitmap.onerror=()=>reject(new Error('Billedet kunne ikke hentes. Luk og prøv igen.'));bitmap.src=image.url;});
  if(imageCropState!==state)return;
  state.bitmap=bitmap;state.rect={x:0,y:0,width:bitmap.naturalWidth,height:bitmap.naturalHeight};
  $('imageCropSource').src=image.url;$('imageCropStage').hidden=false;
  $('imageCropFields').disabled=false;$('applyImageCrop').disabled=$('resetImageCrop').disabled=false;
  $('imageCropStatus').textContent='';renderImageCrop();
 }catch(error){if(imageCropState===state)$('imageCropStatus').textContent=error.message;}
}
function cropPointerPosition(event){
 const bounds=$('imageCropStage').getBoundingClientRect(),bitmap=imageCropState.bitmap;
 return {x:cropClamp(Math.round((event.clientX-bounds.left)/bounds.width*bitmap.naturalWidth),0,bitmap.naturalWidth),
  y:cropClamp(Math.round((event.clientY-bounds.top)/bounds.height*bitmap.naturalHeight),0,bitmap.naturalHeight)};
}
$('imageCropStage').onpointerdown=event=>{
 const state=imageCropState;if(!state?.bitmap||state.saving||state.gesture||event.button!==0)return;
 event.preventDefault();
 const start=cropPointerPosition(event),corner=event.target.dataset.cropCorner;
 const mode=corner?'resize':event.target.closest('#imageCropSelection')?'move':'select';
 state.gesture={pointerId:event.pointerId,start,rect:{...state.rect},mode,corner};
 $('imageCropStage').setPointerCapture(event.pointerId);
 if(mode==='select'){
  state.rect={x:Math.min(start.x,state.bitmap.naturalWidth-1),y:Math.min(start.y,state.bitmap.naturalHeight-1),width:1,height:1};renderImageCrop();
 }
};
$('imageCropStage').onpointermove=event=>{
 const state=imageCropState,g=state?.gesture;if(!g||g.pointerId!==event.pointerId)return;
 const point=cropPointerPosition(event),w=state.bitmap.naturalWidth,h=state.bitmap.naturalHeight,r=g.rect;
 if(g.mode==='move'){
  state.rect={...r,x:cropClamp(r.x+point.x-g.start.x,0,w-r.width),y:cropClamp(r.y+point.y-g.start.y,0,h-r.height)};
 }else{
  const anchor=g.mode==='select'?g.start:{x:g.corner.includes('w')?r.x+r.width:r.x,y:g.corner.includes('n')?r.y+r.height:r.y};
  const x=Math.min(anchor.x,point.x,w-1),y=Math.min(anchor.y,point.y,h-1);
  state.rect={x,y,width:Math.max(1,Math.abs(point.x-anchor.x)),height:Math.max(1,Math.abs(point.y-anchor.y))};
 }
 renderImageCrop();
};
function endCropGesture(event){
 const state=imageCropState,g=state?.gesture;if(!g||g.pointerId!==event.pointerId)return;
 if(event.type==='pointercancel'){state.rect=g.rect;renderImageCrop();}
 state.gesture=null;
 if($('imageCropStage').hasPointerCapture(event.pointerId))$('imageCropStage').releasePointerCapture(event.pointerId);
}
$('imageCropStage').onpointerup=endCropGesture;$('imageCropStage').onpointercancel=endCropGesture;
for(const id of ['X','Y','Width','Height'])$('imageCrop'+id).onchange=()=>{
 const state=imageCropState;if(!state?.bitmap||state.saving)return;
 const values=['X','Y','Width','Height'].map(key=>$('imageCrop'+key).valueAsNumber);
 if(!values.every(Number.isFinite)){renderImageCrop();return;}
 const w=state.bitmap.naturalWidth,h=state.bitmap.naturalHeight;
 const x=cropClamp(Math.round(values[0]),0,w-1),y=cropClamp(Math.round(values[1]),0,h-1);
 state.rect={x,y,width:cropClamp(Math.round(values[2]),1,w-x),height:cropClamp(Math.round(values[3]),1,h-y)};
 renderImageCrop();
};
$('resetImageCrop').onclick=()=>{
 const state=imageCropState;if(!state?.bitmap||state.saving)return;
 state.rect={x:0,y:0,width:state.bitmap.naturalWidth,height:state.bitmap.naturalHeight};renderImageCrop();
};
$('applyImageCrop').onclick=async()=>{
 const state=imageCropState;if(!state?.bitmap||state.saving||window.SR_READONLY)return;
 const {x,y,width,height}=state.rect;
 if(x===0&&y===0&&width===state.bitmap.naturalWidth&&height===state.bitmap.naturalHeight){closeImageCrop();return;}
 const token=++imageUploadToken;state.uploadToken=token;state.saving=true;state.gesture=null;
 eventImageLoading=true;updateImageEditor();
 $('imageCropFields').disabled=true;$('applyImageCrop').disabled=$('resetImageCrop').disabled=true;
 $('imageCropStatus').textContent='Gemmer beskæring …';
 try{
  const scale=Math.min(1,2048/Math.max(width,height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  canvas.getContext('2d').drawImage(state.bitmap,x,y,width,height,0,0,canvas.width,canvas.height);
  const image=await uploadEventImageCanvas(canvas,state.image.name);
  if(imageCropState!==state||token!==imageUploadToken||state.target!==editingNote||currentAttachedImage()!==state.image)return;
  if(!setAttachedEventImage(image))throw Error('Beskæringen kunne ikke gemmes til eventet.');
  closeImageCrop();
 }catch(error){if(imageCropState===state)$('imageCropStatus').textContent=error.message||'Beskæringen kunne ikke gemmes. Prøv igen.';}
 finally{
  if(token===imageUploadToken){eventImageLoading=false;updateImageEditor();updatePresentationControls();}
  if(imageCropState===state){state.saving=false;$('imageCropFields').disabled=false;$('applyImageCrop').disabled=$('resetImageCrop').disabled=false;}
 }
};
$('cropNoteImage').onclick=openImageCrop;
$('cancelImageCrop').onclick=closeImageCrop;
$('imageCropDialog').oncancel=event=>{event.preventDefault();closeImageCrop();};
document.addEventListener('keydown',event=>{
 if($('imageCropDialog').open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeImageCrop();}
},true);
