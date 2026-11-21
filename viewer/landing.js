(async()=>{
 const status=document.getElementById('landingStatus'),cards=document.getElementById('eventCards');
 try{
  const catalog=await loadEventCatalog(),query=new URLSearchParams(location.search),legacy=query.get('event');
  // Explicit redirects keep previously shared query links usable.
  if(legacy){
   if(!catalog.events.some(event=>event.id===legacy))throw new SRMessageError('Ukendt stævne: {0}',legacy);
   query.delete('event');const target=eventURL(legacy);target.search=query.toString();location.replace(target.href);return;
  }
  for(const event of catalog.events){
   const card=document.createElement('a');card.className='event-card';
   const title=document.createElement('h2');title.textContent=event.title;
   const description=document.createElement('p');srBind(description,'textContent',()=>srText(event.description));
   const action=document.createElement('span');srBind(action,'textContent',()=>srText('Åbn tracker →'));
   const syncLink=()=>{card.href=eventURL(event.id).href;};
   syncLink();srOnLanguageChange(syncLink);
   card.append(title,description,action);cards.append(card);
  }
  status.hidden=true;
 }catch(error){srBind(status,'textContent',()=>srErrorText(error));status.setAttribute('role','alert');}
 finally{cards.setAttribute('aria-busy','false');}
})();
