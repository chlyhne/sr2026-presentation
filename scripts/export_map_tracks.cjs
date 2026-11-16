// Export the nominal PCHIP voyage as metre-space segments with a bounded
// flattening error. Reuse the app's interpolation model; do not bridge gaps.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const METRES=6371000*Math.PI/180,SCALE=[METRES*Math.cos(55*Math.PI/180),METRES];
function mapTrackLimits(source,config){
 if(config.version!==1||config.scope!=='map-simplification-only'||!Array.isArray(config.boats))throw Error('Invalid map track exclusions');
 const limits=new Map();
 for(const rule of config.boats){
  if(limits.has(rule.id)||source.competitors[rule.id]?.nameShort!==rule.name||!source.tracks[rule.id])throw Error('Map exclusion does not identify exactly one boat: '+rule.name);
  const limit=rule.excludeAll===true?-Infinity:Date.parse(rule.excludeAfter)/1000;
  if(limit!==-Infinity&&(!Number.isFinite(limit)||!/T\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(rule.excludeAfter)))throw Error('Map exclusion requires an explicit date and timezone: '+rule.name);
  limits.set(rule.id,limit);
 }
 return limits;
}
function prefixCurve(a,b,c,d,u){
 const mix=(p,q)=>p.map((v,i)=>v+(q[i]-v)*u),ab=mix(a,b),bc=mix(b,c),cd=mix(c,d),abc=mix(ab,bc),bcd=mix(bc,cd);
 return [a,ab,abc,mix(abc,bcd)];
}
function exportMapTracks(filename,error=.1){
 const context=vm.createContext({});
 vm.runInContext(fs.readFileSync(path.join(ROOT,'viewer/tracks.js'),'utf8'),context);
 const {getTrackModel,TRACK_MAX_GAP}=vm.runInContext('({getTrackModel,TRACK_MAX_GAP})',context);
 const source=JSON.parse(fs.readFileSync(path.join(ROOT,'data/tractrac/combined_tracks.json'),'utf8'));
 const config=JSON.parse(fs.readFileSync(path.join(ROOT,'data/geography/map-track-exclusions.json'),'utf8'));
 const limits=mapTrackLimits(source,config);
 const segments=[],project=p=>[p[0]*SCALE[0],p[1]*SCALE[1]],mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
 const distance=(p,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
 };
 const flatten=(a,b,c,d,depth=0)=>{
  if(Math.max(distance(b,a,d),distance(c,a,d))<=error){segments.push(...a,...d);return;}
  if(depth>=30)throw Error('Track curve could not be flattened within tolerance');
  const ab=mid(a,b),bc=mid(b,c),cd=mid(c,d),abc=mid(ab,bc),bcd=mid(bc,cd),center=mid(abc,bcd);
  flatten(a,ab,abc,center,depth+1);flatten(center,bcd,cd,d,depth+1);
 };
 let excludedPoints=0;
 for(const [id,raw] of Object.entries(source.tracks)){
  const limit=limits.get(id)??Infinity;
  excludedPoints+=raw.filter(p=>p[2]/1000>limit).length;
  if(limit===-Infinity)continue;
  const points=raw.map(p=>[p[0],p[1],p[2]/1000]),model=getTrackModel(points);
  for(let i=0;i<points.length;i++){
   if(points[i][2]>limit)break;
   const a=project(points[i]),next=points[i+1],h=next?next[2]-points[i][2]:0;
   if(h>0&&h<=TRACK_MAX_GAP){
    const d=project(next),b=a.map((v,axis)=>v+model.slopes[axis][i]*h*SCALE[axis]/3);
    const c=d.map((v,axis)=>v-model.slopes[axis][i+1]*h*SCALE[axis]/3);
    const u=Math.min(1,(limit-points[i][2])/h);
    // Keep the original model slopes, then clip both nominal presentations
    // at the exact timestamp. Never reconnect across an excluded interval.
    flatten(...prefixCurve(a,b,c,d,u));
    // Also protect the explicitly supported straight-segment phone display.
    segments.push(...a,...a.map((v,axis)=>v+(d[axis]-v)*u));
   }else segments.push(...a,...a);
  }
 }
 const values=new Float64Array(segments);fs.writeFileSync(filename,Buffer.from(values.buffer));
 console.log(`Distance index: ${values.length/4} track segments; curve error <= ${error} m; ${excludedPoints} source observations excluded by explicit rules`);
}
if(require.main===module)exportMapTracks(process.argv[2]);
module.exports={exportMapTracks,mapTrackLimits,prefixCurve};
