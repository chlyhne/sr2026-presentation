module.exports=async function installTrackFixtures(page){
 await page.addInitScript(()=>{
  window.prepareTrackFixture=boat=>{
   const {timeSamples,timeStations}=prepareTimeProfiles(boat);
   trackProfileCache.set(boat.points,{
    samples:prepareProjectedTrack(boat),
    stations:prepareReferenceProfile(boat),
    timeSamples:unpackTimeSamples(packTimeSamples(timeSamples),boat.points.length),
    timeStations:unpackTimeValues(packTimeValues(timeStations),timeStations.length)
   });
   return boat;
  };
 });
};
