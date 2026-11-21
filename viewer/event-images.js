// Hosted drafts keep image bytes in the browser until publication.
const eventImageUploads=new Map(),eventImageErrors=new WeakMap();
let imageUploadToken=0;
let shownEventImageId=null,eventImageRenderToken=0;
let panelEventImage=null,panelEventImageNote=null,mapImageView=null,mapImageToken=0;
const validEventImageURL=url=>/^\/?(?:private-)?event-images\/[0-9a-f-]{36}\.(webp|png|jpg)$/.test(url||'');
const privateEventImage=image=>image.url?.startsWith('private-event-images/');
const eventImageExtensions={'image/webp':'webp','image/png':'png','image/jpeg':'jpg'};
const draftImageURLs=new Map();
let draftImageDB;
function openDraftImageDB(){
 if(!draftImageDB)draftImageDB=new Promise((resolve,reject)=>{
  const request=indexedDB.open('sr-event-images',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 }).catch(error=>{draftImageDB=null;throw error;});
 return draftImageDB;
}
async function draftImageTransaction(mode,operation){
 const db=await openDraftImageDB();
 return new Promise((resolve,reject)=>{
  const transaction=db.transaction('drafts',mode),request=operation(transaction.objectStore('drafts'));
  transaction.oncomplete=()=>resolve(request.result);
  transaction.onabort=()=>reject(transaction.error);
 });
}
async function readDraftImage(image){
 const blob=await draftImageTransaction('readonly',store=>store.get(image.id));
 if(!blob)throw new SRMessageError('Billedet mangler i den lokale kladde.');
 return blob;
}
function eventImageSource(image){
 if(!validEventImageURL(image?.url))throw new SRMessageError('Billedets serveradresse mangler.');
 if(!image.draft){
  if(privateEventImage(image))return privateEventSetAPI('/api/'+image.url);
  const path=image.url.replace(/^\//,'');
  return eventServiceAvailable()?'/api/'+path:path;
 }
 if(!draftImageURLs.has(image.id))draftImageURLs.set(image.id,readDraftImage(image).then(blob=>URL.createObjectURL(blob)).catch(error=>{
  draftImageURLs.delete(image.id);throw error;
 }));
 return draftImageURLs.get(image.id);
}
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
  const src=await eventImageSource(image),img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new SRMessageError('Billedet kunne ikke hentes. Klik for at vise kortet igen.'));img.src=src;});
  if(token!==mapImageToken)return;
  $('mapEventImageContent').src=src;srBind($('mapEventImageContent'),'alt',()=>image.name||srText('Billede til event'));
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
  return {...await saveEventImage(blob),name,width:canvas.width,height:canvas.height,type:blob.type};
}
async function saveEventImage(blob){
  const extension=eventImageExtensions[blob.type];
  if(!extension)throw new SRMessageError('Billedet kunne ikke klargøres.');
  const id=crypto.randomUUID(),url='event-images/'+id+'.'+extension;
  await draftImageTransaction('readwrite',store=>store.put(blob,id));
  return {id,url,draft:true};
}
async function sendEventImage(blob,id,isPrivate=false){
  const path=isPrivate?privateEventSetAPI('/api/private-event-images')+'&id='+encodeURIComponent(id):'/api/event-images'+(id?'?id='+encodeURIComponent(id):'');
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':blob.type},body:blob});
  if(!response.ok){
   const {error}=await response.json().catch(()=>({}));
   const failure=new SRMessageError(error||'Serveren kunne ikke gemme billedet. Start vieweren med python3 scripts/serve_viewer.py.');
   failure.status=response.status;throw failure;
  }
  const {id:savedId,url:savedURL}=await response.json();
  return {id:savedId,url:savedURL};
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
 const id=image?JSON.stringify([image.id,image.url,image.draft]):null;if(id===shownEventImageId){syncEventImageVisibility();return;}
 shownEventImageId=id;const token=++eventImageRenderToken;
 $('eventImageFigure').hidden=true;$('eventImage').removeAttribute('src');$('eventImageStatus').textContent='';
 if(!id)return;
 srBind($('eventImageStatus'),'textContent',()=>srText('Indlæser billede …'));
 try{
  const src=await eventImageSource(image),img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new SRMessageError('Billedet kunne ikke hentes fra serveren.'));img.src=src;});
  if(token!==eventImageRenderToken)return;
  $('eventImage').src=src;
  srBind($('eventImage'),'alt',()=>image.name||srText('Billede til event'));$('eventImageCaption').textContent=image.name||'';
  syncEventImageVisibility();$('eventImageStatus').textContent='';
 }catch(error){if(token===eventImageRenderToken)srBind($('eventImageStatus'),'textContent',()=>srErrorText(error));}
}
async function embedEventImages(document,{draftOnly=false}={}){
 for(const note of document.notes)if(note.image?.id&&(!draftOnly||note.image.draft)){
  const response=await fetch(await eventImageSource(note.image));if(!response.ok)throw new SRMessageError("Billedet til “{0}” mangler. Eksporten er ikke gemt.",note.text||note.image.name);
  const blob=await response.blob();delete note.image.draft;
  note.image.dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
 }
 return document;
}
async function exportEventNotes(){
 const button=$('export');button.disabled=true;
 try{
  const output=await embedEventImages(JSON.parse(presentationJSON()));
  download(new Blob([JSON.stringify(output,null,2)],{type:'application/json'}),window.SR_EVENT.id+'-haendelser.json');
 }catch(error){srBind($('annotationStatus'),'textContent',()=>error.message?srErrorText(error):srText('Noterne kunne ikke eksporteres.'));}
 finally{button.disabled=false;}
}
