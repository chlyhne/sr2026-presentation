const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');
  await page.waitForFunction(()=>typeof trackSpeedGeometry==='function');
  const result=await page.evaluate(()=>{
   const checks=[];
   function check(ok,message){if(!ok)throw new Error(message);checks.push(message);}
   check(trackSpeedColour(0)==='rgb(0,0,128)','jet starts dark blue');
   check(trackSpeedColour(7.5)==='rgb(128,255,128)','jet midpoint');
   check(trackSpeedColour(15)==='rgb(128,0,0)','jet ends dark red');
   check(trackSpeedColour(40)===trackSpeedColour(15),'saturation at 15 knots');
   check(trackSpeedColour(null)===TRACK_SPEED_MISSING,'missing speed stays unknown');
   // Identical positions with nonzero source speeds prove no position derivative is used.
   const fixed=[[11,55,100],[11,55,160]];
   const slow=trackSpeedGeometry(fixed,[2,2],100,160),fast=trackSpeedGeometry(fixed,[12,12],100,160);
   check(slow.length===1&&fast.length===1&&slow[0].colour!==fast[0].colour,'source speed determines colour independently of positions');
   const capped=trackSpeedGeometry(fixed,[16,35],100,160);
   check(capped.length===1&&capped[0].bin===TRACK_SPEED_BINS-1,'all high speeds share saturated colour');
   check(trackSpeedGeometry(fixed,[null,5],100,160).filter(s=>s.d.includes('C')).every(s=>s.bin===-1),'no fabricated speeds at missing endpoints');
   const gap=[[11,55,100],[12,56,500]];
   check(trackSpeedGeometry(gap,[4,8],100,500).every(s=>!s.d.includes('C')),'track gaps remain disconnected');
   const moving=[[11,55,100],[11.01,55.01,160],[11.02,55.015,220]];
   const coloured=trackSpeedGeometry(moving,[0,15,7.5],110,210);
   check(coloured.length>100,'recorded speed interpolates through the jet scale');
   const svg=el('svg',{},document.body),original=el('path',{d:trackGeometry(moving,110,210)},svg);
   const total=coloured.reduce((sum,s)=>sum+el('path',{d:s.d},svg).getTotalLength(),0);
   check(Math.abs(total-original.getTotalLength())<.01,'splitting preserves the clipped cubic geometry');svg.remove();
   let count=0;
   for(const b of boats){check(b.speeds.length===b.points.length,'source speed aligned: '+b.name);count+=b.speeds.length;}
   check(count===730370&&D.track_speed_metadata.valid_speeds===count,'all 730370 positions have matched native speeds');
   check(D.track_speed_metadata.finite_difference===false,'no finite difference in data pipeline');
   const b=boats.find(b=>b.name==='Mercutio');
   const i=b.points.findIndex((p,i)=>p[2]>D.start+26*3600&&b.speeds[i]>4);
   chosen.clear();chosen.add('Mercutio');view=[230,250,620,760];
   $('wind').checked=$('rain').checked=false;setview();selectedTime=b.points[i][2];render();
   check($('routes').querySelectorAll('[data-colouring="sog-jet"] path').length>1,'real tracks render multiple speed colours');
   check($('routes').querySelector('.boat-dot').getAttribute('fill')===colours.Mercutio,'boat marker keeps identity colour');
   check([...$('routes').querySelectorAll('[data-colouring="sog-jet"] path')].every(p=>p.getAttribute('vector-effect')==='non-scaling-stroke'),'speed strokes keep fixed screen width');
   return {checks:checks.length,count,time:currentTime()};
  });
  assert.equal(await page.locator('#trackSpeedLegend').textContent().then(t=>t.includes('15+')),true);
  const before=await page.locator('#routes [data-colouring="sog-jet"]').getAttribute('data-boat-id');
  await page.mouse.move(900,450);await page.mouse.wheel(0,-180);await page.waitForTimeout(100);
  assert.equal(await page.locator('#routes [data-colouring="sog-jet"]').getAttribute('data-boat-id'),before);
  await page.evaluate(()=>{
   notes=[{time:currentTime(),text:'Fartfarvede spor',view:[...view],settings:sceneSettings()}];
   showNotes();setPresentationMode(true);
   const serialize=XMLSerializer.prototype.serializeToString;
   XMLSerializer.prototype.serializeToString=function(node){const xml=serialize.call(this,node);window.exportedSpeedSVG=xml;return xml;};
  });
  assert.equal(await page.locator('#trackSpeedLegend').isVisible(),true);
  const dl=page.waitForEvent('download');await page.evaluate(()=>captureMap());
  await(await dl).saveAs('/tmp/sr2026-track-speed-'+type.name()+'-map.png');
  const exported=await page.evaluate(()=>{
   const doc=new DOMParser().parseFromString(exportedSpeedSVG,'image/svg+xml');
   return {legend:!!doc.querySelector('#trackSpeedLegend'),stops:doc.querySelectorAll('#trackSpeedJetGradient stop').length,
    colours:new Set([...doc.querySelectorAll('[data-colouring="sog-jet"] path')].map(p=>p.getAttribute('stroke'))).size};
  });
  assert.equal(exported.legend,true);assert.equal(exported.stops,129);assert.ok(exported.colours>1);
  await page.screenshot({path:'/tmp/sr2026-track-speed-'+type.name()+'.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),...result,exported,errors}));
 }finally{await browser.close();}
}
// Validate every conversion against the raw decoded records, not just fixtures.
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../viewer/data.js'),'utf8'),sandbox);
for(const course of ['groensund','boegestroemmen']){
 const raw=JSON.parse(fs.readFileSync(path.resolve(__dirname,`../data/tractrac/speeds_${course}.json`),'utf8'));
 for(const boat of sandbox.window.DATA.boats.filter(b=>b.course===course)){
  const uid=boat.id.slice(course.length+1),lookup=new Map(raw.tracks[uid].map(p=>[p.slice(0,3).join(','),p[3]]));
  for(let i=0;i<boat.points.length;i++){
   const [lon,lat,t]=boat.points[i],value=lookup.get([lon,lat,t*1000].join(','));
   assert.equal(boat.speeds[i],value/1.852,'exact raw speed conversion for '+boat.id);
  }
 }
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
