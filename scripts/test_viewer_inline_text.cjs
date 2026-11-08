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
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');await page.waitForFunction(()=>typeof beginInlineTextEditing==='function');
  const fixtures=await page.evaluate(()=>{
   const settings={...sceneSettings(),wind:false,rain:false,boats:[]};
   return [{time:D.start+3600,text:'Den oprindelige tekst',point:[630,420],view:[230,250,620,760],settings,
    drawings:[{tool:'line',colour:'#e02020',width:4,points:[[600,400],[650,450]]}]},
    {time:D.start+7200,text:'Anden note',view:[230,250,620,760],settings}];
  });
  await page.evaluate(notes=>localStorage.setItem('sr2026-notes',JSON.stringify(notes)),fixtures);
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.note-jump').length===2);
  await page.locator('.note-jump').first().click();
  const state=await page.evaluate(()=>{view=[500,300,300,300];setview();selectedTime+=600;render();return {view:[...view],time:currentTime()};});
  await page.locator('#eventText').click();
  assert.equal(await page.locator('#eventTextEditor').isVisible(),true);
  assert.equal(await page.locator('#eventTextEditor').evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.evaluate(()=>editingNote),null,'Inline text editing does not open full scene editing');
  assert.deepEqual(await page.evaluate(()=>({view:[...view],time:currentTime()})),state,'Clicking text does not restore or move the saved scene');
  await page.locator('#eventTextEditor').fill('En rettelse <b>som almindelig tekst</b>');
  await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('Anden linje');
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>currentTime()),state.time,'Text cursor keys do not move time');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes'))),fixtures,'Draft is not saved before blur');
  const edited='En rettelse <b>som almindelig tekst</b>\nAnden linje';
  await page.locator('#eventCounter').click();
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes')));
  assert.deepEqual(saved,[{...fixtures[0],text:edited},fixtures[1]],'Autosave updates text only');
  assert.equal(await page.locator('#eventText').textContent(),edited);assert.equal(await page.locator('#eventText b').count(),0);
  assert.match(await page.locator('.note-jump').first().textContent(),/En rettelse/);
  await page.locator('#eventText').click();await page.locator('#eventTextEditor').fill('Skal kasseres');await page.keyboard.press('Escape');
  assert.equal(await page.locator('#eventTextEditor').isVisible(),false);assert.equal(await page.locator('#eventText').textContent(),edited);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes'))),saved);
  await page.locator('#eventText').focus();await page.keyboard.press('Enter');await page.locator('#eventTextEditor').fill('Gem med tastatur');await page.keyboard.press('Control+Enter');
  assert.equal(await page.locator('#eventTextEditor').isVisible(),false);
  assert.equal(await page.evaluate(()=>notes[0].text),'Gem med tastatur');
  // A click on another note must complete even when blur saves and refreshes labels.
  await page.locator('#eventText').click();await page.locator('#eventTextEditor').fill('Gem før skift');
  await page.locator('.note-jump').nth(1).click();assert.equal(await page.locator('#eventText').textContent(),fixtures[1].text);
  assert.equal(await page.evaluate(()=>notes[0].text),'Gem før skift');
  await page.locator('#eventText').click();await page.locator('#eventTextEditor').fill('Anden note rettet');await page.locator('#startPresentation').click();
  assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('presenting')),true);
  assert.equal(await page.evaluate(()=>notes[1].text),'Anden note rettet');
  await page.locator('#eventText').click();assert.equal(await page.locator('#eventTextEditor').isVisible(),false,'Presentation text remains read-only');
  await page.locator('#endPresentation').click();
  // Inline editing shares the existing draft when the whole note is being edited.
  saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes')));
  await page.locator('.note-edit').nth(1).click();await page.locator('#eventText').click();
  await page.locator('#eventTextEditor').fill('En kladde i højrepanelet');await page.locator('#eventCounter').click();
  assert.equal(await page.locator('#note').inputValue(),'En kladde i højrepanelet');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes'))),saved);
  await page.locator('#cancelEdit').click();assert.equal(await page.locator('#eventText').textContent(),'Anden note rettet');
  // A failed autosave keeps the text available for retry/cancel and blocks navigation.
  await page.locator('#eventText').click();await page.locator('#eventTextEditor').fill('Bevar min rettelse ved fejl');
  await page.evaluate(()=>{window.originalInlineStorage=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='sr2026-notes')throw new Error('quota');return originalInlineStorage.call(this,key,value);};});
  await page.locator('#eventCounter').click();assert.equal(await page.locator('#eventTextEditor').isVisible(),true);
  assert.match(await page.locator('#inlineTextStatus').textContent(),/kunne ikke gemmes/);
  assert.equal(await page.locator('#eventTextEditor').inputValue(),'Bevar min rettelse ved fejl');
  await page.locator('#previousEvent').click();assert.equal(await page.evaluate(()=>activePresentationNote===notes[1]),true);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes'))),saved);
  await page.evaluate(()=>{Storage.prototype.setItem=originalInlineStorage;});await page.locator('#eventTextEditor').focus();await page.keyboard.press('Escape');
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.note-jump').length===2);await page.locator('.note-jump').first().click();
  assert.equal(await page.locator('#eventText').textContent(),'Gem før skift');
  await page.locator('#eventText').click();await page.screenshot({path:'/tmp/sr2026-inline-text-'+type.name()+'.png'});
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'click to edit in right panel, blur autosave, text-only updates, multiline and cursor keys, Escape, Ctrl+Enter, single-click navigation, read-only presentation, shared note draft, failed save, reload',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
