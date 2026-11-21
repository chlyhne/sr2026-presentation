const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{gunzipSync}=require('node:zlib');
const root=path.resolve(__dirname,'..');
const event=require('../viewer/events/catalog.json').events.find(e=>e.id==='sjaelland-rundt-2026');
const {boats}=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,event.nativeFile))));
for(const course of Object.keys(event.courses)){
 const raw=JSON.parse(fs.readFileSync(path.join(root,`data/tractrac/speeds_${course}.json`),'utf8'));
 for(const boat of boats.filter(b=>b.course===course)){
  const uid=boat.id.slice(course.length+1),lookup=new Map(raw.tracks[uid].map(p=>[p.slice(0,3).join(','),p[3]]));
  for(const [lon,lat,time,speed] of boat.points){
   const key=[lon,lat,time].join(',');
   assert.ok(lookup.has(key),'Missing source observation for '+boat.id);
   assert.equal(speed,lookup.get(key),'Native speed must match the raw measurement for '+boat.id);
  }
 }
}
console.log('All native track speeds match the decoded raw measurements.');
