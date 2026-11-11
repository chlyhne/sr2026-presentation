let replayResources=null;
async function loadReplayData(){
 const fail=message=>{throw Error('Sporenes 10-sekunders data kunne ikke indlæses: '+message);};
 const response=await fetch('track-profiles/manifest.json',{cache:'no-store'});
 if(!response.ok)fail('manifest ('+response.status+').');
 const manifest=await response.json();
 if(manifest?.version!==7||manifest.sampleSeconds!==TRACK_SAMPLE_SECONDS||manifest.replayEncoding!=='float32-local-xy-speed'
  ||manifest.byteOrder!=='little-endian'||!/^[a-f0-9]{64}$/.test(manifest.sourceFingerprint)
  ||manifest.dataFile!==`track-profiles/${manifest.sourceFingerprint}/data.json`
  ||manifest.bundleFile!==`track-profiles/${manifest.sourceFingerprint}/fleet.bin`
  ||!Array.isArray(manifest.replayOrigin)||manifest.replayOrigin.length!==2||!manifest.replayOrigin.every(Number.isFinite)
  ||!Number.isFinite(manifest.start)||!Number.isSafeInteger(manifest.bundleBytes)||manifest.bundleBytes<0||!Array.isArray(manifest.boats))fail('ugyldigt manifest. Genbyg dataene.');
 const [dataResponse,bundleResponse]=await Promise.all([fetch(manifest.dataFile),fetch(manifest.bundleFile)]);
 if(!dataResponse.ok||!bundleResponse.ok)fail('data eller sporfil mangler.');
 const [data,bundle]=await Promise.all([dataResponse.json(),bundleResponse.arrayBuffer()]);
 if(bundle.byteLength!==manifest.bundleBytes||data.start!==manifest.start||!Array.isArray(data.boats)||data.boats.length!==manifest.boats.length)fail('forkert filstørrelse eller bådantal.');
 const entries=new Map(manifest.boats.map(entry=>[entry.id,entry])),seen=new Set(),view=new DataView(bundle);
 for(const boat of data.boats){
  const entry=entries.get(boat.id);
  if(!entry||seen.has(boat.id)||!Number.isSafeInteger(entry.pointCount)||entry.pointCount<0
   ||!Number.isSafeInteger(entry.replayOffset)||entry.replayOffset<0||entry.sampleOffset!==entry.replayOffset+entry.pointCount*12
   ||entry.sampleOffset>bundle.byteLength||!Array.isArray(boat.trackSegments))fail('ugyldig båd eller sporposition.');
  seen.add(boat.id);
  const points=[],speeds=[];
  visitTrackSampleTimes(boat.trackSegments,manifest.start,time=>{
   const offset=entry.replayOffset+points.length*12;
   if(points.length>=entry.pointCount)fail('for mange tidspunkter.');
   const longitude=view.getFloat32(offset,true)+manifest.replayOrigin[0],latitude=view.getFloat32(offset+4,true)+manifest.replayOrigin[1],speed=view.getFloat32(offset+8,true);
   if(!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(latitude)||Math.abs(latitude)>=85||(!Number.isNaN(speed)&&(!Number.isFinite(speed)||speed<0)))fail('ugyldig position eller fart.');
   points.push([longitude,latitude,time]);speeds.push(Number.isNaN(speed)?null:speed);
  });
  if(points.length!==entry.pointCount)fail('forkert antal tidspunkter.');
  boat.points=points;boat.speeds=speeds;prepareTrackTimeIndex(points);
 }
 window.DATA=data;replayResources={manifest,bundle};
}
