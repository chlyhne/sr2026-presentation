const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
(async()=>{
 const browser=await firefox.launch({headless:false});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const originalNotes='[{"time":1781168400,"text":"Mine eksisterende noter"}]';
  await page.addInitScript(notes=>localStorage.setItem('sr2026-notes',notes),originalNotes);
  let definition={version:1,points:[]},writes=0;
  await page.route('**/rhumbline.json',route=>route.fulfill({json:definition}));
  await page.route('**/api/rhumbline',async route=>{
   writes++;
   if(writes===1){await route.fulfill({status:500,json:{error:'Test: kunne ikke gemme'}});return;}
   definition=route.request().postDataJSON();await route.fulfill({status:201,json:definition});
  });
  const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/';
  await page.goto(new URL('rhumbline.html',base).href);await page.waitForSelector('body.rhumbline-setup');
  assert.equal(await page.locator('#eventPanel').isVisible(),false);
  assert.equal(await page.locator('#mapTools #trackComparison').isVisible(),false);
  assert.equal(await page.locator('#mapLayers').isVisible(),false);
  assert.deepEqual(await page.locator('#map').boundingBox(),{x:0,y:0,width:1500,height:1000});
  assert.equal(await page.evaluate(()=>navigationMode),'route');
  const click=async coordinate=>{
   const p=await page.evaluate(p=>{const point=new DOMPoint(...xy(p)).matrixTransform($('map').getScreenCTM());return {x:point.x,y:point.y};},coordinate);
   await page.mouse.click(p.x,p.y);
  };
  await click([12,55.4]);await click([12.1,55.4]);await click([12.2,55.5]);
  assert.equal(await page.evaluate(()=>navigationDraft.length),3);
  await page.locator('#undoMapPoint').click();assert.equal(await page.evaluate(()=>navigationDraft.length),2);
  await click([12.2,55.5]);
  const drawn=await page.evaluate(()=>navigationDraft);
  await page.getByRole('button',{name:'Vend retning',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>navigationDraft),[...drawn].reverse());
  await page.getByRole('button',{name:'Vend retning',exact:true}).click();
  await page.getByRole('button',{name:'Gem permanent rhumbline',exact:true}).click();
  await page.waitForFunction(()=>$('rhumblineSaveStatus').textContent.includes('Test:'));
  assert.deepEqual(await page.evaluate(()=>navigationDraft),drawn,'A failed save preserves the drawn points');
  await page.getByRole('button',{name:'Gem permanent rhumbline',exact:true}).click();
  await page.waitForFunction(()=>$('rhumblineSaveStatus').textContent.includes('punkter gemt'));
  assert.deepEqual(definition,{version:1,points:drawn});
  assert.equal(await page.locator('#finishMapLine').isDisabled(),true);
  assert.equal(await page.locator('#undoMapPoint').isDisabled(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('sr2026-notes')),originalNotes);
  assert.equal(await page.evaluate(()=>localStorage.getItem('sr2026-comparison')),null);
  await page.reload();await page.waitForSelector('body.rhumbline-setup');
  assert.equal(await page.locator('#finishMapLine').isDisabled(),true);
  assert.equal(await page.evaluate(()=>navigationMode),null,'A defined permanent route cannot be redrawn');
  assert.deepEqual(await page.evaluate(()=>SR_RHUMBLINE),definition);
  assert.equal(writes,2);
  await page.screenshot({path:'/tmp/sr2026-permanent-rhumbline-test.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:'firefox',checks:'separate full-screen map, same WebGL renderer, draw/undo/reverse, failure preserves points, save once and lock after reload, existing notes untouched',errors}));
  await page.close();
  // Permanent input failures must remain visible; no other route source is used.
  for(const response of [{status:503,json:{error:'Unavailable'}},{json:{version:1,points:[[12,55]]}}]){
   const broken=await browser.newPage({viewport:{width:1500,height:1000}});
   await broken.route('**/rhumbline.json',route=>route.fulfill(response));
   await broken.goto(base);
   await broken.getByRole('alert').filter({hasText:'permanente rhumbline'}).waitFor();
   assert.equal(await broken.evaluate(()=>typeof window.SR_RHUMBLINE),'undefined');
   await broken.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
