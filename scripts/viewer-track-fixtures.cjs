module.exports=async function installTrackFixtures(page){
 await page.addInitScript(()=>{
  window.prepareTrackFixture=boat=>{
   trackProfileCache.set(boat.points,{
    samples:prepareProjectedTrack(boat),
    stations:prepareReferenceProfile(boat)
   });
   return boat;
  };
 });
};
