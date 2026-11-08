const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[process.cwd(),path.resolve(__dirname,'../../racetimer')]}));
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SR_VIEWER_URL||'http://127.0.0.1:18097/');await page.waitForFunction(()=>typeof stopPlayback==='function');
  const result=await page.evaluate(()=>{
   const check=(ok,message)=>{if(!ok)throw Error(message);};
   const points=[[11,55,100],[11.01,55,160],[11,55,220],[11.01,55,280]],speeds=[1,10,1,10];
   prepareBoatTrack({points,speeds});
   const cache=trackSpeedCache.get(points),prepared=JSON.stringify([...cache.intervals]);
   // A moving tail used to change the order in which the colour buckets appeared.
   const a=trackSpeedGeometry(points,speeds,100,280),b=trackSpeedGeometry(points,speeds,130,280);
   const common=new Set(a.filter(s=>b.some(t=>s.bin===t.bin)).map(s=>s.bin));
   check(JSON.stringify(a.filter(s=>common.has(s.bin)).map(s=>s.bin))===JSON.stringify(b.filter(s=>common.has(s.bin)).map(s=>s.bin)),'Paint order changes as old data leaves');
   const fullInterval=cache.intervals.get(1);
   const geometry=trackSpeedGeometry(points,speeds,169.5,208.7);
   for(const part of fullInterval){
    const from=Math.max(169.5,part.from),to=Math.min(208.7,part.to);if(to<=from)continue;
    const bucket=geometry.find(s=>s.bin===part.bin);
    check(bucket&&bucket.colour===TRACK_SPEED_COLOURS[part.bin],'Clipping changed a prepared colour');
    check(bucket.d.includes(trackCurvePiece(points,1,from,to,getTrackModel(points))),'Clipping changed the cubic');
   }
   check(JSON.stringify([...cache.intervals])===prepared,'Clipping mutated the prepared segments');
   const boat=boats.find(b=>b.name==='Mercutio');prepareBoatTrack(boat);
   const originals={colouredTrackInterval,speedBin,trackSpeedColour};let calls=0;
   colouredTrackInterval=()=>{calls++;throw Error('Rebuilding colour intervals during playback');};
   speedBin=()=>{calls++;throw Error('Recalculating colour bins during playback');};
   trackSpeedColour=()=>{calls++;throw Error('Recalculating RGB during playback');};
   try{
    chosen.clear();chosen.add('Mercutio');$('wind').checked=$('rain').checked=false;
    setCurrentTime(D.start+7200);render();
    for(const offset of [.1,40,400,10000,500,0]){
     setCurrentTime(D.start+7200+offset,{fractional:true});render();
     const bins=[...trackLayers.get(boat.id).speedTrack.children].map(e=>+e.dataset.speedBin);
     check(bins.every((value,i)=>!i||bins[i-1]<value),'SVG paint order is unstable');
    }
   }finally{({colouredTrackInterval,speedBin,trackSpeedColour}=originals);}
   return {colourRecalculations:calls,checks:'prepared colours, clipped cubic geometry, immutable cached pieces, stable overlap order, forward/backward rendering'};
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...result,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
