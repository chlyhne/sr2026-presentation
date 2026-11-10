const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/presentation.json',route=>route.fulfill({json:{version:1,notes:[],speedPins:[]}}));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18172/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  assert.equal(await page.evaluate(()=>boats.every(boat=>shownBoatNames.has(boat.id))),true,'All boat names are visible by default');
  await page.evaluate(()=>{
   const boat=boats.find(candidate=>chosen.has(candidate.name));
   setBoatSelected(boat,false);shownBoatNames.delete(boat.id);
   notes=[{time:currentTime(),text:'Names',view:[...view],settings:sceneSettings()}];activePresentationNote=notes[0];
   setBoatSelected(boat,true);flushRender();
   if(!shownBoatNames.has(boat.id)||!notes[0].settings.boatNames.includes(boat.id))throw Error('Selecting a boat must show and save its name');
   setAllBoatsSelected(false);shownBoatNames.clear();setAllBoatsSelected(true);flushRender();
   if(!boats.every(candidate=>shownBoatNames.has(candidate.id)))throw Error('Selecting all boats must show their names');
  });
  const levels=await page.evaluate(()=>{
   stopPlayback();$('wind').checked=$('rain').checked=false;
   const center=xy([12,55]);
   return [15*1852,5*1852,2*1852,1852,400,100].map(meters=>{
    const width=meters*MAP_GRID_UNITS_PER_METER[0]*10;
    view=[center[0]-width/2,center[1]-width/2,width,width];setview();render();
    const viewport=mapViewport(),level=mapGridLevel(viewport);
    assertRenderingReady();
    const scale=$('mapCredit').querySelector('[data-map-scale]');
    const scaleMeters=+scale.dataset.meters,scaleWidth=+scale.dataset.pixelWidth;
    const scaleBounds=scale.getBoundingClientRect();
    const gridWidth=level.meters*MAP_GRID_UNITS_PER_METER[0]*Math.hypot(viewport.matrix.a,viewport.matrix.b);
    if(scaleMeters!==level.meters||Math.abs(scaleWidth-gridWidth)>1e-6)throw Error('Scale must match one grid cell');
    if(scale.querySelector('text').textContent!==level.label)throw Error('Scale and grid must use the same label');
    if(scaleBounds.right>viewport.rect.right||scaleBounds.bottom>viewport.rect.bottom||scaleBounds.bottom<viewport.rect.bottom-90)throw Error('Scale must stay in the bottom right corner');
    return {meters:level.meters,label:$('gridSpacing').textContent,scaleMeters};
   });
  });
  assert.deepEqual(levels.map(level=>level.meters),[27780,9260,3704,1852,400,100]);
  assert.deepEqual(levels.map(level=>level.label),['15 sømil','5 sømil','2 sømil','1 sømil','400 m','100 m']);
  assert.deepEqual(levels.map(level=>level.scaleMeters),levels.map(level=>level.meters),'Scale follows grid size at every zoom level');
  const coverage=await page.evaluate(()=>{
   $('land').setAttribute('visibility','hidden');$('coast').setAttribute('visibility','hidden');
   const read=()=>{
    webglBackground.render(true);
    const {gl,canvas}=webglBackground,pixels=new Uint8Array(canvas.width*canvas.height*4);
    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL grid error');
    return pixels;
   };
   $('grid').checked=false;const without=read();
   if(!$('mapCredit').querySelector('[data-map-scale]'))throw Error('Scale remains visible without the grid');
   $('grid').checked=true;const withGrid=read();
   let changed=0,partial=0;
   for(let offset=0;offset<without.length;offset+=4){
    if(without[offset]!==withGrid[offset]||without[offset+1]!==withGrid[offset+1]||without[offset+2]!==withGrid[offset+2]||without[offset+3]!==withGrid[offset+3])changed++;
    if(without[offset+3]===0&&withGrid[offset+3]>0&&withGrid[offset+3]<80)partial++;
   }
   $('land').removeAttribute('visibility');$('coast').removeAttribute('visibility');
   return {changed,partial};
  });
  assert.ok(coverage.changed>100,'Grid is drawn by WebGL');
  assert.ok(coverage.partial>100,'Grid edges are antialiased');
  await page.evaluate(()=>{
   const settings=sceneSettings();
   notes=[{time:currentTime(),text:'Grid on',view:[...view],settings},
    {time:currentTime()+60,text:'Grid off',view:[...view],settings:{...settings,grid:false}}];
   restoreNote(notes[0]);
  });
  await page.locator('#mapLayersToggle').click();
  await page.locator('#grid').uncheck();
  assert.equal(await page.evaluate(()=>sceneSettings().grid),false);
  assert.equal(await page.evaluate(()=>notes[0].settings.grid),false,'Layer change is saved to the active event');
  await page.evaluate(()=>{notes[0].settings.grid=true;restoreNote(notes[0]);});
  assert.equal(await page.locator('#grid').isChecked(),true);
  await page.evaluate(()=>restoreNote(notes[1]));
  assert.equal(await page.locator('#grid').isChecked(),false,'Event navigation restores grid visibility');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:'firefox',levels,coverage,checks:'default names, zoom levels, GPU pixels, antialiasing, layer toggle, event save/restore'}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
