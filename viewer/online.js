function presentationJSON(){return JSON.stringify({version:1,notes,speedPins});}

async function eventSetRequest(path,request){
 const response=await fetch(eventServiceURL(path),{cache:'no-store',...request});
 const result=await response.json().catch(()=>null);
 if(!response.ok||result===null){
  const error=new SRMessageError(result?.error||'Eventsættet kunne ikke hentes eller gemmes.');
  error.status=response.status;
  throw error;
 }
 return result;
}

function githubEventLogin(cancelButton){
 const attempt=crypto.randomUUID();
 const url=new URL(eventLoginURL(attempt),location.href);
 return new Promise((resolve,reject)=>{
  const popup=window.open('about:blank','_blank','popup,width=600,height=740');
  if(!popup){reject(new SRMessageError('Tillad loginvinduet, og prøv igen.'));return;}
  const channel=new BroadcastChannel('sr-event-login:'+attempt);
  const cancelled=()=>finish(new SRMessageError('GitHub-login blev afbrudt.'));
  function finish(error){
   clearTimeout(timer);channel.close();cancelButton.hidden=true;cancelButton.onclick=null;
   if(error){popup.close();reject(error);}
   else resolve();
  }
  const timer=setTimeout(cancelled,10*60*1000);
  channel.onmessage=event=>event.data==='ok'?finish():cancelled();
  cancelButton.hidden=false;cancelButton.onclick=cancelled;
  popup.opener=null;
  popup.location.replace(url.href);
 });
}

function legacyEventSetDraft(source){
 const account=window.SR_ACCOUNT;
 const keys=account?['sr2026-draft:github:'+account.id,'sr2026-draft:admin:']:['sr2026-draft:admin:'];
 for(const key of keys){
  if(eventStorage.getItem(eventSetDraftKey(source)+':migrated'))return null;
  const legacy=JSON.parse(eventStorage.getItem(key)??'null');
  if(!legacy)continue;
  const document=validatePresentationDocument(legacy.document);
  if(source==='public:default'){
   return {revision:legacy.sha,document:{...document,notes:document.notes.filter(note=>note.private!==true)}};
  }
  if(source==='private:'+account?.id&&key===keys[0]){
   const privateNotes=document.notes.filter(note=>note.private===true);
   if(privateNotes.length)return {revision:legacy.privateRevision??null,document:{version:1,notes:privateNotes,speedPins:[]}};
  }
 }
 return null;
}

function activateEventSet(source,revision,document){
 const nextNotes=chronologicalNotes(structuredClone(document.notes));
 if(!finishInlineTextEditing())finishInlineTextEditing(true);
 newEventDraft=null;
 stopPlayback();hideMapEventImage();hideEventVideo();
 leaveOpenedEvent();activePresentationNote=null;editingNote=null;
 eventSetSource=source;eventSetRevision=revision;eventSetDocument=document;
 notes=nextNotes;speedPins=structuredClone(document.speedPins);viewingSpeedPins=null;
 activePresentationNote=currentMapEvent();
 refreshEditedEvent();
}

async function readServerEventSet(source){
 const privateSet=source==='private';
 const result=await eventSetRequest(privateSet?privateEventSetAPI('/api/private-events'):publicEventSetAPI(source.slice(7)));
 if(Object.hasOwn(result,'account'))window.SR_ACCOUNT=result.account;
 return {revision:privateSet?result.revision:result.sha,document:validatePresentationDocument(result.document)};
}

async function prepareEventSetImage(note,isPrivate){
 const image=note.image;
 if(!image||(!image.draft&&privateEventImage(image)===isPrivate))return;
 let blob;
 if(image.draft)blob=await readDraftImage(image);
 else {
  const response=await fetch(await eventImageSource(image));
  if(!response.ok)throw new SRMessageError('Billedet kunne ikke hentes fra serveren.');
  blob=await response.blob();
 }
 const saved=await sendEventImage(blob,image.id,isPrivate);
 note.image={...image,...saved};
 delete note.image.draft;
}

async function writeServerEventSet(source,revision,document){
 const isPrivate=source==='private';
 const snapshot=structuredClone(document);
 for(const note of snapshot.notes)await prepareEventSetImage(note,isPrivate);
 const result=await eventSetRequest(isPrivate?privateEventSetAPI('/api/private-events'):publicEventSetAPI(source.slice(7)),{
  method:'PUT',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(isPrivate?{revision,document:snapshot}:{sha:revision,document:snapshot})
 });
 return {revision:isPrivate?result.revision:result.sha,document:snapshot};
}

function recordEventSetSave(source,sent,saved){
 const current=JSON.parse(presentationJSON());
 const savedImages=new Map();
 for(const [index,note] of sent.notes.entries()){
  const image=saved.document.notes[index].image;
  if(note.image&&image)savedImages.set(JSON.stringify(note.image),image);
 }
 for(const note of notes){
  const savedImage=savedImages.get(JSON.stringify(note.image));
  if(savedImage)note.image=savedImage;
 }
 const key=eventSetDraftKey(source);
 const changed=JSON.stringify(current)!==JSON.stringify(sent);
 eventSetRevision=saved.revision;eventSetDocument=JSON.parse(presentationJSON());
 if(changed)eventStorage.setItem(key,JSON.stringify({revision:saved.revision,document:eventSetDocument}));
 else eventStorage.removeItem(key);
 refreshPresentationEvents();
 return changed;
}

function initializeOnlineEvents(){
 if(window.SR_RHUMBLINE_SETUP)return;
 const controls=$('eventSetControls'),select=$('eventSetSelect'),status=$('onlineStatus');
 const savePrivate=$('savePrivateEvents'),publish=$('publishPublicEvents'),logout=$('eventSetLogout');
 const reloadSet=$('loadServerEventSet'),recover=$('downloadPreviousEventDraft'),cancelLogin=$('cancelEventLogin');
 const target=$('publicEventTarget'),targetLabel=$('publicEventTargetLabel'),service=eventServiceAvailable();
 const publicSources=service?publicEventSets():[];
 const sources=new Map([[localEventSource,{title:'Lokale'}],...publicSources.map(set=>['public:'+set.id,set])]);
 if(service)sources.set('private',{title:'Mine private'});
 let busy=false,publicTarget='public:default';
 const message=(key,...values)=>srBind(status,'textContent',()=>key?srText(key,...values):'');
 const selectedSource=()=>eventSetSource.startsWith('private:')?'private':eventSetSource;
 function updateActions(){
  select.value=selectedSource();select.disabled=busy;
  $('newEvent').disabled=busy;
  logout.hidden=!window.SR_ACCOUNT;logout.disabled=busy;
  publish.hidden=!service||window.SR_ACCOUNT?.canPublish===false;
  savePrivate.hidden=!service;publish.disabled=savePrivate.disabled=busy;
  targetLabel.hidden=target.hidden=publicSources.length<2||selectedSource().startsWith('public:')||publish.hidden;
  target.value=publicTarget;target.disabled=busy;
  recover.hidden=selectedSource()===localEventSource||!eventStorage.getItem(eventSetDraftKey(eventSetSource)+':previous');
  recover.disabled=busy;
  reloadSet.hidden=selectedSource()===localEventSource;reloadSet.disabled=busy;
 }
 function updateSourceOptions(){
  select.replaceChildren(...Array.from(sources,([value,set])=>new Option(value==='public:default'?srText('Offentlige'):
   value.startsWith('public:')?srText('Offentlige · {0}',set.title):srText(set.title),value)));
  target.replaceChildren(...Array.from(sources,([value,set])=>({value,set})).filter(({value})=>value.startsWith('public:'))
   .map(({value,set})=>new Option(srText(set.title),value)));
  updateActions();
 }
 target.onchange=()=>{publicTarget=target.value;};
 async function run(action){
  if(busy)return;
  busy=true;updateActions();
  try{await action();}
  catch(error){
   if(error.status===401||error.status===403&&selectedSource()==='private'){
    window.SR_ACCOUNT=null;
    if(selectedSource()==='private')activateEventSet(localEventSource,null,readLocalEventSet());
   }
   srBind(status,'textContent',()=>error.status===409?
    srText('Serverens eventsæt er ændret. Din kladde er stadig gemt.'):srErrorText(error));
  }
  finally{busy=false;updateActions();}
 }
 async function ensureAccount(){
  if(window.SR_ACCOUNT)return;
  await githubEventLogin(cancelLogin);
  const session=await eventSetRequest('/api/event-session');
  window.SR_ACCOUNT=session.account;
  if(!window.SR_ACCOUNT)throw new SRMessageError('GitHub-login kunne ikke gennemføres. Prøv igen.');
 }
 async function load(source,{discard=false,initial=false}={}){
  if(source===localEventSource){
   activateEventSet(source,null,readLocalEventSet());
   message('');return;
  }
  let key=source;
  if(source==='private'){
   await ensureAccount();
   key='private:'+window.SR_ACCOUNT.id;
  }
  const remote=await readServerEventSet(source);
  const storageKey=eventSetDraftKey(key);
  const draftBeforeReload=eventStorage.getItem(storageKey);
  const draft=discard?null:JSON.parse(draftBeforeReload??'null')??legacyEventSetDraft(key);
  const document=draft?validatePresentationDocument(draft.document):remote.document;
  if(!canLeaveEventSet())return;
  if(draft)eventStorage.setItem(storageKey,JSON.stringify(draft));
  eventStorage.setItem(storageKey+':migrated','1');
  if(discard){
   if(draftBeforeReload)eventStorage.setItem(storageKey+':previous',draftBeforeReload);
   eventStorage.removeItem(storageKey);
  }
  activateEventSet(key,draft?draft.revision:remote.revision,document);
  if(initial&&notes.length)showPresentationEvent(0,{expandPanel:false});
  if(source.startsWith('public:'))publicTarget=source;
  const conflict=!!draft&&draft.revision!==remote.revision;
  message(conflict?'Serverens eventsæt er ændret. Din kladde er stadig gemt.':draft?'Din lokale kladde er gendannet.':'');
 }
 function canLeaveEventSet(){
  if(eventImageUploads.size){message('Vent, mens billeder klargøres.');return false;}
  return noteNavigationAllowed();
 }
 select.onchange=()=>{
  const requested=select.value;select.value=selectedSource();
  if(requested!==selectedSource()&&canLeaveEventSet())run(()=>load(requested));
 };
 reloadSet.onclick=()=>{
  if(!canLeaveEventSet())return;
  const draft=eventStorage.getItem(eventSetDraftKey(eventSetSource));
  if(!draft||confirm(srText('Hent serverversionen? Din kladde kan bagefter hentes under Præsentation.')))
   run(()=>load(selectedSource(),{discard:true}));
 };
 recover.onclick=()=>run(async()=>{
  const prior=JSON.parse(eventStorage.getItem(eventSetDraftKey(eventSetSource)+':previous'));
  const document=await embedEventImages(prior.document);
  download(new Blob([JSON.stringify(document,null,2)],{type:'application/json'}),window.SR_EVENT.id+'-tidligere-kladde.json');
 });
 logout.onclick=()=>{
  if(!canLeaveEventSet())return;
  run(async()=>{
   await eventSetRequest('/api/logout',{method:'POST'});
   window.SR_ACCOUNT=null;
   if(selectedSource()==='private')activateEventSet(localEventSource,null,readLocalEventSet());
   message('Du er logget ud.');
  });
 };

 async function save(destination){
  if(eventImageUploads.size){message('Vent, mens billeder klargøres.');return;}
  if(newEventDraft){message('Opret eventet i kladden, før du gemmer på serveren.');return;}
  if(!finishInlineTextEditing())return;
  const editingSource=selectedSource();
  const sameSet=editingSource===destination;
  const note=currentMapEvent()||activePresentationNote;
  if(!sameSet&&!note){message('Vælg et event, du vil gemme.');return;}
  const snapshot=sameSet?JSON.parse(presentationJSON()):structuredClone(note);
  if(!sameSet&&destination!=='private'&&!confirm(srText('Udgiv en offentlig kopi af det valgte event med dets billede?')))return;
  await run(async()=>{
   await ensureAccount();
   const isPrivate=destination==='private';
   if(isPrivate&&!window.SR_ACCOUNT.privateAvailable)throw new SRMessageError('Lageret til private events er ikke konfigureret.');
   if(!isPrivate&&!window.SR_ACCOUNT.canPublish)throw new SRMessageError('Du skal have skriverettighed til repositoryet.');
   const source=eventSetSource;
   if(source.startsWith('private:')&&source!=='private:'+window.SR_ACCOUNT.id)
    throw new SRMessageError('Log ind med den konto, der ejer disse private events.');
   let revision=eventSetRevision;
   let document=snapshot;
   if(!sameSet){
    const remote=await readServerEventSet(destination);
    if(!window.SR_ACCOUNT)throw Object.assign(new SRMessageError('Log ind med GitHub igen.'),{status:401});
    if(source.startsWith('private:')&&source!=='private:'+window.SR_ACCOUNT.id)
     throw Object.assign(new SRMessageError('Log ind med den konto, der ejer disse private events.'),{status:403});
    revision=remote.revision;
    if(isPrivate){
     snapshot.private=true;snapshot.privateId=crypto.randomUUID();
    }else{
     delete snapshot.private;delete snapshot.privateId;
    }
    document={...remote.document,notes:[...remote.document.notes,snapshot].sort((a,b)=>a.time-b.time)};
   }
   if(isPrivate)document={...document,speedPins:[]};
   const saved=await writeServerEventSet(destination,revision,document);
   const changed=sameSet&&recordEventSetSave(source,document,saved);
   message(changed?'Gemt. Nyere ændringer ligger i kladden.':isPrivate?(sameSet?'Private events er gemt.':'Privat kopi er gemt.'):'Det offentlige eventsæt er gemt.');
  });
 }
 savePrivate.onclick=()=>save('private');
 publish.onclick=()=>save(publicTarget);
 controls.hidden=!service;
 if(service){updateSourceOptions();srOnLanguageChange(updateSourceOptions);run(()=>load(publicTarget,{initial:true}));}
 else if(notes.length)showPresentationEvent(0,{expandPanel:false});

 if(window.SR_READONLY)return;
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.append(input);
 const importButton=document.createElement('button');importButton.type='button';
 srBind(importButton,'textContent',()=>srText('Importér noter'));document.querySelector('.editor-actions').append(importButton);
 importButton.onclick=()=>{input.value='';input.click();};
 input.onchange=()=>{
  const file=input.files[0];
  if(!file||!canLeaveEventSet())return;
  input.value='';
  run(async()=>{
   const document=validatePresentationDocument(JSON.parse(await file.text()));
   if(document.notes.some(note=>!note||!Number.isFinite(note.time)||typeof note.text!=='string'))
    throw new SRMessageError('Filen indeholder ikke gyldige noter.');
   if(readLocalEventSet().notes.length&&!confirm(srText('Erstat den aktuelle kladde med noterne fra filen? Eksportér først, hvis du vil beholde begge.')))return;
   for(const note of document.notes){
    if(note.image?.dataUrl){
     const blob=await fetch(note.image.dataUrl).then(response=>response.blob());
     note.image={...note.image,...await saveEventImage(blob)};delete note.image.dataUrl;
    }else if(note.image&&privateEventImage(note.image)){
     throw new SRMessageError('Eksportér det private event med dets billede, før du importerer det.');
    }else if(note.image?.url)note.image.url=note.image.url.replace(/^\//,'');
   }
   if(!canLeaveEventSet())return;
   eventStorage.setItem(localEventSetKey,JSON.stringify(document));
   activateEventSet(localEventSource,null,document);
   message('Noter og fart-pins er importeret.');
  });
 };
}
