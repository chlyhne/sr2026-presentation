const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/';
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#onlineStatus'));
  const png=Buffer.from(await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#284d64';ctx.fillRect(0,0,1200,800);
   ctx.fillStyle='#ffce5c';ctx.font='48px sans-serif';ctx.fillText('Billede til event · klik for kort',100,400);
   return canvas.toDataURL('image/png').split(',')[1];
  }),'base64');
  const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
  for(const [i,id] of ids.entries())await page.route('**/event-images/'+id+'.png',async route=>{
   if(i===2)await new Promise(resolve=>setTimeout(resolve,600));
   await route.fulfill({status:i===3?404:200,contentType:'image/png',body:i===3?Buffer.alloc(0):png});
  });
  const fixtures=await page.evaluate(ids=>{
   const settings={...sceneSettings(),wind:false,rain:false,boats:['Mercutio']};
   const image=i=>({id:ids[i],url:'/event-images/'+ids[i]+'.png',name:'Foto '+i,width:1200,height:800});
   return [{time:D.start+3600,text:'Første foto',image:image(0)},
    {time:D.start+7200,text:'Et event uden billede'},
    {time:D.start+10800,text:'Andet foto',image:image(1)},
    {time:D.start+14400,text:'Et andet event med samme billede',image:image(0)},
    {time:D.start+18000,text:'Langsomt foto',image:image(2)},
    {time:D.start+21600,text:'Manglende foto',image:image(3)}]
    .map(n=>({...n,view:[230,250,620,760],settings}));
  },ids);
  await page.evaluate(notes=>{localStorage.setItem('sr2026-notes',JSON.stringify(notes));window.location.reload();},fixtures);
  await page.waitForFunction(()=>document.querySelectorAll('.note-jump').length===6);
  const stored=await page.evaluate(()=>localStorage.getItem('sr2026-notes'));
  async function imageOpen(expected=true){
   if(expected)await page.waitForFunction(()=>$('mapEventImageContent').naturalWidth>0&&!$('mapEventImage').hidden&&!$('mapEventImageContent').hidden);
   assert.equal(await page.locator('#mapEventImage').isVisible(),expected);
   if(expected)assert.equal(await page.locator('#eventImageFigure').isVisible(),false,'A photo is never visible in both places');
   else if(await page.locator('#eventImage').getAttribute('src'))assert.equal(await page.locator('#eventImageFigure').isVisible(),true,'Closing the map photo restores the panel photo');
  }
  async function sameMapBounds(){
   const map=await page.locator('#map').boundingBox(),overlay=await page.locator('#mapEventImage').boundingBox();
   for(const key of ['x','y','width','height'])assert.ok(Math.abs(map[key]-overlay[key])<1,'Image must cover only the map: '+key);
  }
  await page.locator('.note-jump').first().click();await imageOpen();await sameMapBounds();
  assert.equal(await page.locator('#eventImageFigure').isVisible(),false);
  const state=await page.evaluate(()=>({view:[...view],time:currentTime(),settings:sceneSettings()}));
  await page.locator('#mapEventImage').click();await imageOpen(false);
  assert.deepEqual(await page.evaluate(()=>({view:[...view],time:currentTime(),settings:sceneSettings()})),state,'Closing image preserves map scene');
  await page.evaluate(()=>{render();updatePresentationControls();});await imageOpen(false);
  await page.locator('#eventImageButton').click();await imageOpen();
  await page.locator('#mapEventImage').focus();await page.keyboard.press('Enter');await imageOpen(false);
  await page.locator('#nextEvent').click();await imageOpen(false);
  await page.locator('#nextEvent').click();await imageOpen();
  assert.equal(await page.locator('#mapEventImageContent').getAttribute('src'),fixtures[2].image.url);
  await page.locator('#startPresentation').click();await imageOpen();
  await page.keyboard.press('Escape');await imageOpen(false);
  assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('presenting')),true,'Escape closes image before leaving presentation');
  await page.locator('#previousEvent').click();await imageOpen(false);
  await page.keyboard.press('ArrowRight');
  if(await page.evaluate(()=>!!eventPlaybackTarget))await page.keyboard.press('ArrowRight');
  await imageOpen();
  await page.locator('#eventSelect').selectOption('3');await imageOpen();
  assert.equal(await page.evaluate(()=>mapImageView.note===notes[3]),true,'Same image on another event has its own navigation state');
  // Input inside the temporal snap window must not open the large image.
  await page.locator('#eventSelect').selectOption('1');await imageOpen(false);
  await page.evaluate(()=>{
   $('time').value=offsetAtTime(notes[2].time)+Math.min(5,Math.floor(eventSnapWindowSeconds()/2));
   $('time').dispatchEvent(new Event('input',{bubbles:true}));
  });
  assert.equal(await page.evaluate(()=>currentTime()),fixtures[2].time);
  assert.equal(await page.locator('#eventSelect').inputValue(),'2');await imageOpen(false);
  await page.waitForFunction(()=>$('eventImage').naturalWidth>0&&!$('eventImageFigure').hidden);
  await page.locator('#eventImageButton').click();await imageOpen();
  await page.evaluate(()=>seekTimeline(offsetAtTime(notes[2].time)));await imageOpen(false);
  await page.locator('#eventImageButton').click();await imageOpen();
  await page.locator('#next').click();await imageOpen(false);
  await page.locator('#eventSelect').selectOption('2');await imageOpen();
  await page.setViewportSize({width:1100,height:850});await page.waitForTimeout(100);await imageOpen();await sameMapBounds();
  await page.screenshot({path:'/tmp/sr2026-image-overlay-'+type.name()+'-desktop.png'});
  await page.setViewportSize({width:390,height:740});await page.waitForTimeout(100);await imageOpen();await sameMapBounds();
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,bottom:$('presentationFooter').getBoundingClientRect().bottom}));
  assert.ok(layout.scroll<=layout.width);assert.ok(layout.bottom<=742);
  await page.screenshot({path:'/tmp/sr2026-image-overlay-'+type.name()+'-mobile.png'});
  await page.locator('#mapEventImage').click();await imageOpen(false);
  await page.setViewportSize({width:1500,height:1000});await page.waitForTimeout(100);
  await page.locator('#eventSelect').selectOption('4');
  await page.locator('#eventSelect').selectOption('1');
  await page.waitForTimeout(800);await imageOpen(false);
  assert.equal(await page.locator('#eventText').textContent(),fixtures[1].text,'Late image load cannot restore an old event');
  await page.locator('#eventSelect').selectOption('5');
  await page.waitForFunction(()=>$('mapEventImageStatus').textContent.includes('kunne ikke hentes'));
  await page.locator('#mapEventImage').click();await imageOpen(false);
  await page.locator('#eventSelect').selectOption('0');await imageOpen();
  await page.locator('#endPresentation').click();await imageOpen(false);
  await page.locator('#eventImageButton').click();await imageOpen();
  await page.locator('.note-edit').first().click();await imageOpen(false,'Full note editing should leave the map usable');
  await page.locator('#cancelEdit').click();await imageOpen(false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('sr2026-notes')),stored);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'manual navigation opens photo, snap and time controls do not, panel click opens, photo click closes, no reappearance, same-photo events, map bounds, resize/mobile, slow-load cancellation, image failure, edit mode, saved scenes unchanged',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
