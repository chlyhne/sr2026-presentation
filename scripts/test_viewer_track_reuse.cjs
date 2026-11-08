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
   chosen.clear();chosen.add('Mercutio');chosen.add('Vera');$('wind').checked=$('rain').checked=false;
   setCurrentTime(D.start+7200);render();
   const id=boats.find(b=>b.name==='Mercutio').id,layer=trackLayers.get(id);
   const refs={group:layer.group,outline:layer.outline,hit:layer.hit,bins:new Map(layer.speedPaths)};
   setCurrentTime(D.start+7200.1,{fractional:true});render();
   check(layer.group===refs.group&&layer.outline===refs.outline&&layer.hit===refs.hit,'Persistent track structure replaced');
   let reused=0;
   for(const [bin,node] of refs.bins)if(layer.speedPaths.has(bin)){check(layer.speedPaths.get(bin)===node,'Speed path replaced');reused++;}
   check(reused>1,'No speed paths were reused');
   // Compare complete outline lengths to the independently coloured cubic pieces.
   const svg=el('svg',{},document.body);
   const compare=(points,speeds,start,end)=>{
    const outline=el('path',{d:trackGeometry(points,start,end)},svg);
    const length=outline.getTotalLength();outline.remove();
    const coloured=trackSpeedGeometry(points,speeds,start,end);
    let total=0;
    for(const segment of coloured){const path=el('path',{d:segment.d},svg);total+=path.getTotalLength();path.remove();}
    check(Math.abs(length-total)<.02,'Cubic geometry changed');
   };
   const points=[[11,55,100],[11.01,55.007,160],[11.018,55.02,220],[11.03,55.021,280]];
   for(const [start,end] of [[100,280],[110,270],[150,220],[160,160],[220,279],[100,150]])compare(points,[3,5,8,4],start,end);
   const gap=[[11,55,100],[11.01,55.007,160],[11.02,55.02,620],[11.03,55.021,680]];
   compare(gap,[3,5,8,4],110,660);
   check((trackGeometry(gap,110,660).match(/M/g)||[]).length===2,'Gap was connected');
   const constant=[4,4,4,4];trackGeometry(points,110,270);trackSpeedGeometry(points,constant,110,270);
   const originalPiece=trackCurvePiece;let full=0,clipped=0;
   trackCurvePiece=(p,i,from,to,model)=>{if(from===p[i][2]&&to===p[i+1][2])full++;else clipped++;return originalPiece(p,i,from,to,model);};
   trackGeometry(points,111,271);trackSpeedGeometry(points,constant,111,271);trackCurvePiece=originalPiece;
   check(full===0&&clipped===4,'Unchanged full cubic segments were recalculated');
   const boat=boats.find(b=>b.id===id);
   prepareBoatTrack(boat);
   const warmedSpeed=trackSpeedCache.get(boat.points),warmedOutline=trackOutlineCache.get(boat.points);
   const cachedCount=warmedSpeed.intervals.size;check(cachedCount>1000,'Whole voyage not prepared');
   for(const delta of [40,4000,10000,-4000,0]){
    setCurrentTime(D.start+7200+delta);render();
    const rendered=trackLayers.get(id),t=currentTime();
    check(rendered.outline.getAttribute('d')===trackGeometry(boat.points,t-7200,t),'Stale outline after seeking');
    const expected=new Map(trackSpeedGeometry(boat.points,boat.speeds,t-7200,t).map(s=>[s.bin,s.d]));
    check(rendered.speedPaths.size===expected.size,'Stale colour paths after seeking');
    for(const [bin,d] of expected)check(rendered.speedPaths.get(bin).getAttribute('d')===d,'Stale colour geometry');
    check(trackSpeedCache.get(boat.points)===warmedSpeed&&warmedSpeed.intervals.size===cachedCount,'Prepared speed cache was reallocated or evicted');
    check(trackOutlineCache.get(boat.points)===warmedOutline&&warmedOutline.size===cachedCount,'Prepared outline cache was reallocated or evicted');
   }
   svg.remove();
   check($('routes').lastElementChild.dataset.boatLayer===id,'Mercutio is not on top');
   chosen.delete('Vera');render();check(trackLayers.size===1,'Deselected boat retained');
   chosen.clear();render();check(!trackLayers.size&&!$('routes').children.length,'Stale boats after clearing selection');
   chosen.add('Mercutio');render();check(trackLayers.size===1,'Boat failed to return');
   return {reusedSpeedPaths:reused,completeCurvesRecalculated:full,clippedCurvesRecalculated:clipped};
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:'SVG identity, clipped cubic fidelity, gaps, reverse seeks, whole-voyage preallocation, layer order and boat selection',...result,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
