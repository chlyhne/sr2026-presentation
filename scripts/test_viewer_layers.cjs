const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
(async()=>{
 const browser=await firefox.launch({headless:false});
 try{
  for(const readonly of [false,true]){
   const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   if(readonly){
    await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={admin:false,apiBase:""};'}));
    await page.route('**/presentation.json',route=>route.fulfill({json:{version:1,speedPins:[],notes:[]}}));
   }
   await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
   await page.waitForSelector('#onlineStatus',{state:'attached'});
   await page.evaluate(()=>{
    const settings=sceneSettings(),time=D.start+3600;
    notes=[{time,text:'Lagtest',view:[...view],settings:{...settings,wind:true,rain:true}},
     {time:time+60,text:'Andre lag',view:[...view],settings:{...settings,wind:false,rain:true}}];
    if(!window.SR_READONLY)persistNotes(notes);
    showNotes();restoreNote(notes[0]);
   });
   const stored=()=>page.evaluate(()=>SRStorage.getItem('sr2026-notes'));
   const before=await stored(),toggle=page.locator('#mapLayersToggle'),panel=page.locator('#mapLayersPanel');
   assert.equal(await toggle.isVisible(),true);
   assert.equal(await panel.isVisible(),false);
   await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
   await page.getByLabel('Vind',{exact:true}).uncheck();
   await page.waitForFunction(()=>windFieldKey===null&&$('winds').childElementCount===0);
   assert.equal(await page.locator('#rain').isChecked(),true,'Wind and showers are independent');
   await page.getByLabel('Byger',{exact:true}).uncheck();
   await page.waitForFunction(()=>radarStatus==='slået fra');
   await page.getByLabel('Vind',{exact:true}).check();
   await page.waitForFunction(()=>windFieldKey!==null&&$('winds').childElementCount>0);
   assert.equal(await page.locator('#rain').isChecked(),false);
   if(readonly)assert.equal(await stored(),before,'Presentation changes leave saved events untouched');
   else{
    const saved=JSON.parse(await stored());
    assert.equal(saved[0].settings.wind,true);assert.equal(saved[0].settings.rain,false);
    assert.deepEqual(saved[1],JSON.parse(before)[1],'Only the active event changes');
   }
   await page.keyboard.press('Escape');
   assert.equal(await panel.isVisible(),false);
   assert.equal(await toggle.getAttribute('aria-expanded'),'false');
   assert.equal(await toggle.evaluate(node=>node===document.activeElement),true);
   assert.equal(await page.evaluate(()=>document.body.classList.contains('presenting')),readonly,'Escape closes the menu without ending presentation');
   await toggle.click();await page.locator('#eventText').click();
   assert.equal(await panel.isVisible(),false,'Clicking outside closes the menu');
   await page.evaluate(()=>restoreNote(notes[1]));
   await toggle.focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');
   assert.equal(await page.locator('#wind').evaluate(node=>node===document.activeElement),true);
   assert.equal(await page.locator('#wind').isChecked(),false);
   assert.equal(await page.locator('#rain').isChecked(),true,'Event navigation restores layer choices in the menu');
   await page.keyboard.press('Escape');
   if(readonly){
    await page.locator('#presentationFullscreen').click();
    await page.waitForFunction(()=>!!document.fullscreenElement);
    await toggle.click();assert.equal(await panel.isVisible(),true);
    await page.locator('#rain').uncheck();
    await page.waitForFunction(()=>radarStatus==='slået fra');
    assert.equal(await stored(),before);
    await page.screenshot({path:'/tmp/sr2026-layers-fullscreen.png'});
    await page.locator('#presentationFullscreen').click();
   }else{
    await toggle.click();await page.screenshot({path:'/tmp/sr2026-layers-editor.png'});
   }
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({browser:'firefox',readonly,checks:'layer menu, independent wind/showers, rendering, Escape and outside click, keyboard, event save/restore, presentation and fullscreen',errors}));
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
