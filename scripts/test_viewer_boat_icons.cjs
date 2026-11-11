const assert=require('node:assert/strict');
const path=require('node:path');
const resolved=JSON.parse(require('node:fs').readFileSync(path.resolve(__dirname,'../data/boat-dimensions/resolved.json'),'utf8'));
const expectedSourced=Object.fromEntries(resolved.boats.map(b=>[b.trackName.toLowerCase(),b.metadata]));
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  await page.evaluate(()=>{boatFavouritesOnly=true;});
  const metadata=await page.evaluate(()=>boats.map(b=>({name:b.name,...b.metadata})));
  for(const boat of metadata){
   const expected={mercutio:[8,2.54],vera:[8,2.54],my:[8,2.54],saltamalin:[8,2.54],
    'the hulk':[10.3,3.18],'rosa-lux':[10,3],alice:[8,2.51],moster:[7.77,2.5],slipstik:[10,2.3],ambra:[10,2.3],xbox:[12.75,4.18],'quinta light':[12.55,4.3],'hansen 3.5':[10.65,3.53],munje:[13.35,4.25],
    'vi ses':[10.21,3.21],'dream on':[15.88,3.86],norma:[9.96,3.1],'tjørn':[12.25,3.3],sabrina:[11.8872,3.784314606741573]}[boat.name.toLowerCase()];
   const collected=expectedSourced[boat.name.toLowerCase()];
   assert.ok(collected);
   assert.equal(boat.lengthM,expected?expected[0]:collected.lengthM);assert.equal(boat.beamM,expected?expected[1]:collected.beamM);
   assert.equal(!!boat.estimated,expected?false:!!collected.estimated);
   const modern=['the hulk','my','vera','mercutio','saltamalin','laolao','xbox','quinta light'];
   assert.equal(boat.hull,['slipstik','ambra'].includes(boat.name.toLowerCase())?'classic':modern.includes(boat.name.toLowerCase())?'modern':'common');
  }
  async function zoom(width,name='Mercutio'){return page.evaluate(([width,name])=>{
   const boat=boats.find(b=>b.name===name);chosen.clear();chosen.add(boat.name);
   $('wind').checked=false;$('rain').checked=false;selectedTime=D.start+3600;
   const point=trackPosition(boat.points,selectedTime).point,[x,y]=xy(point);
   const height=width*.9;view=[x-width/2,y-height/2,width,height];$('map').setAttribute('viewBox',view.join(' '));render();
   const icon=document.querySelector('.boat-icon'),hull=icon.querySelector('path'),bbox=hull.getBBox(),m=hull.getScreenCTM();
   const beam=Math.hypot(m.a,m.b)*bbox.width,length=Math.hypot(m.c,m.d)*bbox.height;
   const c=+icon.dataset.course,latitude=point[1]*Math.PI/180,R=6371008.8,rad=Math.PI/180,map=$('map').getScreenCTM();
   const east=1000/(4.5*rad*R*Math.cos(latitude)),north=1180/(3*rad*R);
   const expectedBeam=boat.metadata.beamM*Math.hypot(map.a*east*Math.cos(c)+map.c*north*Math.sin(c),map.b*east*Math.cos(c)+map.d*north*Math.sin(c));
   const expectedLength=boat.metadata.lengthM*Math.hypot(map.a*east*Math.sin(c)-map.c*north*Math.cos(c),map.b*east*Math.sin(c)-map.d*north*Math.cos(c));
   return {beam,length,expectedBeam,expectedLength};
  },[width,name]);}
  // Both classic boats must render the supplied hull with their own true dimensions.
  await page.evaluate(()=>{
   chosen.clear();chosen.add('Slipstik');chosen.add('Ambra');
   selectedTime=D.start+3600;render();
  });
  assert.equal(await page.locator('.boat-icon[data-hull="classic"]').count(),2);
  assert.equal(await page.locator('.boat-icon[data-hull="modern"]').count(),0);
  const hullShapes=await page.evaluate(()=>Object.fromEntries(Object.entries(boatHulls).map(([name,hull])=>[name,hull.d])));
  assert.notEqual(hullShapes.classic,hullShapes.modern);
  assert.equal(await page.locator('.boat-hull').first().getAttribute('d'),hullShapes.classic);
  const classic=await zoom(.1,'Slipstik');
  assert.ok(Math.abs(classic.beam-classic.expectedBeam)<.001);
  assert.ok(Math.abs(classic.length-classic.expectedLength)<.001);
  await page.screenshot({path:'/tmp/sr2026-classic-boats.png'});
  for(const [name,lengthM,beamM] of [['THE HULK',10.3,3.18],['XBOX',12.75,4.18],['Slipstik',10,2.3],['Rosa-Lux',10,3]]){
   const far=await zoom(10,name);
   assert.ok(Math.abs(far.beam-beamM*8/2.54)<.001,name+' shares the beam scale');
   assert.ok(Math.abs(far.length-lengthM*8/2.54)<.001,name+' shares the length scale');
  }
  await zoom(.1,'Rosa-Lux');assert.equal(await page.locator('.boat-icon').getAttribute('data-hull'),'common');
  await page.screenshot({path:'/tmp/sr2026-common-boats.png'});
  const wide=await zoom(10);assert.ok(Math.abs(wide.beam-8)<.001);
  assert.ok(Math.abs(wide.length-8*8/2.54)<.001);
  await page.screenshot({path:'/tmp/sr2026-boats-wide.png'});
  const close=await zoom(.1);assert.ok(close.beam>8);assert.ok(Math.abs(close.beam-close.expectedBeam)<.001);assert.ok(Math.abs(close.length-close.expectedLength)<.001);
  const iconOnTop=await page.evaluate(async()=>{
   const marker=$('boatMarkers').querySelector('.boat-marker'),matrix=marker.getScreenCTM();
   const mapPoint=new DOMPoint(matrix.e,matrix.f).matrixTransform($('map').getScreenCTM().inverse());
   const crossing=el('path',{d:`M ${mapPoint.x-1} ${mapPoint.y} L ${mapPoint.x+1} ${mapPoint.y}`,stroke:'red','stroke-width':20,'vector-effect':'non-scaling-stroke'},$('routes'));
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const top=document.elementFromPoint(matrix.e,matrix.f),result=top.closest('.boat-marker')===marker;
   crossing.remove();return {result,point:{x:matrix.e,y:matrix.f},top:top?.outerHTML.slice(0,250),marker:marker.outerHTML.slice(0,350),markerBounds:marker.getBoundingClientRect().toJSON(),circleBounds:marker.querySelector('circle').getBoundingClientRect().toJSON(),visible:getComputedStyle(marker).visibility,rect:{...mapViewport().rect.toJSON()}};
  });
  assert.equal(iconOnTop.result,true,'Boat icon must be above every track, including its hit targets: '+JSON.stringify(iconOnTop));
  assert.equal(await page.locator('#routes .boat-marker').count(),0);
  await page.screenshot({path:'/tmp/sr2026-boats-close.png'});
  // Screen resizing must also refresh the geographic size without changing time.
  await page.setViewportSize({width:1200,height:850});await page.waitForTimeout(100);
  const resized=await zoom(.1);assert.ok(Math.abs(resized.beam-resized.expectedBeam)<.001);
  const marker=page.locator('.boat-marker');assert.equal(await marker.locator('.boat-name').textContent(),'Mercutio');
  await page.evaluate(()=>setPresentationMode(true));assert.equal(await page.locator('.boat-icon').count(),1);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({checks:'all boat dimensions, shared 8px per 2.54m minimum, physical beam and length, viewport resize, permanent names, presentation',wide,close,resized,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
