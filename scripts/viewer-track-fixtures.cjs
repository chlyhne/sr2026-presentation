module.exports=async function installTrackFixtures(page){
 await page.addInitScript(()=>{
  window.prepareTrackFixture=boat=>{
   trackProfileCache.set(boat.points,{
    samples:prepareProjectedTrack(boat),
    stations:packReferenceStations(prepareReferencePassages(boat).stations)
   });
   return boat;
  };
 });
};
