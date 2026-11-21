// Hosted drafts stay in the browser until the user publishes.
function presentationJSON(){return JSON.stringify({version:1,notes,speedPins});}
(()=>{
 const config=window.SR_CONFIG,bar=document.querySelector('.editor-actions');
 const status=document.createElement('p');status.id='onlineStatus';status.setAttribute('role','status');
 bar.after(status);
 const button=(label,action,...values)=>{const b=document.createElement('button');srBind(b,'textContent',()=>srText(label,...values));b.onclick=action;bar.append(b);return b;};
 const downloadDraft=async(document,name)=>{
  try{
   const output=await embedEventImages(structuredClone(document),{draftOnly:true});
   download(new Blob([JSON.stringify(output,null,2)],{type:'application/json'}),window.SR_EVENT.id+'-'+name+'.json');
  }catch(error){srBind(status,'textContent',()=>srErrorText(error));}
 };
 if(!window.SR_RHUMBLINE_SETUP&&notes.length)showPresentationEvent(0,{expandPanel:false});
 if(window.SR_READONLY){
  if(config.apiBase){
   const updateEditorLink=()=>{$('loginLink').href=eventEditorURL();};
   updateEditorLink();srOnLanguageChange(updateEditorLink);$('loginLink').hidden=false;
  }
  srBind(status,'textContent',()=>notes.length?'':srText('Der er endnu ingen udgivne events.'));
  return;
 }
 if(config.admin){
  srBind(status,'textContent',()=>srText(window.SR_RESTORED?'Din lokale kladde er gendannet. Klik Udgiv, når den er klar.':'Redigering · ændringer udgives først med Udgiv.')
   +(window.SR_PREVIOUS_DRAFT?srText(' Der findes en ældre kladde fra før en anden udgivelse.'):''));
  if(window.SR_PREVIOUS_DRAFT){
   button('Hent tidligere kladde',()=>downloadDraft(window.SR_PREVIOUS_DRAFT.document,'tidligere-kladde'));
  }
  for(const key of window.SR_LEGACY_DRAFT_KEYS||[]){
   const [account,previous]=key.slice(hostedDraftKey.length).split(':');
   const label=previous?'Hent tidligere kladde for {0}':'Hent kladde for {0}';
   button(label,()=>downloadDraft(JSON.parse(eventStorage.getItem(key)).document,account+(previous?'-tidligere-kladde':'-kladde')),account);
  }
  button('Log ud',async()=>{if(!noteNavigationAllowed())return;try{const r=await fetch(config.apiBase+'/api/logout',{method:'POST'});if(!r.ok)throw new SRMessageError('Kunne ikke logge ud.');location.reload();}catch(e){srBind(status,'textContent',()=>srErrorText(e));}});
  const publish=button('Udgiv',async()=>{
   if(!noteNavigationAllowed())return;
   if([...eventImageUploads.keys()].some(note=>notes.includes(note))){srBind(status,'textContent',()=>srText('Vent, mens billeder klargøres.'));return;}
   const documentJSON=presentationJSON();
   publish.disabled=true;
   try{
    const snapshot=JSON.parse(documentJSON),publishedImages=new Set();
    for(const {image} of snapshot.notes){
     if(!image?.draft)continue;
     if(!publishedImages.has(image.id)){
      const saved=await sendEventImage(await readDraftImage(image),image.id);
      if(saved.id!==image.id||saved.url!==image.url)throw new SRMessageError('Billedet kunne ikke gemmes til eventet.');
      publishedImages.add(image.id);
     }
     delete image.draft;
    }
    const response=await fetch(config.apiBase+eventAPI('/api/presentation'),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha:window.SR_SHA,document:snapshot})});
    if(response.status===401){location.assign(eventLoginURL());return;}
    const result=await response.json();
    if(!response.ok)throw new SRMessageError(response.status===409?'En anden version er gemt. Eksportér din kladde, og genindlæs før du fortsætter.':result.error||'Udgivelsen mislykkedes.');
    window.SR_SHA=result.sha;
    const changed=presentationJSON()!==documentJSON;
    for(const {image} of notes)if(image?.draft&&publishedImages.has(image.id))delete image.draft;
    if(changed)eventStorage.setItem(window.SR_DRAFT_KEY,JSON.stringify({sha:result.sha,document:JSON.parse(presentationJSON())}));
    else eventStorage.removeItem(window.SR_DRAFT_KEY);
    srBind(status,'textContent',()=>changed?srText('Udgivet. Nyere ændringer ligger i kladden.'):srText('Gemt i GitHub. Den offentlige side opdateres, når udgivelsen er færdig.'));
   }catch(e){
    if(e.status===401)location.assign(eventLoginURL());
    else srBind(status,'textContent',()=>srErrorText(e));
   }finally{publish.disabled=false;}
  });
 }
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.append(input);
 button('Importér noter',()=>{input.value='';input.click();});
 input.onchange=()=>{const file=input.files[0];if(file)importNotes(file);};
 async function importNotes(file){
  if(!noteNavigationAllowed())return;
  try{
   const data=validatePresentationDocument(JSON.parse(await file.text()));
   const pins=data.speedPins;
   let incoming=data.notes;
   if(incoming.some(n=>!n||!Number.isFinite(n.time)||typeof n.text!=='string'))throw new SRMessageError('Filen indeholder ikke gyldige noter.');
   if(notes.length&&!confirm(srText('Erstat den aktuelle kladde med noterne fra filen? Eksportér først, hvis du vil beholde begge.')))return;
   srBind(status,'textContent',()=>srText('Importerer noter og billeder …'));
   for(const note of incoming){
    if(note.image?.dataUrl){
     const blob=await fetch(note.image.dataUrl).then(r=>r.blob());
     const saved=await saveEventImage(blob);
     note.image={...note.image,...saved};delete note.image.dataUrl;
    }else if(note.image?.url){note.image.url=note.image.url.replace(/^\//,'');}
   }
   incoming=chronologicalNotes(incoming);
   if(!persistNotes(incoming))throw new SRMessageError('Noterne kunne ikke gemmes.');
   SRStorage.setItem('sr2026-speed-pins',JSON.stringify(pins));
   notes=incoming;speedPins=pins;viewingSpeedPins=null;activePresentationNote=null;leaveOpenedEvent();
   if(notes.length)restoreNote(notes[0]);else resetMapMeasurement();
   refreshEditedEvent();
   srBind(status,'textContent',()=>config.admin?srText('Importeret til kladden. Klik Udgiv for at offentliggøre.'):srText('Noter og fart-pins er importeret.'));
  }catch(e){srBind(status,'textContent',()=>srErrorText(e));}finally{input.value='';}
 }
})();
