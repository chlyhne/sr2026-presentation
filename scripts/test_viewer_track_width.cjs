const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));
const measurePixels=String.raw`
import sys,json,io,math
from PIL import Image
im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB')
samples=json.loads(sys.argv[1]);out=[]
for sample in samples:
 bg=sample['background'];dark=sample['outline'];fill=sample['fill']
 a=dark[0]-bg[0];b=fill[0]-dark[0];c=dark[1]-bg[1];d=fill[1]-dark[1];det=a*d-b*c
 outer=inner=0
 for y in range(math.floor(sample['y'])-8,math.floor(sample['y'])+9):
  pixel=im.getpixel((round(sample['x']),y));r=pixel[0]-bg[0];g=pixel[1]-bg[1]
  outer+=max(0,min(1,(r*d-b*g)/det));inner+=max(0,min(1,(a*g-r*c)/det))
 out.append({'boat':sample['boat'],'outer':outer,'inner':inner})
print(json.dumps(out))
`;
async function check(type){
 const browser=await type.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(type===chromium)await page.addInitScript(()=>window.SR_TRACK_RENDERER='webgl');
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/');await page.waitForFunction(()=>typeof changeBoatSelection==='function');
  const names=await page.evaluate(()=>{
   const names=['Mercutio','Vera',boats.find(b=>!featured.has(b.name)).name];
   chosen.clear();notes=[];setPresentationMode(true);
   for(const [i,name] of names.entries()){
    const boat=boats.find(b=>b.name===name),y=465+i*10;
    const point=x=>[9.5+x*4.5/1000,57-y*3/1180];
    boat.points=[[...point(600),D.start+880],[...point(700),D.start+940]];boat.speeds=[7.5,7.5];boat.widthTestY=y;
   }
   $('wind').checked=$('rain').checked=false;
   for(const id of ['land','baseMap','places','seamarks','mapCredit','trackSpeedLegend'])$(id).setAttribute('visibility','hidden');
   return names;
  });
  async function zoom(width,y=475){await page.evaluate(({width,y})=>{view=[650-width/2,y-width/2,width,width];setview();selectedTime=D.start+1000;render();},{width,y});}
  // Add each boat at a different zoom, including a non-featured boat.
  for(const [i,width] of [80,2,20].entries()){
   await zoom(width);await page.evaluate(name=>changeBoatSelection(()=>chosen.add(name)),names[i]);
  }
  const measurements=[];
  async function measure(selectedNames){
   const samples=await page.evaluate(names=>names.map(name=>{
    const boat=boats.find(b=>b.name===name),screen=new DOMPoint(650,boat.widthTestY).matrixTransform($('map').getScreenCTM());
    const fill=TRACK_SPEED_COLOURS[speedBin(7.5)].match(/\d+/g).map(Number);
    return {boat:name,x:screen.x,y:screen.y,background:[220,236,240],outline:[23,49,62],fill};
   }),selectedNames);
   const png=await page.screenshot();
   fs.writeFileSync('/tmp/sr2026-track-width-'+type.name()+'.png',png);
   fs.writeFileSync('/tmp/sr2026-track-width-'+type.name()+'.json',JSON.stringify(samples));
   const measured=JSON.parse(execFileSync(process.env.SR_PYTHON||path.resolve(__dirname,'../.venv/bin/python'),['-c',measurePixels,JSON.stringify(samples)],{input:png}).toString());
   for(const m of measured){assert.ok(Math.abs(m.inner-2.7)<.25,JSON.stringify(m));assert.ok(Math.abs(m.outer-4.7)<.25,JSON.stringify(m));}
   measurements.push(...measured);
  }
  await zoom(80);await measure(names);
  for(const width of [20,8,2]){await zoom(width,465);await measure(['Mercutio']);}
  await zoom(80);await page.evaluate(name=>changeBoatSelection(()=>chosen.delete(name)),names[2]);
  await zoom(2);await page.evaluate(name=>changeBoatSelection(()=>chosen.add(name)),names[2]);
  await zoom(80);await measure(names);
  // Different subpixel alignments change raster antialiasing slightly, not stroke width.
  assert.ok(Math.max(...measurements.map(m=>m.outer))-Math.min(...measurements.map(m=>m.outer))<.35,JSON.stringify(measurements));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:type.name(),checks:'actual raster widths, boats added at different zooms, standard/additional boats, 40x zoom, remove/re-add',measurements,errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of [chromium,firefox])await check(type);})().catch(e=>{console.error(e);process.exit(1)});
