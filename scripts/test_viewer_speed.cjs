const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Validate every conversion against the raw decoded records, not just fixtures.
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../viewer/data.js'),'utf8'),sandbox);
for(const course of ['groensund','boegestroemmen']){
 const raw=JSON.parse(fs.readFileSync(path.resolve(__dirname,`../data/tractrac/speeds_${course}.json`),'utf8'));
 for(const boat of sandbox.window.DATA.boats.filter(b=>b.course===course)){
  const uid=boat.id.slice(course.length+1),lookup=new Map(raw.tracks[uid].map(p=>[p.slice(0,3).join(','),p[3]]));
  for(let i=0;i<boat.points.length;i++){
   const [lon,lat,t]=boat.points[i],value=lookup.get([lon,lat,t*1000].join(','));
   assert.equal(boat.speeds[i],value/1.852,'exact raw speed conversion for '+boat.id);
  }
 }
}
console.log('All native track speeds match their raw source conversion.');
