// Browser fixtures use the same GPU preparation as production.
module.exports=async function installTrackFixtures(page){
 await page.addInitScript(()=>{
  window.prepareTrackFixture=boat=>{
   if(webglTracks.preparation.legs!==rhumbRoute.legs){
    webglTracks.buffers.clear();webglTracks.preparation=new GPUTrackPreparation(webglTracks);webglTracks.comparisonReference=null;
   }
   webglTracks.prepare(boat);
   if(webglTracks.buffers.has(referenceBoat()?.points)&&boats.every(b=>webglTracks.buffers.has(b.points))){
    const temporary=!boats.includes(boat);if(temporary)boats.push(boat);
    try{webglTracks.comparisonReference=null;webglTracks.prepareComparison();}finally{if(temporary)boats.pop();}
   }
   return boat;
  };
 });
};
