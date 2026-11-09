const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
(async()=>{
 const browser=await firefox.launch({headless:false});
 try{
  for(const admin of [false,true]){
   const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const initial={version:1,notes:[],speedPins:[],comparison:{route:[[12,55.6],[12.1,55.6]],enabled:false,basis:'absolute'}};
   let published=null;
   const origin=new URL(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/').origin;
   await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:`window.SR_CONFIG=${JSON.stringify({admin,apiBase:admin?origin:''})};`}));
   await page.route('**/api/session',route=>route.fulfill({json:{canEdit:true,login:'captain'}}));
   await page.route('**/presentation.json',route=>route.fulfill({json:initial}));
   await page.route('**/api/presentation',async route=>{
    if(route.request().method()==='PUT'){
     published=route.request().postDataJSON();
     await route.fulfill({json:{sha:'b'.repeat(40)}});
    }else await route.fulfill({json:{document:initial,sha:'a'.repeat(40)}});
   });
   await page.goto(origin+'/');await page.waitForSelector('#onlineStatus',{state:'attached'});
   assert.deepEqual(await page.evaluate(()=>comparison),initial.comparison);
   await page.locator('#trackComparisonToggle').click();
   await page.locator('#comparisonBasis').selectOption('handicap');
   if(!admin){
    assert.equal(await page.evaluate(()=>comparison.enabled),true);
    assert.equal(await page.evaluate(()=>JSON.parse(SRStorage.getItem('sr2026-comparison')).enabled),false,'Public changes remain in the current view');
    await page.locator('#mapMeasureToggle').click();await page.locator('#drawRhumbline').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('presenting')),true);
    await page.reload();await page.waitForSelector('#onlineStatus',{state:'attached'});
    assert.deepEqual(await page.evaluate(()=>comparison),initial.comparison);
   }else{
    const changed=await page.evaluate(()=>comparison);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem(SR_DRAFT_KEY)).document.comparison),changed);
    await page.reload();await page.waitForSelector('#onlineStatus');
    assert.deepEqual(await page.evaluate(()=>comparison),changed,'Writer drafts retain the shared route and colour choices');
    const download=page.waitForEvent('download');await page.locator('#export').click();
    const file=await download,stream=await file.createReadStream(),chunks=[];
    for await(const chunk of stream)chunks.push(chunk);
    const exported=JSON.parse(Buffer.concat(chunks).toString());
    assert.deepEqual(exported.comparison,changed);
    // A failed draft write must leave both the view and in-memory storage intact.
    const failure=await page.evaluate(()=>{
     const before=JSON.stringify(comparison),stored=SRStorage.getItem('sr2026-comparison'),original=Storage.prototype.setItem;
     Storage.prototype.setItem=function(){throw Error('Quota');};
     let accepted;
     try{accepted=saveComparison({...comparison,basis:'absolute'});}finally{Storage.prototype.setItem=original;}
     return {accepted,before,after:JSON.stringify(comparison),stored,afterStored:SRStorage.getItem('sr2026-comparison')};
    });
    assert.equal(failure.accepted,false);assert.equal(failure.before,failure.after);assert.equal(failure.stored,failure.afterStored);
    assert.match(await page.locator('#comparisonStatus').textContent(),/kunne ikke gemmes/);
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Importér noter',exact:true}).click();
    const imported={...initial,comparison:{route:[[11.9,55.5],[12.1,55.6],[12.2,55.7]],enabled:true,basis:'absolute'}};
    await (await chooser).setFiles({name:'route.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
    await page.waitForFunction(()=>comparison.route.length===3);
    assert.deepEqual(await page.evaluate(()=>comparison),imported.comparison);
    await page.getByRole('button',{name:'Udgiv',exact:true}).click();
    await page.waitForFunction(()=>$('onlineStatus').textContent.includes('Gemt i GitHub'));
    assert.deepEqual(published.document.comparison,imported.comparison);
    assert.equal(await page.evaluate(()=>localStorage.getItem(SR_DRAFT_KEY)),null);
   }
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({browser:'firefox',admin,checks:'shared route load, public ephemeral controls, admin draft restore, JSON export/import, failed storage rollback, publish payload',errors}));
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
