let pendingEventVideo=null,panelEventVideo=null,panelEventVideoNote=null,eventVideoView=null;
let videoOwnsFullscreen=false,videoOpenToken=0;
let videoBackgroundState=null;
const YOUTUBE_ID=/^[\w-]{11}$/;
function youtubeStartTime(value){
 if(!value)return 0;
 if(/^\d+$/.test(value))return Math.min(2147483647,Number(value));
 const parts=/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
 return parts?Math.min(2147483647,Number(parts[1]||0)*3600+Number(parts[2]||0)*60+Number(parts[3]||0)):0;
}
function youtubeVideo(id,start=0){
 const url=new URL('https://www.youtube.com/watch');url.searchParams.set('v',id);
 if(start)url.searchParams.set('t',String(start));
 return {provider:'youtube',id,start,url:url.href};
}
function parseYouTubeVideo(input){
 const text=input.trim();if(!text)return null;
 const invalid=()=>{throw new Error('Indsæt et gyldigt YouTube-link, fx https://youtu.be/VIDEO_ID.');};
 let url;try{url=new URL(text.includes('://')?text:'https://'+text);}catch{invalid();}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)invalid();
 const host=url.hostname.toLowerCase(),parts=url.pathname.split('/').filter(Boolean);
 let id;
 if(host==='youtu.be'||host==='www.youtu.be')id=parts.length===1?parts[0]:null;
 else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)){
  if(url.pathname==='/watch')id=url.searchParams.get('v');
  else if(['embed','shorts','live'].includes(parts[0])&&parts.length===2)id=parts[1];
 }else if(['youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)&&parts[0]==='embed'&&parts.length===2)id=parts[1];
 if(!YOUTUBE_ID.test(id||''))invalid();
 const start=youtubeStartTime(url.searchParams.get('start')||url.searchParams.get('t')||new URLSearchParams(url.hash.slice(1)).get('t'));
 return youtubeVideo(id,start);
}
function validatedEventVideo(video){
 if(video?.provider!=='youtube'||!YOUTUBE_ID.test(video.id||''))return null;
 const start=Number.isInteger(video.start)&&video.start>=0&&video.start<=2147483647?video.start:0;
 return youtubeVideo(video.id,start);
}
function hasPendingEventVideo(){return !editingNote&&!!$('noteVideo').value.trim();}
function currentAttachedVideo(){return editingNote?editingNote.video:pendingEventVideo;}
function eventNoteLabel(note){return note.text||note.image?.name||(note.video?'YouTube-video':'Billede');}
function setAttachedEventVideo(video){
 if(editingNote)return JSON.stringify(validatedEventVideo(editingNote.video))===JSON.stringify(video)||persistEventChanges(editingNote,{video});
 pendingEventVideo=video;return true;
}
function updateVideoEditor(){
 const input=$('noteVideo');let video=null,error='';
 try{video=parseYouTubeVideo(input.value);}catch(e){error=e.message;}
 input.setCustomValidity(error);input.setAttribute('aria-invalid',String(!!error));
 $('noteVideoStatus').textContent=error||(video?(editingNote?'Videoen gemmes automatisk.':'Video vedhæftet. Gem eventet for at beholde den.'):'');
 $('removeNoteVideo').hidden=!input.value;
 updateImageEditor();return {video,error};
}
function validateEventVideoInput(){
 const result=updateVideoEditor();
 if(result.error){$('noteVideo').focus();$('noteVideo').reportValidity();return false;}
 if(!setAttachedEventVideo(result.video)){$('noteVideoStatus').textContent='Videoen kunne ikke gemmes til eventet.';return false;}
 return true;
}
function clearPendingEventVideo(){
 pendingEventVideo=null;$('noteVideo').value='';updateVideoEditor();
}
$('noteVideo').oninput=()=>{
 const {video,error}=updateVideoEditor();
 if(!error&&!setAttachedEventVideo(video))$('noteVideoStatus').textContent='Videoen kunne ikke gemmes til eventet.';
 updatePresentationControls();
};
$('removeNoteVideo').onclick=()=>{
 $('noteVideo').value='';$('noteVideo').dispatchEvent(new Event('input',{bubbles:true}));
};
function hideEventVideo(){
 const overlay=$('eventVideoOverlay'),wasOpen=!!eventVideoView;
 videoOpenToken++;eventVideoView=null;overlay.hidden=true;
 if(videoBackgroundState){
  for(const [node,inert] of videoBackgroundState)node.inert=inert;
  videoBackgroundState=null;
 }
 $('eventVideoPlayer').replaceChildren();$('eventVideoLink').removeAttribute('href');
 $('eventVideoButton').setAttribute('aria-expanded','false');
 if(videoOwnsFullscreen&&document.fullscreenElement&&overlay.contains(document.fullscreenElement))document.exitFullscreen().catch(()=>{});
 videoOwnsFullscreen=false;
 if(wasOpen&&!$('eventVideoFigure').hidden)$('eventVideoButton').focus({preventScroll:true});
}
function showEventVideo(){
 if(!finishInlineTextEditing()||!panelEventVideo)return;
 if(!document.fullscreenElement&&(!document.fullscreenEnabled||!$('eventVideoOverlay').requestFullscreen)){
  $('eventVideoStatus').textContent='Videoen kræver fuld skærm, men browseren tillader ikke fuld skærm.';return;
 }
 $('eventVideoStatus').textContent='';
 stopPlayback();hideMapEventImage();
 const video=panelEventVideo,overlay=$('eventVideoOverlay'),token=++videoOpenToken;
 eventVideoView={video,note:panelEventVideoNote};overlay.hidden=false;
 if(!videoBackgroundState){
  videoBackgroundState=[...document.querySelectorAll('header,main')].map(node=>[node,node.inert]);
  for(const [node] of videoBackgroundState)node.inert=true;
 }
 $('eventVideoLink').href=video.url;
 const frame=document.createElement('iframe');frame.title='YouTube-video til event';
 const src=new URL('https://www.youtube-nocookie.com/embed/'+video.id);
 src.searchParams.set('autoplay','1');src.searchParams.set('playsinline','1');src.searchParams.set('rel','0');
 if(video.start)src.searchParams.set('start',String(video.start));
 frame.src=src.href;frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';
 frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
 $('eventVideoPlayer').replaceChildren(frame);
 $('eventVideoButton').setAttribute('aria-expanded','true');$('closeEventVideo').focus({preventScroll:true});
 // The click supplies the user gesture for playback and browser fullscreen.
 if(!document.fullscreenElement&&document.fullscreenEnabled&&overlay.requestFullscreen){
  videoOwnsFullscreen=true;
  overlay.requestFullscreen().then(()=>{
   if(token!==videoOpenToken&&!eventVideoView&&document.fullscreenElement===overlay)document.exitFullscreen().catch(()=>{});
  }).catch(error=>{if(token===videoOpenToken){
   videoOwnsFullscreen=false;hideEventVideo();
   $('eventVideoStatus').textContent='Videoen kunne ikke åbnes i fuld skærm: '+(error.message||'Browseren afviste anmodningen.');
  }});
 }
}
function renderEventVideo(value,note){
 const video=validatedEventVideo(value);
 if(panelEventVideoNote!==note||JSON.stringify(panelEventVideo)!==JSON.stringify(video))$('eventVideoStatus').textContent='';
 if(eventVideoView&&(eventVideoView.note!==note||JSON.stringify(eventVideoView.video)!==JSON.stringify(video)))hideEventVideo();
 const previous=panelEventVideo;panelEventVideo=video;panelEventVideoNote=note;
 $('eventVideoFigure').hidden=!video;
 if(!video){$('eventVideoThumbnail').removeAttribute('src');return;}
 if(previous?.id!==video.id)$('eventVideoThumbnail').src=`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
}
$('eventVideoButton').onclick=showEventVideo;
$('closeEventVideo').onclick=hideEventVideo;
document.addEventListener('fullscreenchange',()=>{
 if(videoOwnsFullscreen&&!$('eventVideoOverlay').contains(document.fullscreenElement))hideEventVideo();
});
document.addEventListener('keydown',event=>{
 if(!eventVideoView)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();hideEventVideo();}
 if(event.key==='Tab'){
  const controls=[$('eventVideoLink'),$('closeEventVideo'),$('eventVideoPlayer').querySelector('iframe')].filter(Boolean);
  const index=controls.indexOf(document.activeElement);
  if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1).focus();}
  else if(!event.shiftKey&&index===controls.length-1){event.preventDefault();controls[0].focus();}
 }
},true);
