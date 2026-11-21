const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('events/sjaelland-rundt-2026/',process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/').href);await page.waitForSelector('main:not([inert])',{timeout:120000});
  const result=await page.evaluate(()=>{
   const check=(condition,message)=>{if(!condition)throw Error(message);};
   const layer=$('winds'),firstHour=Math.ceil(D.start/3600)*3600+3600;
   window.checkWindGrid=()=>{
    const rect=$('map').getBoundingClientRect(),paths=[...layer.children];
    check(paths.length>8,'Wind layer did not populate');
    for(const path of paths){
     const {a,b,e,f}=path.getScreenCTM();
     const fixedGrid=offset=>Math.abs((offset-45)/90-Math.round((offset-45)/90))<.0001;
     check(fixedGrid(e-rect.left)&&fixedGrid(f-rect.top),'Wind barb is off the old 90-pixel grid');
     check(Math.abs(Math.hypot(a,b)-1)<.0001,'Wind barb scale changed with the map');
     check(path.tagName==='path'&&getComputedStyle(path).strokeWidth==='1.5px','Wind barb should use one 1.5-pixel path');
    }
   };
   setWindMode('mean');setCurrentTime(firstHour);render();checkWindGrid();
   const first=layer.firstElementChild,initial=[...layer.children];
   const observer=new MutationObserver(()=>{});
   observer.observe(layer,{childList:true,subtree:true,attributes:true});
   for(let i=1;i<=60;i++)renderWindBarbs(firstHour+i);
   check(observer.takeRecords().length===0,'Wind layer mutated during playback inside one hour');
   observer.disconnect();
   const before=[...layer.children].map(path=>path.getAttribute('d')+path.getAttribute('transform'));
   setCurrentTime(firstHour+3600);render();checkWindGrid();
   check(initial.every((path,index)=>path===layer.children[index]),'Hour change replaced wind paths');
   check(before.some((shape,index)=>shape!==initial[index].getAttribute('d')+initial[index].getAttribute('transform')),'Wind did not update for the next hour');
   setWindMode('off');renderWindBarbs();
   check(layer.getAttribute('visibility')==='hidden','Wind layer did not hide');
   setWindMode('mean');renderWindBarbs();
   check(layer.firstElementChild===first&&layer.getAttribute('visibility')==='visible','Wind toggle discarded paths');
   view=[view[0]+1,view[1]+1,view[2]*.8,view[3]*.8];setview();flushRender();
   check(layer.firstElementChild===first,'Pan or zoom rebuilt wind paths');
   checkWindGrid();
   return {checks:'grid spacing, stroke width, fixed size, hourly updates, no playback mutations, node reuse'};
  });
  const resized=await page.locator('#map').evaluate(e=>e.getBoundingClientRect().width);
  await page.setViewportSize({width:1200,height:850});
  await page.waitForFunction(previous=>$('map').getBoundingClientRect().width!==previous,resized);
  await page.evaluate(()=>{renderWindBarbs();checkWindGrid();});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...result,resize:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
