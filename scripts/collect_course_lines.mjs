// Decode the course control positions with TracTrac's own cached MTB worker.
import fs from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'data/tractrac');
async function collect(course){
 const race=JSON.parse(fs.readFileSync(path.join(dir,`race_${course}.json`),'utf8'));
 const uri=race.parameters['stored-uri'].controls;
 const source=uri.startsWith('//')?'https:'+uri:uri;
 const params={uri:[source],isLive:false,dataTypes:[0x14,0x1a],
  eventType:'a1b74ca0-fdd8-11dc-8811-005056c00008',loadSnapping:[false],liveTime:null,
  dontLoadPositions:false,trackingStartTime:Date.parse(race.raceTrackingStartTime),
  synchronizeTimes:true,controlPoints:{},forceToLoadAllData:true,classes:null,competitorIds:null,
  syncData:{routes:{},controls:{},competitors:[{}],timeOffsets:[0]},sensorData:false};
 await new Promise((resolve,reject)=>{
  const worker=new Worker(path.join(dir,'worker_node.mjs'),{type:'module'}),positions=[];
  let finished=false,endTimer;
  const timeout=setTimeout(()=>finish('timeout'),120000);
  function finish(reason){
   if(finished)return;finished=true;clearTimeout(timeout);clearTimeout(endTimer);worker.terminate();
   if(!['stored-end','connection-stopped'].includes(reason)){reject(new Error(`${course}: ${reason}`));return;}
   fs.writeFileSync(path.join(dir,`controls_${course}.json`),JSON.stringify({source,reason,positions}));
   console.log(`${course}: ${positions.length} control positions; ${[...new Set(positions.map(p=>p[0]))].join(', ')}`);resolve();
  }
  worker.on('error',error=>finish(error.message));
  worker.on('message',msg=>{
   if(msg.message==='m')worker.postMessage({message:'q',params});
   if(msg.message==='k')positions.push(...msg.positions||[]);
   if(msg.message==='c')endTimer=setTimeout(()=>finish('stored-end'),500);
   if(msg.message==='h')finish('connection-stopped');
   if(msg.message==='d')console.error(msg.error);
  });
 });
}
for(const course of ['groensund','boegestroemmen'])await collect(course);
