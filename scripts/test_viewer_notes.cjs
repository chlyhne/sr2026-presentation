// Run against the local viewer server; Playwright may come from a sibling repo.
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/';

async function check(browserType){
 const browser=await browserType.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1500,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>typeof beginNoteEditing==='function');
  const fixtures=await page.evaluate(()=>{
   const time=D.start+3600;
   return [{time,text:'Den oprindelige note',point:[630,420],view:[600,350,160,180],
    settings:{...sceneSettings(),rain:false,wind:false,boats:[]}},
    {time,text:'Et andet event ved samme tidspunkt',view:[600,350,160,180],settings:{...sceneSettings(),rain:false,wind:false,boats:[]}},
    {time:time+3600,text:'En ældre note uden kortindstillinger'}];
  });
  await page.evaluate(notes=>localStorage.setItem('sr2026-notes',JSON.stringify(notes)),fixtures);
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.note-edit').length===3);
  const storage=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sr2026-notes')));
  await page.locator('.note-edit').first().click();
  assert.equal(await page.locator('#note').inputValue(),fixtures[0].text);
  assert.equal(await page.locator('#drawingTools').isVisible(),true);
  assert.equal(await page.locator('#time').isDisabled(),true);
  await page.locator('#note').fill('Opdateret tekst <b>som almindelig tekst</b>');
  assert.match(await page.locator('#eventText').textContent(),/Opdateret tekst <b>/);
  assert.equal(await page.locator('#annotations rect,#annotations tspan').count(),0);

  async function stroke(tool,start=[.28,.35],end=[.55,.6]){
   await page.locator('#drawingTool').selectOption(tool);
   const box=await page.locator('#map').boundingBox();
   await page.mouse.move(box.x+box.width*start[0],box.y+box.height*start[1]);
   await page.mouse.down();
   await page.mouse.move(box.x+box.width*end[0],box.y+box.height*end[1],{steps:12});
   await page.mouse.up();
  }
  const initialView=await page.evaluate(()=>[...view]);
  for(const tool of ['pen','arrow','line','circle'])await stroke(tool);
  assert.deepEqual(await page.evaluate(()=>[...view]),initialView,'Drawing must not pan the map');
  assert.deepEqual(await page.evaluate(()=>noteDraft.drawings.map(d=>d.tool)),['pen','arrow','line','circle']);
  assert.deepEqual(await storage(),fixtures,'Draft changes must not mutate saved notes');
  await page.locator('#undoDrawing').click();
  assert.equal(await page.evaluate(()=>noteDraft.drawings.length),3);
  await stroke('circle');

  // A cancelled pointer gesture and Escape leave completed drawings intact.
  const box=await page.locator('#map').boundingBox();
  await page.mouse.move(box.x+box.width*.3,box.y+box.height*.7);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.7,{steps:6});
  await page.evaluate(()=>$('map').dispatchEvent(new PointerEvent('pointercancel',{pointerId:drawingGesture.pointerId})));
  await page.mouse.up();assert.equal(await page.evaluate(()=>noteDraft.drawings.length),4);
  await page.mouse.move(box.x+box.width*.3,box.y+box.height*.7);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.7,{steps:6});
  await page.keyboard.press('Escape');await page.mouse.up();
  assert.equal(await page.evaluate(()=>noteDraft.drawings.length),4);
  assert.equal(await page.locator('#drawingPreview').evaluate(el=>el.childElementCount),0);
  assert.equal(await page.locator('#drawingTool').inputValue(),'pan');

  await page.locator('#placeNote').click();
  await page.mouse.click(box.x+box.width*.8,box.y+box.height*.8);
  assert.notDeepEqual(await page.evaluate(()=>noteDraft.point),fixtures[0].point);
  assert.deepEqual((await storage())[0].point,fixtures[0].point);
  const points=await page.evaluate(()=>JSON.parse(JSON.stringify(noteDraft.drawings)));
  await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4);await page.mouse.wheel(0,-120);
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(()=>noteDraft.drawings),points,'Zoom preserves geographic points');
  assert.equal(await page.evaluate(()=>currentTime()),fixtures[0].time);
  await page.locator('#startPresentation').click();
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('presenting')),false,'Do not discard unsaved edits');
  await page.locator('#save').click();
  const saved=await storage();
  assert.equal(saved.length,3);assert.equal(saved[0].time,fixtures[0].time);
  assert.equal(saved[0].text,'Opdateret tekst <b>som almindelig tekst</b>');
  assert.deepEqual(saved[0].drawings,points);assert.deepEqual(saved.slice(1),fixtures.slice(1));
  assert.equal(await page.locator('#drawingTools').isVisible(),false);

  // Cancel restores text, marker, drawings, and saved map; old notes still work.
  await page.locator('.note-edit').first().click();
  await page.locator('#note').fill('Denne ændring skal kasseres');
  await page.locator('#clearDrawings').click();
  assert.equal(await page.locator('#noteDrawings').evaluate(el=>el.childElementCount),0);
  await page.locator('#cancelEdit').click();assert.deepEqual(await storage(),saved);
  assert.equal(await page.locator('#noteDrawings > g').count(),1);
  await page.locator('.note-edit').nth(2).click();
  assert.equal(await page.locator('#note').inputValue(),fixtures[2].text);
  assert.equal(await page.locator('#undoDrawing').isDisabled(),true);
  await stroke('line');await page.locator('#cancelEdit').click();
  assert.deepEqual(await storage(),saved);

  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.note-edit').length===3);
  await page.locator('.note-jump').first().click();
  await page.locator('#startPresentation').click();
  assert.equal(await page.locator('#noteDrawings > g').count(),1);
  assert.equal(await page.locator('#noteDrawings > g > path').count(),4);
  assert.equal(await page.locator('#noteDrawings circle').count(),1);
  await page.locator('#nextEvent').click();
  assert.equal(await page.locator('#noteDrawings').evaluate(el=>el.childElementCount),0,'No drawing leaks to another event at the same time');
  await page.locator('#previousEvent').click();
  await page.evaluate(()=>{
   const serialize=XMLSerializer.prototype.serializeToString;
   XMLSerializer.prototype.serializeToString=function(node){const xml=serialize.call(this,node);window.exportedSVG=xml;return xml;};
  });
  const download=page.waitForEvent('download');await page.evaluate(()=>captureMap());
  await(await download).saveAs('/tmp/sr2026-note-drawings-'+browserType.name()+'-map.png');
  assert.equal(await page.evaluate(()=>new DOMParser().parseFromString(exportedSVG,'image/svg+xml').querySelectorAll('#noteDrawings > g > *').length),5);
  const exportNotes=page.waitForEvent('download');await page.evaluate(()=>$('export').click());
  const jsonDownload=await exportNotes;
  assert.deepEqual(JSON.parse(require('node:fs').readFileSync(await jsonDownload.path(),'utf8')).notes,saved);
  assert.deepEqual(await storage(),saved,'Presentation and export preserve saved notes');
  await page.screenshot({path:'/tmp/sr2026-note-drawings-'+browserType.name()+'.png'});
  await page.keyboard.press('Escape');
  await page.locator('.note-edit').first().click();
  await page.screenshot({path:'/tmp/sr2026-note-editor-'+browserType.name()+'.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:browserType.name(),checks:'edit/save/cancel, four drawing tools, undo/clear, marker move, zoom, exact time, legacy notes, reload, event isolation, PNG and JSON export',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const browser of [chromium,firefox])await check(browser);})().catch(error=>{console.error(error);process.exit(1);});
