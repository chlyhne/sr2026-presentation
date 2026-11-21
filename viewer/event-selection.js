// All event-specific behaviour and metadata live in the event registry.
let eventStorage;
function eventURL(id){return srLanguageURL('events/'+encodeURIComponent(id)+'/');}
async function loadEventCatalog(){
 const response=await fetch('events/catalog.json',{cache:'no-store'});
 if(!response.ok)throw new SRMessageError('Stævnekonfiguration kunne ikke hentes ({0}).',response.status);
 const catalog=await response.json(),ids=new Set();
 if(catalog.version!==1||!Array.isArray(catalog.events)||!catalog.events.length)throw new SRMessageError('Ugyldig stævnekonfiguration.');
 for(const event of catalog.events){
  if(!/^[a-z0-9-]+$/.test(event.id)||ids.has(event.id)||!event.title||!Object.keys(event.courses||{}).length
   ||event.profileRoot!=='events/'+event.id+'/track-profiles/'||!event.boatStyle||!event.nameDisplay||!event.routeEditor||!event.storage||!event.layers)throw new SRMessageError('Ugyldig stævnekonfiguration.');
  ids.add(event.id);
 }
 return catalog;
}
async function loadEventBridgeFeatures(catalog,id){
 const layer=catalog.mapLayers?.bridges,groups=layer?.events?.[id];
 if(typeof layer?.file!=='string'||!Array.isArray(groups))throw Error(srText('Bro-konfiguration mangler for ')+id+'.');
 const response=await fetch(layer.file);
 if(!response.ok)throw new SRMessageError('Brogeometri kunne ikke hentes ({0}).',response.status);
 const collection=await response.json();
 if(collection.type!=='FeatureCollection'||!Array.isArray(collection.features))throw new SRMessageError('Ugyldig brogeometri.');
 const found=new Set();
 const features=collection.features.filter(feature=>groups.includes(feature.properties?.bridge));
 for(const feature of features){
  const geometry=feature.geometry,isSupport=['support','deck'].includes(feature.properties.source_kind);
  const rings=isSupport?geometry?.coordinates:[geometry?.coordinates];
  if(geometry?.type!==(isSupport?'Polygon':'LineString')||!Array.isArray(rings)||!rings.length||rings.some(ring=>!Array.isArray(ring)||ring.length<(isSupport?4:2)||ring.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>=85)
   ||isSupport&&(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])))throw new SRMessageError('Ugyldig brogeometri.');
  if(!isSupport)found.add(feature.properties.bridge);
 }
 if(groups.some(group=>!found.has(group)))throw new SRMessageError('En konfigureret bro mangler geometri.');
 return features;
}
async function loadEventSelection(){
 const catalog=await loadEventCatalog(),id=document.documentElement.dataset.eventId;
 const event=catalog.events.find(event=>event.id===id);
 if(!event)throw new SRMessageError('Ukendt stævne: {0}',id);
 const weather=catalog.weather?.[id]??null;
 if(weather&&(!['DMI','OPERA'].includes(weather.radar)||
   (weather.embedded===true?weather.file!==undefined:weather.file!==`weather/${id}/manifest.json`)))
  throw new SRMessageError('Ugyldig vejrkonfiguration for {0}.',id);
 // Weather and country metadata are prepared separately from the track files.
 window.SR_EVENT={...event,weather,boatCountryFile:catalog.boatCountries?.[id],features:{...event.features,weather:!!weather}};
 window.SR_BRIDGE_FEATURES=await loadEventBridgeFeatures(catalog,id);
 const prefix='sr-event:'+id+':',legacy=event.storage.legacyPrefix;
 if(legacy&&!localStorage.getItem(prefix+'migrated')){
  for(const key of Object.keys(localStorage))if(key.startsWith(legacy)&&localStorage.getItem(prefix+key)===null)localStorage.setItem(prefix+key,localStorage.getItem(key));
  localStorage.setItem(prefix+'migrated','1');
 }
 // The draft key is stable across URL changes; preserve drafts from old links.
 for(const path of new Set([new URL(document.baseURI).pathname,event.storage.legacyAdminPath].filter(Boolean))){
  const old=prefix+'sr2026-draft:'+path+':',next=prefix+'sr2026-draft:admin:';
  for(const key of Object.keys(localStorage))if(key.startsWith(old)&&localStorage.getItem(next+key.slice(old.length))===null)localStorage.setItem(next+key.slice(old.length),localStorage.getItem(key));
 }
 eventStorage={getItem:key=>localStorage.getItem(prefix+key),setItem:(key,value)=>localStorage.setItem(prefix+key,value),removeItem:key=>localStorage.removeItem(prefix+key)};
 const select=document.getElementById('eventSelect');
 select.replaceChildren(...catalog.events.map(item=>new Option(item.title,item.id)));select.value=id;
 select.onchange=()=>{
  const next=select.value;select.value=id;if(next===id)return;
  const navigate=()=>{location.href=eventURL(next).href;};
  if(!noteNavigationAllowed(navigate))return;navigate();
 };
 function updateEventLinks(){
  document.title=event.title+' · '+srText('Sejltracker');
  document.querySelector('.all-events').href=srLanguageURL('./');
 }
 updateEventLinks();srOnLanguageChange(updateEventLinks);
 document.getElementById('mapHeading').title=event.title;
}
function eventAPI(path){return path+'?event='+encodeURIComponent(window.SR_EVENT.id);}
function eventLoginURL(){return window.SR_CONFIG.apiBase+eventAPI('/auth/login')+'&lang='+srLanguage;}
