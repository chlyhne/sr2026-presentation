const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));

(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  const url=new URL('events/sjaelland-rundt-2026/',process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  const time=require('../viewer/events/catalog.json').events.find(event=>event.id==='sjaelland-rundt-2026').start+3600;
  const sets=new Map([['default',{revision:'a',visibility:'public',document:{version:1,title:'Præsentation KBL',
   notes:[{time,text:'Original'}],speedPins:[]}}]]);
  let account=null,failNext=false,navigations=0;
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={eventService:true};'}));
  await page.context().route('**/auth/login?*',route=>{
   account={id:7,canPublish:true};
   const id=new URL(route.request().url()).searchParams.get('popup');
   return route.fulfill({contentType:'text/html',body:`<script>new BroadcastChannel('sr-event-login:${id}').postMessage('ok');window.close()</script>`});
  });
  await page.route('**/api/logout',route=>{account=null;return route.fulfill({json:{}});});
  const describeSet=(id,set)=>({id,visibility:set.visibility,title:set.document.title,canEdit:!!account,canSetVisibility:!!account});
  await page.route('**/api/event-sets?*',route=>{
   const id=new URL(route.request().url()).searchParams.get('set');
   const current=sets.get(id);
   if(!id)return route.fulfill({json:{account,sets:[...sets].filter(([,entry])=>account||entry.visibility==='public')
    .map(([key,entry])=>describeSet(key,entry))}});
   if(route.request().method()==='GET')return route.fulfill({json:{...current,...describeSet(id,current)}});
   assert.ok(account);
   const body=route.request().postDataJSON();
   if(failNext||body.revision!==(current?.revision??null)){
    failNext=false;return route.fulfill({status:409,json:{error:'Serverens eventsæt er ændret. Din kladde er stadig gemt.'}});
   }
   const saved={...body,revision:String(sets.size)+':'+String(Date.now())};sets.set(id,saved);
   return route.fulfill({json:{revision:saved.revision,...describeSet(id,saved)}});
  });

  await page.goto(url.href);
  await page.locator('main:not([inert])').waitFor({timeout:120000});
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  await page.locator('#eventPanelToggle').click();
  const action=page.locator('#eventAction'),activeIcon=()=>action.locator('svg.active').getAttribute('data-event-action');
  const input=page.locator('#eventTextEditor'),setPicker=page.locator('#eventSetPicker'),status=page.locator('#onlineStatus');
  const openPicker=async()=>{
   if(await setPicker.getAttribute('aria-expanded')==='false')await setPicker.click();
  };
  const choose=async id=>{
   await openPicker();await page.locator('#eventSetSelect').selectOption('set:'+id);
   await page.waitForFunction(id=>eventSetSource==='set:'+id&&!eventSetBusy,id);
  };
  const edit=async text=>{await action.click();await input.fill(text);assert.equal(await activeIcon(),'save');};
  const save=async label=>{await action.click();await page.waitForFunction(label=>$('onlineStatus').textContent===label,label);};
  const mapState=()=>page.evaluate(()=>({time:currentTime(),view:[...view],boats:sceneSettings().boats}));
  assert.equal(await setPicker.textContent(),'Præsentation KBL');
  assert.equal(await activeIcon(),'edit');
  assert.equal(await page.locator('#eventContentTools').isVisible(),false);
  const initial=await mapState();
  await edit('Kladde');
  await page.locator('#cancelEventEdit').click();
  assert.equal(await page.locator('#eventText').textContent(),'Original');
  await edit('Lokal rettelse');
  await save('Gemt lokalt.');
  assert.equal(sets.get('default').document.notes[0].text,'Original');
  assert.equal(await page.locator('#eventText').textContent(),'Lokal rettelse');
  assert.deepEqual(await mapState(),initial);
  await openPicker();await page.locator('#eventSetLogin').click();
  await page.waitForFunction(()=>$('onlineStatus').textContent==='Gemt på serveren.');
  assert.equal(sets.get('default').document.notes[0].text,'Lokal rettelse');
  assert.equal(navigations,0);

  await openPicker();await page.locator('#newEventSet').click();
  await page.locator('#newEventSetName').fill('Vera og Mercutio');
  await page.locator('#newEventSetForm button[type=submit]').click();
  await page.waitForFunction(()=>$('onlineStatus').textContent==='Gemt på serveren.'&&!eventSetBusy);
  const createdId=await page.evaluate(()=>eventSetMetadata.id);
  assert.equal(sets.get(createdId).visibility,'private');
  assert.equal(await activeIcon(),'add');
  await edit('Nyt privat event');
  await save('Gemt på serveren.');
  assert.equal(sets.get(createdId).document.notes[0].text,'Nyt privat event');
  await choose('default');
  await choose(createdId);
  assert.equal(await page.locator('#eventText').textContent(),'Nyt privat event');

  await openPicker();await page.locator('#presentationOptions summary').click();
  await page.locator('#eventSetVisibility').selectOption('public');
  await page.locator('#eventSetNameForm button[type=submit]').click();
  await page.waitForFunction(()=>eventSetMetadata.visibility==='public'&&!eventSetBusy);
  assert.equal(sets.get(createdId).visibility,'public');

  failNext=true;await edit('Beholdes ved konflikt');
  await save('Serverens eventsæt er ændret. Din kladde er stadig gemt.');
  assert.equal(await page.locator('#eventText').textContent(),'Beholdes ved konflikt');
  assert.equal(sets.get(createdId).document.notes[0].text,'Nyt privat event');
  await page.locator('#retrySaveEventSet').click();
  await page.waitForFunction(()=> $('onlineStatus').textContent==='Gemt på serveren.');
  assert.equal(sets.get(createdId).document.notes[0].text,'Beholdes ved konflikt');
  await openPicker();await page.locator('#eventSetLogout').click();
  await page.waitForFunction(()=>!window.SR_ACCOUNT&&!eventSetBusy);
  await openPicker();
  assert.ok(await page.locator('#eventSetSelect optgroup[label="Offentlige eventsæt"]').locator('option').count()>=2);
  assert.deepEqual(await mapState(),initial);
  assert.deepEqual(errors,[]);
  assert.equal(navigations,0);
  console.log('Firefox: +, pencil and save, local and server persistence, eventsæt picker, visibility and conflict without reloading.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
