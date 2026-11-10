const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context=vm.createContext({window:{},$:()=>({addEventListener(){}})});
vm.runInContext(fs.readFileSync(root+'/viewer/data.js','utf8'),context);
vm.runInContext(`const D=window.DATA,boats=D.boats,ghostClocks=new Map();
function mapBoundsIntersect(a,b){return a.east>=b.west&&a.west<=b.east&&a.north>=b.south&&a.south<=b.north;}`,context);
vm.runInContext(fs.readFileSync(root+'/viewer/tracks.js','utf8'),context);
vm.runInContext(fs.readFileSync(root+'/viewer/timeline.js','utf8'),context);
// The previous flat index is the differential oracle.
vm.runInContext(`
const legacyBlocks=new WeakMap();
function legacyVisibleBoatRanges(points,bounds){
 if(!legacyBlocks.has(points)){
  const blocks=[];
  for(let start=0;start<points.length;start+=128){
   const end=Math.min(points.length,start+128);let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
   for(let i=start;i<Math.min(points.length,end+1);i++){
    const [lon,lat]=points[i];west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);
   }blocks.push({start,end,west,east,south,north});
  }legacyBlocks.set(points,blocks);
 }
 const ranges=[];
 for(const block of legacyBlocks.get(points)){
  if(!mapBoundsIntersect(block,bounds))continue;
  if(points[block.end-1][2]+300<D.start||points[block.start][2]>D.end)continue;
  for(let i=block.start;i<block.end;i++){
   const [lon,lat,time]=points[i],next=points[i+1];let from=time,to;
   if(next&&next[2]>time&&next[2]-time<=TRACK_MAX_GAP){
    const interval=trackIntervalInBounds(points,i,bounds);if(!interval)continue;from=interval.start;to=interval.end;
   }else{
    if(lon<bounds.west||lon>bounds.east||lat<bounds.south||lat>bounds.north)continue;
    to=Math.min(time+TRACK_MAX_GAP,next?next[2]-1e-6:D.end);
   }
   const start=Math.max(D.start,Math.ceil(from-1e-6)),end=Math.min(D.end,Math.floor(to+1e-6));if(start>end)continue;
   const previous=ranges.at(-1);if(previous&&start<=previous.end+1)previous.end=Math.max(previous.end,end);else ranges.push({start,end});
  }
 }return ranges;
}`,context);
const api=vm.runInContext('({D,visibleBoatRanges,legacyVisibleBoatRanges,prepareTimelineTrack})',context);
let queries=0;
function compare(points,bounds,label){
 const expected=api.legacyVisibleBoatRanges(points,bounds),actual=api.visibleBoatRanges(points,bounds);queries++;
 assert.equal(JSON.stringify(actual),JSON.stringify(expected),label+' '+JSON.stringify(bounds));
}
const start=api.D.start,end=api.D.end;
const fixtures=[[],[[11,55,start+100]],
 [[10,55,start+100],[12,55,start+200]], // Crossing without a source point inside.
 [[11,55,start-10],[11,55,start+10],[11,55,end-10],[11,55,end+10]],
 [[11,55,start+.2],[11.1,55,start+.8],[11.2,55,start+1.2]],
 Array.from({length:129},(_,i)=>[11+i*.001,55,start+i*60]),
 Array.from({length:257},(_,i)=>[11+Math.sin(i*.3),55+Math.cos(i*.3),start+i*(i%7?301:300)]).sort((a,b)=>a[2]-b[2]),
 [[11,55,start+100],[11,55,start+100],[11.1,55,start+200],[12,56,start+1000],[12,56,start+1060]]];
let seed=123456;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(let test=0;test<12;test++){
 let t=start-200,x=11,y=55;const points=[];
 for(let i=0;i<300;i++){t+=random()<.1?600:1+random()*120;x+=(random()-.5)*.05;y+=(random()-.5)*.05;points.push([x,y,t]);}
 fixtures.push(points);
}
const boxes=[{west:0,east:20,south:0,north:90},{west:0,east:1,south:0,north:1},
 {west:10.8,east:11.2,south:54.8,north:55.2},{west:11,east:11,south:55,north:55}];
for(let i=0;i<30;i++){const x=10+random()*3,y=54+random()*3,w=random()*.5,h=random()*.5;boxes.push({west:x,east:x+w,south:y,north:y+h});}
for(const [i,points] of fixtures.entries())for(const box of boxes)compare(points,box,'fixture '+i);
const presentation=JSON.parse(fs.readFileSync(root+'/presentation/presentation.json','utf8'));
const views=[[140,220,800,900],[0,0,1000,1180],...presentation.notes.filter(n=>n.view).map(n=>n.view)];
const fleetBoxes=views.map(([x,y,w,h])=>({west:9.5+x*4.5/1000,east:9.5+(x+w)*4.5/1000,south:57-(y+h)*3/1180,north:57-y*3/1180}));
for(const boat of api.D.boats)for(const box of fleetBoxes)compare(boat.points,box,boat.name);
// An accepted root must not read observations or perform cubic clipping again.
let reads=0;
const guarded=new Proxy(fixtures[5],{get(target,key){if(/^\d+$/.test(String(key)))reads++;return Reflect.get(target,key);}});
const index=api.prepareTimelineTrack(guarded);reads=0;
assert.equal(api.visibleBoatRanges(guarded,boxes[0]),index.ranges);
assert.equal(api.visibleBoatRanges(guarded,boxes[1]).length,0);assert.equal(reads,0);
// Partial queries and merging other boats must not mutate cached intervals.
const snapshot=JSON.stringify(index.ranges);for(const box of boxes)compare(guarded,box,'cache immutability');
assert.equal(JSON.stringify(index.ranges),snapshot);
console.log(JSON.stringify({boats:api.D.boats.length,queries,checks:'exact legacy intervals, published views, cubic crossings, integer rounding, gaps, duplicates, empty tracks, root fast paths, immutable cache'}));
