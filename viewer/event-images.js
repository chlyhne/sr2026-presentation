// Photos are uploaded to the local server; notes keep their permanent URL.
const eventImageUploads=new Map(),eventImageErrors=new WeakMap();
let imageUploadToken=0;
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
 $('mapEventImageContent').removeAttribute('src');srBind($('mapEventImageStatus'),'textContent',()=>srText('Indlæser billede …'));
 $('eventImageButton').setAttribute('aria-expanded','true');
 syncEventImageVisibility();
 if(document.activeElement===$('eventImageButton'))$('mapEventImage').focus({preventScroll:true});
 try{
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new SRMessageError('Billedet kunne ikke hentes. Klik for at vise kortet igen.'));img.src=image.url;});
  if(token!==mapImageToken)return;
  $('mapEventImageContent').src=image.url;srBind($('mapEventImageContent'),'alt',()=>image.name||srText('Billede til event'));
  $('mapEventImageContent').hidden=false;$('mapEventImageStatus').textContent='';
 }catch(error){if(token===mapImageToken)srBind($('mapEventImageStatus'),'textContent',()=>srErrorText(error));}
}
$('mapEventImage').onclick=hideMapEventImage;
$('eventImageButton').onclick=()=>{if(finishInlineTextEditing())showMapEventImage();};
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&mapImageView&&!event.target.closest('input,textarea,select,[contenteditable="true"]')){
  event.preventDefault();event.stopImmediatePropagation();hideMapEventImage();
 }
},true);
async function prepareEventImage(file){
 if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))throw new SRMessageError('Vælg et JPEG-, PNG-, WebP- eller GIF-billede.');
 const url=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new SRMessageError('Billedfilen kunne ikke læses.'));img.src=url;});
  const scale=Math.min(1,2048/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  return await uploadEventImageCanvas(canvas,file.name);
 }finally{URL.revokeObjectURL(url);}
}
async function uploadEventImageCanvas(canvas,name){
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));
  if(!blob)throw new SRMessageError('Billedet kunne ikke klargøres.');
  const response=await fetch((window.SR_CONFIG?.apiBase||'')+'/api/event-images',{method:'POST',headers:{'Content-Type':blob.type},body:blob});
  if(!response.ok){
   const {error}=await response.json().catch(()=>({}));
   throw new SRMessageError(error||'Serveren kunne ikke gemme billedet. Start vieweren med python3 scripts/serve_viewer.py.');
  }
  const saved=await response.json();
  return {id:saved.id,url:saved.url,name,width:canvas.width,height:canvas.height,type:blob.type};
}
function setAttachedEventImage(image,target=editingNote){
 return updateEventContent(target,{image});
}
function currentAttachedImage(){return editingNote?.image;}
function updateImageEditor(){
 const image=currentAttachedImage(),loading=eventImageUploads.has(editingNote);
 $('removeNoteImage').hidden=$('cropNoteImage').hidden=!image;
 $('cropNoteImage').disabled=$('removeNoteImage').disabled=$('save').disabled=loading;
 srBind($('noteImageStatus'),'textContent',()=>loading?srText('Klargør billede …'):eventImageErrors.has(editingNote)?srErrorText(eventImageErrors.get(editingNote)):'');
}
$('chooseNoteImage').onclick=()=>{
 if(editingNote&&finishInlineTextEditing()){$('noteImage').value='';$('noteImage').click();}
};
$('noteImage').onchange=async()=>{
 const file=$('noteImage').files[0],target=editingNote;if(!file||!target)return;
 const token=++imageUploadToken;eventImageUploads.set(target,token);eventImageErrors.delete(target);
 updateImageEditor();
 try{
  const image=await prepareEventImage(file);
  if(eventImageUploads.get(target)!==token||(!notes.includes(target)&&target!==newEventDraft))return;
  if(!setAttachedEventImage(image,target))throw new SRMessageError('Billedet kunne ikke gemmes til eventet.');
  refreshPresentationEvents();requestRender();
 }catch(error){
  if(eventImageUploads.get(target)===token){
   eventImageErrors.set(target,error);
   if(target!==editingNote&&(notes.includes(target)||target===newEventDraft))
    srBind($('presentationMessage'),'textContent',()=>srText('Billede til “{0}”: {1}',eventNoteLabel(target),srErrorText(error)));
  }
 }finally{
  if(eventImageUploads.get(target)===token)eventImageUploads.delete(target);
  updateImageEditor();
 }
};
$('removeNoteImage').onclick=()=>{
 if(!editingNote||!finishInlineTextEditing())return;
 if(!setAttachedEventImage(null))return;
 eventImageErrors.delete(editingNote);updateImageEditor();refreshPresentationEvents();requestRender();
};
async function renderEventImage(image,note){
 panelEventImage=image||null;panelEventImageNote=note||null;
 if(mapImageView&&(mapImageView.note!==panelEventImageNote||mapImageView.imageId!==image?.id))hideMapEventImage();
 const id=image?.id||null;if(id===shownEventImageId){syncEventImageVisibility();return;}
 shownEventImageId=id;const token=++eventImageRenderToken;
 $('eventImageFigure').hidden=true;$('eventImage').removeAttribute('src');$('eventImageStatus').textContent='';
 if(!id)return;
 srBind($('eventImageStatus'),'textContent',()=>srText('Indlæser billede …'));
 try{
  if(!validEventImageURL(image.url))throw new SRMessageError('Billedets serveradresse mangler.');
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new SRMessageError('Billedet kunne ikke hentes fra serveren.'));img.src=image.url;});
  if(token!==eventImageRenderToken)return;
  $('eventImage').src=image.url;
  srBind($('eventImage'),'alt',()=>image.name||srText('Billede til event'));$('eventImageCaption').textContent=image.name||'';
  syncEventImageVisibility();$('eventImageStatus').textContent='';
 }catch(error){if(token===eventImageRenderToken)srBind($('eventImageStatus'),'textContent',()=>srErrorText(error));}
}
async function exportEventNotes(){
 const button=$('export');button.disabled=true;
 try{
  const output=JSON.parse(JSON.stringify(notes));
  for(const note of output)if(note.image?.id){
   const response=await fetch(note.image.url);if(!response.ok)throw new SRMessageError("Billedet til “{0}” mangler. Eksporten er ikke gemt.",note.text||note.image.name);
   const blob=await response.blob();
   note.image.dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  }
  download(new Blob([JSON.stringify({version:1,notes:output,speedPins},null,2)],{type:'application/json'}),window.SR_EVENT.id+'-haendelser.json');
 }catch(error){srBind($('annotationStatus'),'textContent',()=>error.message?srErrorText(error):srText('Noterne kunne ikke eksporteres.'));}
 finally{button.disabled=false;}
}
