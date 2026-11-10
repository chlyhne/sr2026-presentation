// Preserve the speed field decoded by TracTrac's own cached MTB worker.
// Separate records retain exact source coordinates/timestamps for validation.
import fs from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.length&&(args.length!==2||args[0]!=='--data-dir'))throw Error('Usage: node scripts/collect_track_speeds.mjs [--data-dir DIRECTORY]');
const dir=args.length?path.resolve(args[1]):path.join(root,'data/tractrac');
async function collect(course){
 const race=JSON.parse(fs.readFileSync(path.join(dir,`race_${course}.json`),'utf8'));
 const uri=race.parameters['stored-uri'].all;
 const params={uri:[uri.startsWith('//')?'https:'+uri:uri],isLive:false,
  dataTypes:[0x12,0x13,0x19,0x1b,0x14,0x1a,0x22,0x23,0x26],
  eventType:'a1b74ca0-fdd8-11dc-8811-005056c00008',loadSnapping:[false],liveTime:null,
  dontLoadPositions:false,trackingStartTime:Date.parse(race.raceTrackingStartTime),
  synchronizeTimes:true,controlPoints:{},forceToLoadAllData:true,classes:null,competitorIds:null,
  syncData:{routes:{},controls:{},competitors:[{}],timeOffsets:[0]},sensorData:false};
 return await new Promise((resolve,reject)=>{
  const worker=new Worker(path.join(dir,'worker_node.mjs'),{type:'module'}),tracks={};
  let finished=false,endTimer;
  const timeout=setTimeout(()=>finish('timeout'),240000);
  function finish(reason){
   if(finished)return;finished=true;clearTimeout(timeout);clearTimeout(endTimer);worker.terminate();
   if(!['stored-end','connection-stopped'].includes(reason)){reject(new Error(`${course}: ${reason}`));return;}
   const output={reason,point_columns:['longitude','latitude','timestamp_ms','speed_raw','direction_raw'],tracks};
   fs.writeFileSync(path.join(dir,`speeds_${course}.json`),JSON.stringify(output));
   console.log(`${course}: ${Object.keys(tracks).length} tracks; ${Object.values(tracks).reduce((n,p)=>n+p.length,0)} speed records`);
   resolve(output);
  }
  worker.on('error',error=>finish(error.message));
  worker.on('message',msg=>{
   if(msg.message==='m')worker.postMessage({message:'q',params});
   if(msg.message==='l')for(const [id,p] of msg.positions||[]){
    if(![p.longitude,p.latitude,p.timestamp].every(Number.isFinite))continue;
    (tracks[id]??=[]).push([p.longitude,p.latitude,p.timestamp,Number.isFinite(p.speed)?p.speed:null,Number.isFinite(p.direction)?p.direction:null]);
   }
   if(msg.message==='c')endTimer=setTimeout(()=>finish('stored-end'),500);
   if(msg.message==='h')finish('connection-stopped');
   if(msg.message==='d')console.error(msg.error);
  });
 });
}
for(const course of ['groensund','boegestroemmen'])await collect(course);
