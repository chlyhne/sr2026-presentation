const assert=require('node:assert/strict'),path=require('node:path');
const {firefox}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{
 paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]
}));

(async()=>{
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const base=process.env.SR_VIEWER_URL||'http://127.0.0.1:8097/';
  await page.goto(new URL('events/sjaelland-rundt-2026/',base).href);
  await page.waitForSelector('main:not([inert])',{timeout:120000});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>{
   syncTimelineViewport();
   const start=D.start+3600,range={start,end:start+1000};
   visibleTimeRanges=boatTimeRanges=[range];
   timelineLength=1001;
   notes=[5.4,174,683.7,995].map(delta=>({time:start+delta,text:'Snap fixture'}));
   const slider=$('time');
   slider.min=0;slider.max=1000;slider.step=1;slider.disabled=false;
   renderTimelineEvents();
  });

  for(let index=0;index<4;index++){
   const state=await page.evaluate(index=>{
    const note=notes[index],offset=Math.round(offsetAtTime(note.time));
    $('time').value=String(offset+(index<3?3:-3));
    $('time').dispatchEvent(new Event('input',{bubbles:true}));
    return {time:currentTime(),eventTime:note.time,offset:+$('time').value,expectedOffset:offset};
   },index);
   assert.equal(state.time,state.eventTime,'Snapping keeps the exact event time');
   assert.equal(state.offset,state.expectedOffset,'The handle uses the corresponding whole-second slider position');
   const slider=page.locator('#timelineTrack'),marker=page.locator('.timeline-event').nth(index);
   const [trackBox,markBox]=await Promise.all([slider.boundingBox(),marker.boundingBox()]);
   const png=await slider.screenshot({scale:'css'});
   const thumb=await page.evaluate(async png=>{
    const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    const pixels=ctx.getImageData(0,0,img.width,img.height).data;
    let left=img.width,right=-1;
    for(let offset=0;offset<pixels.length;offset+=4){
     if(pixels[offset]!==53||pixels[offset+1]!==68||pixels[offset+2]!==80)continue;
     const x=offset/4%img.width;
     left=Math.min(left,x);right=Math.max(right,x);
    }
    return right<0?null:(left+right+1)/2;
   },png.toString('base64'));
   assert.notEqual(thumb,null,'The actual Firefox thumb is visible in the screenshot');
   const mark=markBox.x+markBox.width/2-trackBox.x;
   assert.ok(Math.abs(mark-thumb)<=1,`Event ${index+1}: marker at ${mark}, thumb at ${thumb}`);
  }

  const contrasts=await page.evaluate(()=>{
   const luminance=color=>{
    const rgb=color.match(/[\d.]+/g).slice(0,3).map(value=>Number(value)/255);
    const [r,g,b]=rgb.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
    return .2126*r+.7152*g+.0722*b;
   };
   return [
    ['viewerLoadingStage','viewerLoading'],['presentationMessage','presentationFooter'],['imageCropHelp','imageCropDialog'],
    ['inlineTextStatus','eventPanel'],['windPeriod','mapLayersPanel']
   ].map(([label,surface])=>{
    const text=luminance(getComputedStyle($(label)).color),background=luminance(getComputedStyle($(surface)).backgroundColor);
    return [label,(Math.max(text,background)+.05)/(Math.min(text,background)+.05)];
   });
  });
  for(const [label,ratio] of contrasts)assert.ok(ratio>=4.5,`${label} contrast: ${ratio.toFixed(2)}:1`);
  assert.equal(await page.locator('#reset').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Firefox: aligned markers and rendered thumb at four positions, exact fractional snap times and readable status text.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
