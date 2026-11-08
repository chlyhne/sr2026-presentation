// Compare the browser's composited pixels, not readPixels from the GL buffer:
// foreignObject/canvas composition can shift a mathematically correct GL image.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
const presentation=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../presentation/presentation.json'),'utf8'));
const compare=String.raw`
import sys,json,io,base64
from PIL import Image,ImageChops,ImageFilter
data=json.load(sys.stdin)
def mask(encoded):
 im=Image.open(io.BytesIO(base64.b64decode(encoded))).convert('RGB')
 return ImageChops.difference(im,Image.new('RGB',im.size,(220,236,240))).convert('L').point(lambda n:255 if n>20 else 0)
gpu,svg=mask(data['gpu']),mask(data['svg'])
radius=max(1,round(1.5*data['dpr']))
def outside(a,b):
 return ImageChops.subtract(a,b.filter(ImageFilter.MaxFilter(2*radius+1))).histogram()[255]/max(1,a.histogram()[255])
ratios=[outside(gpu,svg),outside(svg,gpu)]
endpoints=[]
for x,y in data['endpoints']:
 r=max(1,round(.75*data['dpr']));x=round(x);y=round(y)
 endpoints.append(bool(gpu.crop((x-r,y-r,x+r+1,y+r+1)).getbbox()))
print(json.dumps({'mismatch':max(ratios),'endpoints':endpoints}))
`;
async function check(type,dpr){
 const browser=await type.launch({headless:process.env.SR_HEADLESS==='1'});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000},deviceScaleFactor:dpr}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.SR_TRACK_RENDERER='webgl');
  await page.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.SR_CONFIG={local:false,admin:false};'}));
  await page.route('**/presentation.json',r=>r.fulfill({json:presentation}));
  if(process.env.SR_TRACK_REV){
   const source=execFileSync('git',['show',process.env.SR_TRACK_REV+':viewer/track-renderer.js'],{encoding:'utf8'});
   await page.route('**/track-renderer.js',r=>r.fulfill({contentType:'application/javascript',body:source}));
  }
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');await page.waitForSelector('#onlineStatus',{state:'attached'});
  await page.evaluate(()=>{
   showPresentationEvent(6);hideMapEventImage();$('wind').checked=$('rain').checked=false;
   chosen.clear();chosen.add('Mercutio');
   for(const id of ['windField','land','precipitation','baseMap','winds','boatMarkers','places','seamarks','speedMarkers','noteDrawings','drawingPreview','annotations','mapCredit','trackSpeedLegend'])$(id).setAttribute('visibility','hidden');
  });
  let worst=0,cases=0;
  for(const fullscreen of [false,true]){
   if(fullscreen){await page.locator('#presentationFullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);}
   for(const [zoom,seconds] of [[1,0],[.73,.1],[1.17,10],[.43,40]]){
    const endpoints=await page.evaluate(({zoom,seconds})=>{
     if(!webglTracks.active)throw Error('GPU stopped: '+webglTracks.error);
     const boat=boats.find(b=>b.name==='Mercutio'),note=notes[6];selectedTime=note.time+seconds;
     const [x,y]=xy(trackPosition(boat.points,currentTime()).point),w=note.view[2]*zoom,h=note.view[3]*zoom;
     view=[x-w/2,y-h/2,w,h];$('map').setAttribute('viewBox',view.join(' '));render();webglTracks.render(currentTime(),webglTracks.order,true);
     const rect=$('map').getBoundingClientRect();
     return [...$('boatMarkers').querySelectorAll('.boat-marker')].map(marker=>{
      const m=marker.getScreenCTM();return [(m.e-rect.left)*devicePixelRatio,(m.f-rect.top)*devicePixelRatio];
     });
    },{zoom,seconds});
    const gpu=await page.locator('#map').screenshot();
    await page.evaluate(()=>{webglTracks.active=false;webglTracks.host.setAttribute('display','none');render();});
    const svg=await page.locator('#map').screenshot();
    const result=JSON.parse(execFileSync(process.env.SR_PYTHON||path.resolve(__dirname,'../.venv/bin/python'),['-c',compare],{
     input:JSON.stringify({gpu:gpu.toString('base64'),svg:svg.toString('base64'),dpr,endpoints}),encoding:'utf8'
    }));
    fs.writeFileSync('/tmp/sr2026-alignment-'+type.name()+'-gpu.png',gpu);
    fs.writeFileSync('/tmp/sr2026-alignment-'+type.name()+'-svg.png',svg);
    assert.ok(result.mismatch<.02,JSON.stringify({browser:type.name(),dpr,fullscreen,zoom,seconds,...result}));
    assert.ok(result.endpoints.length&&result.endpoints.every(Boolean),'Rendered track misses the SVG boat anchor');
    worst=Math.max(worst,result.mismatch);cases++;
    await page.evaluate(()=>{webglTracks.active=true;webglTracks.host.removeAttribute('display');render();webglTracks.render(currentTime(),webglTracks.order,true);});
   }
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:type.name(),dpr,cases,worstMismatch:worst,checks:'event 7 screenshot alignment against native SVG, boat endpoints, close zoom changes, fractional and forward time changes, fullscreen',errors}));
 }finally{await browser.close();}
}
(async()=>{for(const type of process.env.SR_TRACK_REV?[chromium]:[chromium,firefox])for(const dpr of process.env.SR_TRACK_REV?[1]:[1,2])await check(type,dpr);})().catch(e=>{console.error(e);process.exit(1)});
