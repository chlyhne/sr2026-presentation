const assert=require('node:assert/strict');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright'));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18516/');
  await page.waitForSelector('main:not([inert])',{timeout:60000});
  await page.evaluate(()=>{
   stopPlayback();notes=[];activePresentationNote=null;
   const check=(value,message)=>{if(!value)throw Error(message);};
   // Firefox desktop has no touch injection API. Exercise the real handlers
   // with touch coordinates; emulate capture ownership for these synthetic IDs.
   const captures=new Set(),originals=['setPointerCapture','hasPointerCapture','releasePointerCapture'].map(key=>[key,map[key]]);
   map.setPointerCapture=id=>captures.add(id);map.hasPointerCapture=id=>captures.has(id);map.releasePointerCapture=id=>captures.delete(id);
   const event=(type,id,x,primary=false)=>({type,pointerId:id,pointerType:'touch',isPrimary:primary,button:0,
    clientX:mapViewport().rect.left+x,clientY:mapViewport().rect.top+200,target:map,preventDefault(){}});
   const down=(id,x,primary=false)=>map.onpointerdown(event('pointerdown',id,x,primary));
   const move=(id,x)=>map.onpointermove(event('pointermove',id,x));
   const up=id=>map.onpointerup(event('pointerup',id,100));
   try{
    for(const limit of ['minimum','maximum']){
     view=[230,250,limit==='minimum'?.06:1700,100];setview();
     down(1,100,true);down(2,200);
     move(2,limit==='minimum'?600:101);
     const clamped=view[2];
     check(Math.abs(clamped-(limit==='minimum'?MIN_MAP_VIEW_WIDTH:MAX_MAP_VIEW_WIDTH))<1e-6,'Expected '+limit+' zoom limit');
     move(2,limit==='minimum'?590:102);
     check(limit==='minimum'?view[2]>clamped:view[2]<clamped,'Reversing at '+limit+' must zoom immediately');
     up(2);up(1);check(drag===null,'Lifted fingers must clear gesture');
    }
    for(let i=0;i<40;i++){
     down(1,100,true);down(2,200);move(2,400);move(2,160);
     map.onpointercancel(event('pointercancel',2,160));move(1,120);up(1);
     check(drag===null&&view.every(Number.isFinite),'Cancelled pinch must leave a finite camera and no active gesture');
    }
    down(1,100,true);down(2,200);
    down(3,100,true);down(4,200);const before=view[2];move(4,300);
    check(view[2]<before,'A fresh primary contact must replace stale fingers');
    window.dispatchEvent(new Event('blur'));
    check(drag===null&&!map.classList.contains('panning')&&captures.size===0,'Window blur must release the gesture');
    down(5,100,true);down(6,200);const resumed=view[2];move(6,300);up(6);up(5);
    check(view[2]<resumed,'Pinch must still work after interruption');
   }finally{
    for(const [key,original] of originals)map[key]=original;
   }
  });
  assert.deepEqual(errors,[]);
  console.log('Firefox: pinch reverses immediately at both zoom limits, repeated cancellation recovers, and fresh contacts/blur clear stale gestures.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
