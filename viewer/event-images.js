// Photos are uploaded to the local server; notes keep their permanent URL.
let pendingEventImage=null,eventImageLoading=false,imageUploadToken=0;
let shownEventImageId=null,eventImageRenderToken=0;
let panelEventImage=null,panelEventImageNote=null,mapImageView=null,mapImageToken=0;
const validEventImageURL=url=>/^\/?event-images\/[0-9a-f-]{36}\.(webp|png|jpg)$/.test(url||'');
function syncEventImageVisibility(){
 $('eventImageFigure').hidden=!!mapImageView||!$('eventImage').getAttribute('src');
 $('eventImageStatus').hidden=!!mapImageView;
 $('visibleBoats').hidden=!!mapImageView;
 $('mapTools').hidden=!!mapImageView;
 if(mapImageView)highlightVisibleBoat(null);
}
function hideMapEventImage(){
 const wasFocused=document.activeElement===$('mapEventImage');
 mapImageToken++;mapImageView=null;
 $('mapEventImage').hidden=true;$('mapEventImageContent').hidden=true;
 $('mapEventImageContent').removeAttribute('src');$('mapEventImageStatus').textContent='';
 $('eventImageButton').setAttribute('aria-expanded','false');
 syncEventImageVisibility();
 if(wasFocused&&!$('eventImageFigure').hidden)$('eventImageButton').focus({preventScroll:true});
}
async function showMapEventImage(image=panelEventImage,note=panelEventImageNote){
 if(!image?.id||!validEventImageURL(image.url)){hideMapEventImage();return;}
 stopPlayback();
 const token=++mapImageToken;mapImageView={note,imageId:image.id};
 $('mapEventImage').hidden=false;$('mapEventImageContent').hidden=true;
 $('mapEventImageContent').removeAttribute('src');$('mapEventImageStatus').textContent='Indlæser billede …';
 $('eventImageButton').setAttribute('aria-expanded','true');
 syncEventImageVisibility();
 if(document.activeElement===$('eventImageButton'))$('mapEventImage').focus({preventScroll:true});
 try{
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Billedet kunne ikke hentes. Klik for at vise kortet igen.'));img.src=image.url;});
  if(token!==mapImageToken)return;
  $('mapEventImageContent').src=image.url;$('mapEventImageContent').alt=image.name||'Billede til event';
  $('mapEventImageContent').hidden=false;$('mapEventImageStatus').textContent='';
 }catch(error){if(token===mapImageToken)$('mapEventImageStatus').textContent=error.message;}
}
$('mapEventImage').onclick=hideMapEventImage;
$('eventImageButton').onclick=()=>{if(finishInlineTextEditing())showMapEventImage();};
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&mapImageView&&!event.target.closest('input,textarea,select,[contenteditable="true"]')){
  event.preventDefault();event.stopImmediatePropagation();hideMapEventImage();
 }
},true);
async function prepareEventImage(file){
 if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))throw new Error('Vælg et JPEG-, PNG-, WebP- eller GIF-billede.');
 const url=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Billedfilen kunne ikke læses.'));img.src=url;});
  const scale=Math.min(1,2048/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  return await uploadEventImageCanvas(canvas,file.name);
 }finally{URL.revokeObjectURL(url);}
}
async function uploadEventImageCanvas(canvas,name){
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));
  if(!blob)throw new Error('Billedet kunne ikke klargøres.');
  const response=await fetch((window.SR_CONFIG?.apiBase||'')+'/api/event-images',{method:'POST',headers:{'Content-Type':blob.type},body:blob});
  if(!response.ok){
   let message='Serveren kunne ikke gemme billedet. Start vieweren med python3 scripts/serve_viewer.py.';
   try{message=(await response.json()).error||message;}catch{}
   throw new Error(message);
  }
  const saved=await response.json();
  return {id:saved.id,url:saved.url,name,width:canvas.width,height:canvas.height,type:blob.type};
}
function setAttachedEventImage(image){
 if(editingNote)return persistEventChanges(editingNote,{image});
 pendingEventImage=image;return true;
}
function currentAttachedImage(){return editingNote?editingNote.image:pendingEventImage;}
function updateImageEditor(){
 const image=currentAttachedImage();
 $('removeNoteImage').hidden=!image;
 $('cropNoteImage').hidden=!image;
 $('cropNoteImage').disabled=$('removeNoteImage').disabled=$('noteImage').disabled=eventImageLoading;
 $('save').disabled=$('placeNote').disabled=eventImageLoading;
 $('save').textContent=editingNote?'Gem ændringer':image||hasPendingEventVideo()?'Gem event':'Gem tidspunkt uden markør';
 $('noteImageStatus').textContent=eventImageLoading?'Klargør billede …':image?`Vedhæftet: ${image.name}`:'';
}
function clearPendingEventImage(){
 imageUploadToken++;eventImageLoading=false;
 pendingEventImage=null;$('noteImage').value='';updateImageEditor();
}
$('noteImage').onchange=async()=>{
 const file=$('noteImage').files[0];if(!file)return;
 const token=++imageUploadToken,target=editingNote;
 eventImageLoading=true;updateImageEditor();
 try{
  const image=await prepareEventImage(file);
  if(token!==imageUploadToken||target!==editingNote)return;
  if(!setAttachedEventImage(image))throw Error('Billedet kunne ikke gemmes til eventet.');
 }catch(error){
  if(token===imageUploadToken)$('annotationStatus').textContent=error.message||'Billedet kunne ikke gemmes.';
 }finally{
  if(token===imageUploadToken){eventImageLoading=false;updateImageEditor();updatePresentationControls();}
 }
};
$('removeNoteImage').onclick=()=>{
 imageUploadToken++;eventImageLoading=false;
 if(!setAttachedEventImage(null))return;
 $('noteImage').value='';updateImageEditor();updatePresentationControls();
};
async function renderEventImage(image,note){
 panelEventImage=image||null;panelEventImageNote=note||null;
 if(mapImageView&&(mapImageView.note!==panelEventImageNote||mapImageView.imageId!==image?.id))hideMapEventImage();
 const id=image?.id||null;if(id===shownEventImageId){syncEventImageVisibility();return;}
 shownEventImageId=id;const token=++eventImageRenderToken;
 $('eventImageFigure').hidden=true;$('eventImage').removeAttribute('src');$('eventImageStatus').textContent='';
 if(!id)return;
 $('eventImageStatus').textContent='Indlæser billede …';
 try{
  if(!validEventImageURL(image.url))throw new Error('Billedets serveradresse mangler.');
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Billedet kunne ikke hentes fra serveren.'));img.src=image.url;});
  if(token!==eventImageRenderToken)return;
  $('eventImage').src=image.url;
  $('eventImage').alt=image.name||'Billede til event';$('eventImageCaption').textContent=image.name||'';
  syncEventImageVisibility();$('eventImageStatus').textContent='';
 }catch(error){if(token===eventImageRenderToken)$('eventImageStatus').textContent=error.message;}
}
async function exportEventNotes(){
 const button=$('export');button.disabled=true;
 try{
  const output=JSON.parse(JSON.stringify(notes));
  for(const note of output)if(note.image?.id){
   const response=await fetch(note.image.url);if(!response.ok)throw new Error(`Billedet til “${note.text||note.image.name}” mangler. Eksporten er ikke gemt.`);
   const blob=await response.blob();
   note.image.dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  }
  download(new Blob([JSON.stringify({version:1,notes:output,speedPins},null,2)],{type:'application/json'}),'sr2026-haendelser.json');
 }catch(error){$('annotationStatus').textContent=error.message||'Noterne kunne ikke eksporteres.';}
 finally{button.disabled=false;}
}
