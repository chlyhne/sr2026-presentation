// Lossless XOR and byte planes per numeric lane, followed by outer gzip.
// Decoding consumes the supplied buffer in place; returned arrays share it.
function preparedArrayPlanes(bytes,width,lanes,decode=false){
 const source=decode?bytes.slice():bytes,result=decode?bytes:new Uint8Array(bytes.length),count=bytes.length/width;
 let at=0;
 for(let lane=0;lane<lanes;lane++)for(let byte=0;byte<width;byte++){
  let previous=0;
  for(let i=lane;i<count;i+=lanes){
   if(decode){previous^=source[at++];result[i*width+byte]=previous;}
   else{const value=source[i*width+byte];result[at++]=value^previous;previous=value;}
  }
 }
 return result;
}
function packPreparedTracks(kind,entries){
 const header={version:2,encoding:'xor-byteplanes-v1',kind,entries:[]},chunks=[];let offset=0;
 for(const entry of entries){
  const arrays={};
  for(const [name,value] of Object.entries(entry.arrays)){
   if(!ArrayBuffer.isView(value)||!['Float32Array','Int32Array','Float64Array','Uint32Array'].includes(value.constructor.name))throw Error('Unsupported prepared track array');
   const lanes=name.endsWith('_samples')?3:1;if(value.length%lanes)throw Error('Invalid prepared track lane count');
   offset=Math.ceil(offset/8)*8;arrays[name]={type:value.constructor.name,offset,length:value.length,lanes};
   chunks.push({offset,bytes:preparedArrayPlanes(new Uint8Array(value.buffer,value.byteOffset,value.byteLength),value.BYTES_PER_ELEMENT,lanes)});offset+=value.byteLength;
  }
  header.entries.push({id:entry.id,record:entry.record,arrays});
 }
 const json=new TextEncoder().encode(JSON.stringify(header)),start=Math.ceil((4+json.byteLength)/8)*8,bytes=new Uint8Array(start+offset);
 new DataView(bytes.buffer).setUint32(0,json.byteLength,true);bytes.set(json,4);
 for(const chunk of chunks)bytes.set(chunk.bytes,start+chunk.offset);
 return bytes;
}
function unpackPreparedTracks(buffer,kind){
 if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1)throw Error('Prepared track files require little-endian storage.');
 if(buffer.byteLength<4)throw Error('Den forberedte sporfil er afkortet.');
 const length=new DataView(buffer).getUint32(0,true),start=Math.ceil((4+length)/8)*8;
 if(!length||start>buffer.byteLength)throw Error('Den forberedte sporfils header er ugyldig.');
 const header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(buffer,4,length)));
 if(header?.version!==2||header.encoding!=='xor-byteplanes-v1'||header.kind!==kind||!Array.isArray(header.entries))throw Error('Den forberedte sporfil har forkert format eller type.');
 const entries=new Map();let expected=0;
 for(const entry of header.entries){
  if(typeof entry.id!=='string'||entries.has(entry.id)||!entry.arrays||typeof entry.arrays!=='object')throw Error('Den forberedte sporfil har ugyldige båddata.');
  const arrays={};
  for(const [name,descriptor] of Object.entries(entry.arrays)){
   const {offset,length,type,lanes}=descriptor,Type={Float32Array,Int32Array,Float64Array,Uint32Array}[type];expected=Math.ceil(expected/8)*8;
   if(![1,3].includes(lanes)||!Number.isSafeInteger(length)||length<0||length%lanes||offset!==expected||!Type||!Number.isSafeInteger(length*Type.BYTES_PER_ELEMENT)||start+offset+length*Type.BYTES_PER_ELEMENT>buffer.byteLength)throw Error('Den forberedte sporfil har ugyldige bytegrænser.');
   preparedArrayPlanes(new Uint8Array(buffer,start+offset,length*Type.BYTES_PER_ELEMENT),Type.BYTES_PER_ELEMENT,lanes,true);
   arrays[name]=new Type(buffer,start+offset,length);expected+=length*Type.BYTES_PER_ELEMENT;
  }
  entries.set(entry.id,{record:entry.record,arrays});
 }
 if(start+expected!==buffer.byteLength)throw Error('Den forberedte sporfil har forkert størrelse.');
 return entries;
}
