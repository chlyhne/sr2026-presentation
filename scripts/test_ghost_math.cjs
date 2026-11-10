const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context=vm.createContext({window:{}});
for(const name of ['data','boat-details','track-time','tracks','rhumbline-geometry','ghost-math'])vm.runInContext(fs.readFileSync(path.join(root,'viewer',name+'.js'),'utf8'),context);
const api=vm.runInContext('({prepareGhostClock,ghostClockAtSource,ghostSourceAtTime,trackPosition,boats:window.DATA.boats.map(boat=>({...boat,...boatDetails[boat.id]}))})',context);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} ≈ ${expected}`);
const boat=(start,finish,handicap)=>({raceStartTime:start,raceFinishTime:finish,handicapSecondsPerNm:handicap,courseLengthNm:10,
 points:[[11,55,start],[11,55.01,start+300],[11,55.02,start+600],[11,55.03,start+900],[11,55.04,finish]]});
const a=boat(0,1200,550),b=boat(300,1500,600),clockA=api.prepareGhostClock(a,600,650),clockB=api.prepareGhostClock(b,600,650);
near(clockA.end,2800);near(clockB.end,2300);
assert.ok(a.raceFinishTime<b.raceFinishTime&&clockA.end>clockB.end,'Staggered starts and handicap must reverse the raw finish order');
near(api.ghostClockAtSource(clockA,600),1700);near(api.ghostSourceAtTime(clockA,1700),600);
for(let t=clockA.start;t<=clockA.end;t+=.37){
 const source=api.ghostSourceAtTime(clockA,t);near(api.ghostClockAtSource(clockA,source),t);
 assert.ok(t>=source,'A slower ghost must never precede its original boat');
}
assert.equal(api.ghostSourceAtTime(clockA,clockA.start-1),null);
assert.equal(api.ghostSourceAtTime(clockA,clockA.end+1),null);
assert.match(api.prepareGhostClock({...a,raceFinishTime:null},600,650).error,/måltid/);
const longest=api.prepareGhostClock({...a,handicapSecondsPerNm:650},600,650);near(longest.end,1800);
// Changing sailed distance must not change the official ToD finish allowance.
const detour=api.prepareGhostClock({...a,points:a.points.map(([x,y,t],i)=>[x+(i===2?.1:0),y,t])},600,650);
near(detour.end,clockA.end);
// The official signal starts the clock even if the yacht waits behind the line.
const lateCrossing={...a,points:[[11,54.99,0],[11,54.99,300],[11,55,600],[11,55.01,900],[11,55.02,1200]]};
const lateClock=api.prepareGhostClock(lateCrossing,600,650);
near(api.ghostSourceAtTime(lateClock,600),0);
near(api.ghostClockAtSource(lateClock,300),900);
assert.ok(api.ghostClockAtSource(lateClock,600)>=1200,'Crossing the line must not reset the start clock');
const courses=new Map(),commonStart=Math.max(...api.boats.map(boat=>boat.raceStartTime));
for(const boat of api.boats){
 assert.equal(boat.courseLengthNm,{groensund:232,boegestroemmen:216}[boat.course],'Official distance must match the boat’s course');
 const course=courses.get(boat.course)||{handicap:0};
 course.handicap=Math.max(course.handicap,boat.handicapSecondsPerNm);courses.set(boat.course,course);
}
let prepared=0,unavailable=[];
for(const boat of api.boats){
 const course=courses.get(boat.course),clock=api.prepareGhostClock(boat,commonStart,course.handicap);
 if(clock.error){unavailable.push({boat:boat.name,error:clock.error});continue;}
 near(clock.start,commonStart);near(clock.times[0],commonStart);near(clock.sourceTimes[0],boat.raceStartTime);
 near(api.ghostSourceAtTime(clock,commonStart),boat.raceStartTime);
 near(clock.end,commonStart+boat.raceFinishTime-boat.raceStartTime+(course.handicap-boat.handicapSecondsPerNm)*boat.courseLengthNm);
 for(let i=1;i<clock.times.length;i++){assert.ok(clock.times[i]>clock.times[i-1]);assert.ok(clock.sourceTimes[i]>clock.sourceTimes[i-1]);}
 prepared++;
}
console.log(JSON.stringify({prepared,unavailable,checks:'own ToD handicap, official length, staggered starts, finish ordering, unchanged route, monotone precomputed clocks, inverse lookup and full fleet metadata'}));
