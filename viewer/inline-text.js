let inlineTextSession=null;
function beginInlineTextEditing(){
 if(inlineTextSession||!editingNote)return;
 inlineTextSession=editingNote;
 $('eventText').hidden=true;$('eventTextEditor').hidden=false;
 const editor=$('eventTextEditor');editor.value=editingNote.text;
 $('inlineTextStatus').textContent='';
 resizeInlineTextEditor();editor.focus();editor.setSelectionRange(editor.value.length,editor.value.length);
}
function resizeInlineTextEditor(){
 const editor=$('eventTextEditor');editor.style.height='auto';editor.style.height=Math.min(450,Math.max(90,editor.scrollHeight+2))+'px';
}
function finishInlineTextEditing(cancel=false){
 if(!inlineTextSession)return true;
 const target=inlineTextSession,text=$('eventTextEditor').value.trim();
 if(!cancel&&text!==target.text&&!updateEventContent(target,{text})){
  $('inlineTextStatus').textContent=$('annotationStatus').textContent;return false;
 }
 inlineTextSession=null;$('eventTextEditor').hidden=true;$('eventText').hidden=false;
 $('inlineTextStatus').textContent='';
 refreshEditedEvent();return true;
}
$('eventText').onclick=beginInlineTextEditing;
$('eventText').onkeydown=event=>{
 if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();beginInlineTextEditing();}
};
$('eventTextEditor').oninput=()=>{resizeInlineTextEditor();updateEventAction();};
$('eventTextEditor').onkeydown=event=>{
 if(event.key==='Escape'){
  event.preventDefault();event.stopPropagation();cancelEventEdit();
 }else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){
  event.preventDefault();event.stopPropagation();if(eventEditChanged())saveEventEdit();
 }
};
