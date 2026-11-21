function presentationJSON(){
 return JSON.stringify({version:1,notes,speedPins,title:currentEventSetData().title});
}

async function eventSetRequest(path,request){
 const response=await fetch(path,{cache:'no-store',...request});
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

function managedEventSetPath(path,id){
 return eventAPI(path)+(id?'&set='+encodeURIComponent(id):'');
}
function eventSetSourceFor(id){return 'set:'+id;}
function emptyEventSet(){return {version:1,notes:[],speedPins:[]};}
function readEventSetDraft(source){
 return JSON.parse(eventStorage.getItem(eventSetDraftKey(source))??'null');
}

function activateEventSet(source,revision,document,metadata){
 const next=chronologicalNotes(structuredClone(document.notes));
 stopPlayback();hideMapEventImage();hideEventVideo();
 leaveOpenedEvent();activePresentationNote=null;
 eventSetSource=source;eventSetRevision=revision;eventSetDocument=document;eventSetMetadata=metadata;
 notes=next;speedPins=structuredClone(document.speedPins);viewingSpeedPins=null;
 activePresentationNote=currentMapEvent();
 refreshEditedEvent();
}

async function prepareEventSetImage(note,setId,remote){
 const image=note.image;
 if(!image||!image.draft&&!privateEventImage(image)&&(remote||image.url.startsWith('set-event-images/')))return;
 let blob;
 if(image.draft)blob=await readDraftImage(image);
 else {
  const response=await fetch(await eventImageSource(image));
  if(!response.ok)throw new SRMessageError('Billedet kunne ikke hentes fra serveren.');
  blob=await response.blob();
 }
 const saved=await sendEventImage(blob,image.id,setId);
 note.image={...image,...saved};
 delete note.image.draft;
}

let syncActiveEventSet=()=>{};
function initializeOnlineEvents(){
 if(window.SR_RHUMBLINE_SETUP)return;
 const service=eventServiceAvailable(),hosted=!window.SR_CONFIG.local;
 const picker=$('eventSetPicker'),panel=$('eventSetControls'),select=$('eventSetSelect');
 const login=$('eventSetLogin'),logout=$('eventSetLogout'),cancelLogin=$('cancelEventLogin'),status=$('onlineStatus');
 const form=$('eventSetNameForm'),name=$('eventSetName'),visibility=$('eventSetVisibility'),retry=$('retrySaveEventSet');
 const reload=$('loadServerEventSet'),recover=$('downloadPreviousEventDraft');
 const serverSets=new Map();
 const message=(key,...values)=>srBind(status,'textContent',()=>key?srText(key,...values):'');
 const accountId=()=>window.SR_ACCOUNT?.id;
 let saveFailed=false;
 const ownerAllows=draft=>!draft?.owner||draft.owner===accountId();
 const displayTitle=set=>set.title||(set.id==='default'?'Præsentation':'Eventsæt');

 function availableSets(){
  const sets=new Map(serverSets);
  for(const key of eventStorage.keys()){
   if(!/^sr2026-event-set:set:[a-z0-9-]+$/.test(key))continue;
   const source=key.slice('sr2026-event-set:'.length);
   const draft=readEventSetDraft(source);
   if(!draft||!ownerAllows(draft)||sets.has(source))continue;
   if(draft.remote)continue;
   sets.set(source,{id:source.slice(4),title:draft.document.title,visibility:'local'});
  }
  const local=readLocalEventSet();
  sets.set(localEventSource,{title:local.title||srText('Lokale events'),visibility:'local'});
  return sets;
 }
 function updatePicker({formValues=false}={}){
  const available=availableSets(),current=currentEventSetData(),currentTitle=current.title||available.get(eventSetSource)?.title;
  srBind(picker,'textContent',()=>currentTitle||srText('Eventsæt'));
  const groups=[['public','Offentlige eventsæt'],['private','Mine private sæt'],['local','Lokale eventsæt']];
  select.replaceChildren(...groups.flatMap(([scope,label])=>{
   const items=Array.from(available).filter(([,set])=>set.visibility===scope);
   if(!items.length)return [];
   const group=document.createElement('optgroup');group.label=srText(label);
   for(const [source,set] of items)group.append(new Option(source===eventSetSource&&current.title||displayTitle(set),source));
   return [group];
  }));
  select.value=eventSetSource;
  select.disabled=eventSetBusy;
  login.hidden=!service||!!accountId();logout.hidden=!service||!accountId();
  login.disabled=logout.disabled=$('newEventSet').disabled=eventSetBusy;
  form.hidden=false;
  visibility.disabled=eventSetBusy||!service||!window.SR_ACCOUNT?.canPublish||
   eventSetMetadata.remote&&!eventSetMetadata.canSetVisibility;
  name.disabled=$('eventSetNameForm').querySelector('button[type=submit]').disabled=eventSetBusy;
  const draft=readEventSetDraft(eventSetSource);
  retry.hidden=!service||!accountId()||!saveFailed;
  reload.hidden=!service||!eventSetMetadata.remote||!draft;
  const archived=JSON.parse(eventStorage.getItem(eventSetDraftKey(eventSetSource)+':previous')??'null');
  recover.hidden=!archived||!ownerAllows(archived);
  retry.disabled=reload.disabled=recover.disabled=eventSetBusy;
  if(formValues){name.value=current.title||'';visibility.value=eventSetMetadata.visibility;}
  updateEventAction();
 }
 function hidePicker(){
  panel.hidden=true;picker.setAttribute('aria-expanded','false');
 }
 picker.onclick=()=>{
  if(!panel.hidden){hidePicker();return;}
  panel.hidden=false;picker.setAttribute('aria-expanded','true');select.focus();
 };
 document.addEventListener('pointerdown',event=>{
  if(!panel.hidden&&!panel.contains(event.target)&&!picker.contains(event.target))hidePicker();
 });
 panel.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();hidePicker();picker.focus();}
 });
 async function run(action){
  if(eventSetBusy)return;
  eventSetBusy=true;updatePicker();
  try{await action();}
  catch(error){
   if(error.status===401){
    window.SR_ACCOUNT=null;
    for(const [source,set] of serverSets)if(set.visibility==='private')serverSets.delete(source);
    if(eventSetMetadata.owner)activateEventSet(localEventSource,null,readLocalEventSet(),{visibility:'private'});
   }
   srBind(status,'textContent',()=>srErrorText(error));
  }finally{
   eventSetBusy=false;updatePicker({formValues:true});
  }
 }
 async function refreshServerSets(){
  if(!service){
   for(const set of hosted?publicEventSets():[]){
    const source=eventSetSourceFor(set.id);
    serverSets.set(source,{...set,title:set.publishedTitle||set.title,visibility:'public'});
   }
   return;
  }
  const result=await eventSetRequest(managedEventSetPath('/api/event-sets'));
  window.SR_ACCOUNT=result.account;serverSets.clear();
  for(const set of result.sets){
   const seed=publicEventSets().find(item=>item.id===set.id);
   serverSets.set(eventSetSourceFor(set.id),{...set,title:set.title||seed?.publishedTitle||seed?.title});
  }
 }
 async function load(source,{discard=false,initial=false}={}){
  saveFailed=false;
  if(source===localEventSource){
   activateEventSet(source,null,readLocalEventSet(),{visibility:'private'});return;
  }
  const id=source.slice(4),listed=serverSets.get(source),key=eventSetDraftKey(source);
  let draft=readEventSetDraft(source),migrated=false;
  if(!draft&&!eventStorage.getItem(key+':migrated')){
   const oldSource=listed?.visibility==='public'?'public:'+id:id==='legacy-'+accountId()?'private:'+accountId():null;
   if(oldSource){
    draft=readEventSetDraft(oldSource);
    migrated=!!draft;
   }
  }
  if(draft&&!ownerAllows(draft))draft=null;
  const remote=listed?(service?await eventSetRequest(managedEventSetPath('/api/event-sets',id)):
   {document:await readPublishedEventSet(id),visibility:'public',revision:null}):null;
  if(!remote&&!draft)throw new SRMessageError('Eventsættet findes ikke.');
  if(discard&&draft){
   eventStorage.setItem(key+':previous',JSON.stringify(draft));eventStorage.removeItem(key);draft=null;
  }
  const document=validatePresentationDocument(draft?.document??remote.document);
  const metadata={id,visibility:draft?.visibility||remote?.visibility||'private',
   owner:remote?.visibility==='private'?accountId():draft?.owner,
   remote:!!remote,canEdit:remote?.canEdit,canSetVisibility:remote?.canSetVisibility};
  const revision=draft?draft.revision??null:remote.revision;
  if(remote?.title||remote?.document.title)serverSets.get(source).title=remote.document.title||remote.title;
  activateEventSet(source,revision,document,metadata);
  if(draft)writeEventSetDraft(document);
  if(migrated)eventStorage.setItem(key+':migrated','1');
  if(initial&&notes.length)showPresentationEvent(0,{expandPanel:false});
  if(draft&&remote&&revision!==remote.revision)message('Serverens eventsæt er ændret. Din kladde er stadig gemt.');
  else message(draft?'Din lokale kladde er gendannet.':'');
 }
 function canLeave(){
  if(eventImageUploads.size){message('Vent, mens billeder klargøres.');return false;}
  return noteNavigationAllowed();
 }
 select.onchange=()=>{
  const source=select.value;select.value=eventSetSource;
  if(!source||source===eventSetSource||!canLeave())return;
  hidePicker();run(()=>load(source));
 };

 async function saveActive(){
  if(!service||!accountId()){
   message('Gemt lokalt.');return;
  }
  if(eventSetMetadata.owner&&eventSetMetadata.owner!==accountId())
   throw new SRMessageError('Log ind med den konto, der ejer disse private events.');
  if(eventSetMetadata.remote&&!serverSets.get(eventSetSource)?.canEdit){
   message('Gemt lokalt.');return;
  }
  const legacyIdKey='sr2026-local-set-server-id';
  const id=eventSetMetadata.id||eventStorage.getItem(legacyIdKey)||crypto.randomUUID();
  if(!eventSetMetadata.id)eventStorage.setItem(legacyIdKey,id);
  const source=eventSetSourceFor(id);
  const document=JSON.parse(presentationJSON()),previousSource=eventSetSource;
  for(const note of document.notes){
   delete note.private;delete note.privateId;
  }

  for(const note of document.notes)await prepareEventSetImage(note,id,eventSetMetadata.remote);
  const result=await eventSetRequest(managedEventSetPath('/api/event-sets',id),{
   method:'PUT',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({revision:eventSetRevision,visibility:eventSetMetadata.visibility,document})
  });
  for(const [index,note] of notes.entries()){
   if(document.notes[index].image)note.image=document.notes[index].image;
   delete note.private;delete note.privateId;
  }
  eventSetSource=source;eventSetRevision=result.revision;eventSetDocument=document;
  eventSetMetadata={id,visibility:result.visibility,owner:result.visibility==='private'?accountId():null,
   remote:true,canEdit:result.canEdit,canSetVisibility:result.canSetVisibility};
  serverSets.set(source,{...result,title:document.title||result.title||serverSets.get(source)?.title});
  if(previousSource===localEventSource){
   eventStorage.setItem(localEventSetKey,JSON.stringify(emptyEventSet()));eventStorage.removeItem(legacyIdKey);
  }
  else eventStorage.removeItem(eventSetDraftKey(previousSource));
  refreshPresentationEvents();
  message('Gemt på serveren.');
 }
 async function saveOrKeepDraft(){
  saveFailed=false;
  try{await saveActive();}
  catch(error){saveFailed=true;throw error;}
 }
 syncActiveEventSet=()=>run(saveOrKeepDraft);
 retry.onclick=()=>syncActiveEventSet();
 form.onsubmit=event=>{
  event.preventDefault();if(eventSetBusy)return;
  const title=name.value.trim(),nextVisibility=visibility.disabled?eventSetMetadata.visibility:visibility.value;
  return run(async()=>{
   const document=validatePresentationDocument({...currentEventSetData(),title});
   if(document.title===currentEventSetData().title&&nextVisibility===eventSetMetadata.visibility)return;
   const before=eventSetMetadata;
   eventSetMetadata={...before,visibility:nextVisibility};
   try{writeEventSetDraft(document);}
   catch(error){eventSetMetadata=before;throw error;}
   await saveOrKeepDraft();
  });
 };
 const dialog=$('newEventSetDialog'),newName=$('newEventSetName');
 $('newEventSet').onclick=()=>{
  if(eventSetBusy||!canLeave())return;
  newName.value='';dialog.showModal();newName.focus();
 };
 $('cancelNewEventSet').onclick=()=>dialog.close();
 $('newEventSetForm').onsubmit=event=>{
  event.preventDefault();if(eventSetBusy)return;
  return run(async()=>{
   const document=validatePresentationDocument({...emptyEventSet(),title:newName.value.trim()});
   const id=crypto.randomUUID();
   activateEventSet(eventSetSourceFor(id),null,document,{id,visibility:'private'});
   writeEventSetDraft(document);
   dialog.close();hidePicker();
   await saveOrKeepDraft();
  });
 };
 login.onclick=()=>run(async()=>{
  await githubEventLogin(cancelLogin);
  await refreshServerSets();
  if(!accountId())throw new SRMessageError('GitHub-login kunne ikke gennemføres. Prøv igen.');
  const local=currentEventSetData();
  if(eventSetSource===localEventSource?(local.title||local.notes.length||local.speedPins.length):readEventSetDraft(eventSetSource))
   await saveOrKeepDraft();
 });
 logout.onclick=()=>{
  if(!canLeave())return;
  run(async()=>{
   await eventSetRequest('/api/logout',{method:'POST'});
   window.SR_ACCOUNT=null;
   for(const [source,set] of serverSets)if(set.visibility==='private')serverSets.delete(source);
   if(eventSetMetadata.owner)await load(localEventSource);
   await refreshServerSets();
   message('Du er logget ud.');
  });
 };
 reload.onclick=()=>{
  if(!canLeave()||!confirm(srText('Hent serverversionen? Din kladde kan bagefter hentes under Præsentation.')))return;
  run(()=>load(eventSetSource,{discard:true}));
 };
 recover.onclick=()=>run(async()=>{
  const prior=JSON.parse(eventStorage.getItem(eventSetDraftKey(eventSetSource)+':previous'));
  if(!prior||!ownerAllows(prior))throw new SRMessageError('Eventsættet findes ikke.');
  const document=await embedEventImages(prior.document);
  download(new Blob([JSON.stringify(document,null,2)],{type:'application/json'}),window.SR_EVENT.id+'-tidligere-kladde.json');
 });
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.append(input);
 const importButton=document.createElement('button');importButton.type='button';
 srBind(importButton,'textContent',()=>srText('Importér noter'));document.querySelector('.editor-actions').append(importButton);
 importButton.onclick=()=>{input.value='';input.click();};
 input.onchange=()=>{
  const file=input.files[0];
  if(!file||!canLeave())return;
  run(async()=>{
   const document=validatePresentationDocument(JSON.parse(await file.text()));
   if(document.notes.some(note=>!note||!Number.isFinite(note.time)||typeof note.text!=='string'))
    throw new SRMessageError('Filen indeholder ikke gyldige noter.');
   if(!document.title)document.title=srText('Importerede events');
   for(const note of document.notes){
    if(note.image?.dataUrl){
     const blob=await fetch(note.image.dataUrl).then(response=>response.blob());
     note.image={...note.image,...await saveEventImage(blob)};delete note.image.dataUrl;
    }else if(note.image&&(privateEventImage(note.image)||note.image.url?.startsWith('set-event-images/'))){
     throw new SRMessageError('Eksportér det private event med dets billede, før du importerer det.');
    }else if(note.image?.url)note.image.url=note.image.url.replace(/^\//,'');
   }
   const id=crypto.randomUUID();
   activateEventSet(eventSetSourceFor(id),null,document,{id,visibility:'private'});
   writeEventSetDraft(document);hidePicker();
   await saveOrKeepDraft();
  });
 };
 updatePicker({formValues:true});srOnLanguageChange(()=>updatePicker());
 return run(async()=>{
  await refreshServerSets();
  if(serverSets.size)await load(serverSets.keys().next().value,{initial:true});
  else if(notes.length)showPresentationEvent(0,{expandPanel:false});
 });
}
