// Hosted viewers read the published snapshot; writers work through the authenticated backend.
(()=>{
 const config=window.SR_CONFIG,bar=document.querySelector('.editor-actions');
 const status=document.createElement('p');status.id='onlineStatus';status.setAttribute('role','status');
 bar.after(status);
 const button=(label,action)=>{const b=document.createElement('button');b.textContent=label;b.onclick=action;bar.append(b);return b;};
 if(window.SR_READONLY){
  setPresentationMode(true);$('endPresentation').hidden=true;
  if(config.apiBase){$('loginLink').href=config.apiBase+'/auth/login';$('loginLink').hidden=false;}
  status.textContent=notes.length?'':'Der er endnu ingen udgivne events.';
  return;
 }
 if(config.admin){
  status.textContent=window.SR_RESTORED?'Din lokale kladde er gendannet. Klik Udgiv, når den er klar.':'Redigering · ændringer udgives først med Udgiv.';
  if(window.SR_PREVIOUS_DRAFT){
   status.textContent+=' Der findes en ældre kladde fra før en anden udgivelse.';
   button('Hent tidligere kladde',()=>download(new Blob([JSON.stringify(window.SR_PREVIOUS_DRAFT.document,null,2)],{type:'application/json'}),'sr2026-tidligere-kladde.json'));
  }
  button('Log ud',async()=>{try{const r=await fetch(config.apiBase+'/api/logout',{method:'POST'});if(!r.ok)throw Error('Kunne ikke logge ud.');location.reload();}catch(e){status.textContent=e.message;}});
  const publish=button('Udgiv',async()=>{
   if(!finishInlineTextEditing()||!noteNavigationAllowed())return;
   publish.disabled=true;
   try{
    const response=await fetch(config.apiBase+'/api/presentation',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha:window.SR_SHA,document:{version:1,notes,speedPins}})});
    const result=await response.json();
    if(!response.ok)throw Error(response.status===409?'En anden version er gemt. Eksportér din kladde, og genindlæs før du fortsætter.':result.error||'Udgivelsen mislykkedes.');
    window.SR_SHA=result.sha;localStorage.removeItem(window.SR_DRAFT_KEY);
    status.textContent='Gemt i GitHub. Den offentlige side opdateres, når udgivelsen er færdig.';
   }catch(e){status.textContent=e.message;}finally{publish.disabled=false;}
  });
 }
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.append(input);
 button('Importér noter',()=>input.click());
 input.onchange=async()=>{
  const file=input.files[0];if(!file)return;
  try{
   if(!noteNavigationAllowed())return;
   const data=validatePresentationDocument(JSON.parse(await file.text()));
   const incoming=data.notes,pins=data.speedPins;
   if(incoming.some(n=>!n||!Number.isFinite(n.time)||typeof n.text!=='string'))throw Error('Filen indeholder ikke gyldige noter.');
   if(notes.length&&!confirm('Erstat den aktuelle kladde med noterne fra filen? Eksportér først, hvis du vil beholde begge.'))return;
   status.textContent='Importerer noter og billeder …';
   for(const note of incoming){
    if(note.image?.dataUrl){
     const blob=await fetch(note.image.dataUrl).then(r=>r.blob());
     const response=await fetch((config.apiBase||'')+'/api/event-images',{method:'POST',headers:{'Content-Type':blob.type},body:blob});
     const saved=await response.json();if(!response.ok)throw Error(saved.error||'Billedet kunne ikke importeres.');
     note.image={...note.image,...saved};delete note.image.dataUrl;
    }else if(note.image?.url){note.image.url=note.image.url.replace(/^\//,'');}
   }
   if(!persistNotes(incoming))throw Error('Noterne kunne ikke gemmes.');
   SRStorage.setItem('sr2026-speed-pins',JSON.stringify(pins));
   notes=chronologicalNotes(incoming);speedPins=pins;activePresentationNote=null;finishNoteEditing();showNotes();updateTimeline();render();
   status.textContent=config.admin?'Importeret til kladden. Klik Udgiv for at offentliggøre.':'Noter og fart-pins er importeret.';
  }catch(e){status.textContent=e.message;}finally{input.value='';}
 };
})();
