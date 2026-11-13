const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  for(const admin of [false,true]){
   const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const initial={version:1,notes:[],speedPins:[]};
   const permanent=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../viewer/rhumbline.json'),'utf8'));
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
   await page.route('**/rhumbline.json',route=>route.fulfill({json:permanent}));
   await page.goto(origin+'/');await page.waitForSelector('main:not([inert])',{timeout:120000});
   assert.deepEqual(await page.evaluate(()=>SR_RHUMBLINE),permanent);
   await page.locator('#mapTracksToggle').click();
   await page.locator('#trackStyle').selectOption('handicap');
   if(!admin){
    assert.equal(await page.evaluate(()=>comparison.enabled),true);
    assert.equal(await page.evaluate(()=>SRStorage.getItem('sr2026-comparison')),null,'Route definitions are not presentation storage');
    await page.locator('#mapMeasureToggle').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('presenting')),true);
    await page.reload();await page.waitForSelector('#onlineStatus',{state:'attached'});
    assert.deepEqual(await page.evaluate(()=>SR_RHUMBLINE),permanent);
   }else{
    const changed=await page.evaluate(()=>comparison);
    assert.equal(await page.evaluate(()=>localStorage.getItem(SR_DRAFT_KEY)),null,'Display choices do not create presentation drafts');
    await page.reload();await page.waitForSelector('#onlineStatus');
    assert.deepEqual(await page.evaluate(()=>comparison),changed,'Display preferences persist independently of presentation drafts');
    const download=page.waitForEvent('download');await page.locator('#export').click();
    const file=await download,stream=await file.createReadStream(),chunks=[];
    for await(const chunk of stream)chunks.push(chunk);
    const exported=JSON.parse(Buffer.concat(chunks).toString());
    assert.deepEqual(Object.keys(exported).sort(),['notes','speedPins','version']);
    // A failed draft write must leave both the view and in-memory storage intact.
    const failure=await page.evaluate(()=>{
     const before=JSON.stringify(comparison),stored=localStorage.getItem(TRACK_COMPARISON_KEY),original=Storage.prototype.setItem;
     Storage.prototype.setItem=function(){throw Error('Quota');};
     let accepted;
     try{accepted=saveComparison({...comparison,basis:'absolute'});}finally{Storage.prototype.setItem=original;}
     return {accepted,before,after:JSON.stringify(comparison),stored,afterStored:localStorage.getItem(TRACK_COMPARISON_KEY)};
    });
    assert.equal(failure.accepted,false);assert.equal(failure.before,failure.after);assert.equal(failure.stored,failure.afterStored);
    assert.match(await page.locator('#comparisonStatus').textContent(),/kunne ikke gemmes/);
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Importér noter',exact:true}).click();
    const imported={...initial,notes:[{time:Date.UTC(2026,5,11,9)/1000,text:'Importerede noter'}]};
    await (await chooser).setFiles({name:'route.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
    await page.waitForFunction(()=>notes.length===1);
    assert.deepEqual(await page.evaluate(()=>SR_RHUMBLINE),permanent,'Import cannot change the permanent route');
    await page.getByRole('button',{name:'Udgiv',exact:true}).click();
    await page.waitForFunction(()=>$('onlineStatus').textContent.includes('Gemt i GitHub'));
    assert.deepEqual(published.document,imported);
    assert.deepEqual(Object.keys(published.document).sort(),['notes','speedPins','version']);
    assert.equal(await page.evaluate(()=>localStorage.getItem(SR_DRAFT_KEY)),null);
   }
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({browser:'firefox',admin,checks:'permanent route independent of public/admin documents, separate display preferences, JSON export/import/publish exclude geometry, failed preference save rollback',errors}));
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
