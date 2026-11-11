let inlineTextSession=null;
function beginInlineTextEditing(){
 if(inlineTextSession||document.body.classList.contains('presenting')||eventImageLoading)return;
 const note=editableSettingsEvent();
 const mode=pendingEventImage||hasPendingEventVideo()?'new':'saved';
 if(mode==='saved'&&!note)return;
 const text=mode==='saved'?eventDraft.text:$('note').value;
 inlineTextSession={mode,note,originalText:text};stopPlayback();
 $('eventText').hidden=true;$('eventTextEditor').hidden=false;
 $('eventTextEditor').value=text;$('inlineTextStatus').textContent='';
 resizeInlineTextEditor();$('eventTextEditor').focus();
 $('eventTextEditor').setSelectionRange(text.length,text.length);
}
function resizeInlineTextEditor(){
 const editor=$('eventTextEditor');editor.style.height='auto';editor.style.height=Math.min(450,Math.max(90,editor.scrollHeight+2))+'px';
}
function finishInlineTextEditing(cancel=false){
 if(!inlineTextSession)return true;
 const session=inlineTextSession,text=$('eventTextEditor').value;
 if(session.mode==='saved'&&!cancel){
  const trimmed=text.trim();
  if(!trimmed&&!eventDraft.image&&!validatedEventVideo(eventDraft.video)){
   $('inlineTextStatus').textContent='Skriv en tekst. Escape annullerer redigeringen.';return false;
  }
  if(trimmed!==eventDraft.text){
   if(!stageEventChanges(session.note,{text:trimmed})){
    $('inlineTextStatus').textContent='Teksten kunne ikke gemmes. Prøv igen, eller tryk Escape for at annullere.';return false;
   }
   if(editingNote===session.note)$('note').value=trimmed;
  }
 }else if(session.mode!=='saved')$('note').value=cancel?session.originalText:text;
 inlineTextSession=null;$('eventTextEditor').hidden=true;$('eventText').hidden=false;
 $('inlineTextStatus').textContent='';
 renderAnnotations();return true;
}
$('eventText').onclick=beginInlineTextEditing;
$('eventText').onkeydown=event=>{
 if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();beginInlineTextEditing();}
};
$('eventTextEditor').oninput=()=>{
 if(inlineTextSession?.mode!=='saved'){$('note').value=$('eventTextEditor').value;renderAnnotations();}
 resizeInlineTextEditor();
};
$('eventTextEditor').onblur=()=>{
 if(!finishInlineTextEditing())queueMicrotask(()=>{if(inlineTextSession)$('eventTextEditor').focus({preventScroll:true});});
};
$('eventTextEditor').onkeydown=event=>{
 if(event.key==='Escape'){
  event.preventDefault();event.stopPropagation();finishInlineTextEditing(true);$('eventText').focus();
 }else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){
  event.preventDefault();event.stopPropagation();if(finishInlineTextEditing())$('eventText').focus();
 }
};
