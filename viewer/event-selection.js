// One selected stævne per page; a reload releases the previous GPU resources.
let eventStorage;
async function loadEventSelection(){
 const get=async file=>{const r=await fetch(file,{cache:'no-store'});if(!r.ok)throw Error('Stævnedata kunne ikke hentes: '+file+' ('+r.status+').');return r.json();};
 const catalog=await get('events/catalog.json'),id=new URLSearchParams(location.search).get('event')||catalog.default;
 if(catalog.version!==1||!catalog.events.some(event=>event.id===id)||!/^[a-z0-9-]+$/.test(id))throw Error('Ukendt stævne: '+id);
 const event=await get('events/'+id+'/event.json');
 if(event.version!==1||event.id!==id||!Object.keys(event.courses||{}).length||event.profileRoot!=='events/'+id+'/track-profiles/')throw Error('Ugyldig stævnekonfiguration.');
 window.SR_EVENT=event;
 const prefix='sr-event:'+id+':';
 // Explicit one-time migration preserves existing Sjælland Rundt browser data.
 if(id==='sjaelland-rundt-2026'&&!localStorage.getItem(prefix+'migrated')){
  for(const key of Object.keys(localStorage))if(key.startsWith('sr2026-')&&localStorage.getItem(prefix+key)===null)localStorage.setItem(prefix+key,localStorage.getItem(key));
  localStorage.setItem(prefix+'migrated','1');
 }
 eventStorage={getItem:key=>localStorage.getItem(prefix+key),setItem:(key,value)=>localStorage.setItem(prefix+key,value),removeItem:key=>localStorage.removeItem(prefix+key)};
 const select=document.getElementById('eventSelect');
 select.replaceChildren(...catalog.events.map(item=>new Option(item.title,item.id)));select.value=id;
 select.onchange=()=>{
  const next=select.value;select.value=id;if(next===id)return;
  const url=new URL(location.href);url.searchParams.set('event',next);url.searchParams.delete('course');
  const navigate=()=>{location.href=url.href;};
  if(!noteNavigationAllowed(navigate))return;navigate();
 };
 document.title=event.title+' · tracker';
 document.getElementById('mapHeading').title=event.title;
 document.getElementById('reset').textContent='Vis hele banen';
}
function eventAPI(path){return path+'?event='+encodeURIComponent(window.SR_EVENT.id);}
