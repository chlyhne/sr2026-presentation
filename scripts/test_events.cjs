const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{test}=require('node:test');
const catalog=JSON.parse(fs.readFileSync('viewer/events/catalog.json','utf8'));
const configs=new Map(catalog.events.map(e=>[e.id,JSON.parse(fs.readFileSync('viewer/events/'+e.id+'/event.json','utf8'))]));
function storage(){const values={};Object.defineProperties(values,{getItem:{value:k=>values[k]??null},setItem:{value:(k,v)=>{values[k]=String(v);}},removeItem:{value:k=>{delete values[k];}}});return values;}
async function load(id,shared){
 const select={replaceChildren(){},value:''},location={href:'http://localhost/?event='+id,search:'?event='+id};
 const context=vm.createContext({URL,URLSearchParams,Option:class{},window:{},localStorage:shared,location,noteNavigationAllowed:()=>true,document:{title:'',getElementById:key=>key==='eventSelect'?select:{firstChild:{textContent:''},textContent:''}},fetch:async file=>({ok:true,json:async()=>file==='events/catalog.json'?catalog:configs.get(file.split('/')[1])})});
 vm.runInContext(fs.readFileSync('viewer/event-selection.js','utf8'),context);await context.loadEventSelection();return {context,select,location};
}
test('stævner isolate storage and explicitly migrate existing Sjælland Rundt annotations',async()=>{
 const shared=storage();shared.setItem('sr2026-notes','existing events');
 const sj=await load(catalog.default,shared),silver=await load('silverrudder-2025',shared);
 assert.equal(vm.runInContext("eventStorage.getItem('sr2026-notes')",sj.context),'existing events');
 assert.equal(vm.runInContext("eventStorage.getItem('sr2026-notes')",silver.context),null);
 vm.runInContext("eventStorage.setItem('sr2026-notes','silver notes')",silver.context);
 assert.equal(vm.runInContext("eventStorage.getItem('sr2026-notes')",sj.context),'existing events');
 sj.select.value='silverrudder-2025';sj.select.onchange();assert.equal(new URL(sj.location.href).searchParams.get('event'),'silverrudder-2025');
 assert.equal(shared.getItem('sr2026-notes'),'existing events');
});
test('Silverrudder merges seven source races on one course, with distinct starts and one overlay',()=>{
 const event=configs.get('silverrudder-2025');assert.equal(event.source.races.length,7);assert.equal(Object.keys(event.courses).length,1);
 assert.equal(new Set(event.source.races.map(r=>r.id)).size,7);assert.equal(new Set(event.source.races.map(r=>r.start)).size,7);
 assert.equal(event.features.handicap,false);assert.equal(event.features.weather,false);
 for(const item of configs.values()){assert.equal(item.profileRoot,'events/'+item.id+'/track-profiles/');assert.ok(fs.existsSync(item.nativeFile));assert.ok(fs.existsSync(item.presentationFile));}
});
test('an unknown stævne produces an explicit error',async()=>{await assert.rejects(load('unknown',storage()),/Ukendt/);});
