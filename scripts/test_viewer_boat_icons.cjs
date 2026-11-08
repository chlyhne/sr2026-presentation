const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');
  await page.waitForFunction(()=>typeof notes!=='undefined'&&!!document.querySelector('.boat-icon'));
  const metadata=await page.evaluate(()=>boats.map(b=>({name:b.name,...b.dimensions})));
  for(const boat of metadata){
   const expected={mercutio:[8,2.54],vera:[8,2.54],my:[8,2.54],saltamalin:[8,2.54],
    'the hulk':[10.3,2.18],'rosa-lux':[10,3],alice:[8,2.51],moster:[7.77,2.5]}[boat.name.toLowerCase()];
   assert.equal(boat.lengthM,expected?expected[0]:10);assert.equal(boat.beamM,expected?expected[1]:3);
   assert.equal(!!boat.estimated,!expected);
  }
  async function zoom(width){return page.evaluate(width=>{
   const boat=boats.find(b=>b.name==='Mercutio');chosen.clear();chosen.add(boat.name);
   $('wind').checked=false;$('rain').checked=false;selectedTime=D.start+3600;
   const point=trackPosition(boat.points,selectedTime).point,[x,y]=xy(point);
   const height=width*.9;view=[x-width/2,y-height/2,width,height];$('map').setAttribute('viewBox',view.join(' '));render();
   const icon=document.querySelector('.boat-icon'),hull=icon.querySelector('path'),bbox=hull.getBBox(),m=hull.getScreenCTM();
   const beam=Math.hypot(m.a,m.b)*bbox.width,length=Math.hypot(m.c,m.d)*bbox.height;
   const c=+icon.dataset.course,latitude=point[1]*Math.PI/180,R=6371008.8,rad=Math.PI/180,map=$('map').getScreenCTM();
   const east=1000/(4.5*rad*R*Math.cos(latitude)),north=1180/(3*rad*R);
   const expectedBeam=2.54*Math.hypot(map.a*east*Math.cos(c)+map.c*north*Math.sin(c),map.b*east*Math.cos(c)+map.d*north*Math.sin(c));
   const expectedLength=8*Math.hypot(map.a*east*Math.sin(c)-map.c*north*Math.cos(c),map.b*east*Math.sin(c)-map.d*north*Math.cos(c));
   return {beam,length,expectedBeam,expectedLength};
  },width);}
  const wide=await zoom(10);assert.ok(Math.abs(wide.beam-8)<.001);
  await page.screenshot({path:'/tmp/sr2026-boats-wide.png'});
  const close=await zoom(.1);assert.ok(close.beam>8);assert.ok(Math.abs(close.beam-close.expectedBeam)<.001);assert.ok(Math.abs(close.length-close.expectedLength)<.001);
  await page.screenshot({path:'/tmp/sr2026-boats-close.png'});
  // Screen resizing must also refresh the geographic size without changing time.
  await page.setViewportSize({width:1200,height:850});await page.waitForTimeout(100);
  const resized=await zoom(.1);assert.ok(Math.abs(resized.beam-resized.expectedBeam)<.001);
  const marker=page.locator('.boat-marker');await marker.focus();const pressed=await marker.getAttribute('aria-pressed');await page.keyboard.press('Enter');assert.notEqual(await page.locator('.boat-marker').getAttribute('aria-pressed'),pressed);
  await page.evaluate(()=>setPresentationMode(true));assert.equal(await page.locator('.boat-icon').count(),1);
  const download=page.waitForEvent('download');await page.evaluate(()=>captureMap());await(await download).saveAs('/tmp/sr2026-boats-export.png');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({checks:'all boat dimensions, 8px minimum, physical beam and length, viewport resize, name toggle, presentation, PNG export',wide,close,resized,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
