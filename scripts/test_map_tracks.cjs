const assert=require('node:assert/strict'),{test}=require('node:test');
const {mapTrackLimits,prefixCurve}=require('./export_map_tracks.cjs');
const source={competitors:{one:{nameShort:'One'},two:{nameShort:'Two'}},tracks:{one:[],two:[]}};
test('map exclusions identify boats and use explicit local dates without modifying source tracks',()=>{
 const config={version:1,scope:'map-simplification-only',boats:[{id:'one',name:'One',excludeAll:true},{id:'two',name:'Two',excludeAfter:'2026-06-12T08:00:00+02:00'}]};
 const before=JSON.stringify(source),limits=mapTrackLimits(source,config);
 assert.equal(limits.get('one'),-Infinity);
 assert.equal(limits.get('two'),Date.parse('2026-06-12T06:00:00Z')/1000);
 assert.equal(JSON.stringify(source),before);
});
test('map exclusions reject ambiguous boat identities and dates without timezone',()=>{
 const config=rule=>({version:1,scope:'map-simplification-only',boats:[rule]});
 assert.throws(()=>mapTrackLimits(source,config({id:'one',name:'Other',excludeAll:true})),/identify/);
 assert.throws(()=>mapTrackLimits(source,config({id:'two',name:'Two',excludeAfter:'2026-06-12T08:00:00'})),/timezone/);
});
test('clipping a curve at the exclusion time preserves its earlier positions',()=>{
 const original=[[0,0],[2,3],[4,-2],[8,1]],cut=.37,clipped=prefixCurve(...original,cut);
 const value=(p,t)=>p[0].map((_,i)=>(1-t)**3*p[0][i]+3*(1-t)**2*t*p[1][i]+3*(1-t)*t*t*p[2][i]+t**3*p[3][i]);
 for(const u of [0,.2,.5,1]){
  const expected=value(original,u*cut),actual=value(clipped,u);
  assert.ok(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<1e-12);
 }
});
