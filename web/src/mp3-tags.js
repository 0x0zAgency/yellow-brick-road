/** Minimal, defensive ID3v2.3/v2.4 importer. Never treats embedded credits as verified ownership. */
const frameNames={TIT2:'title',TPE1:'artist',TALB:'release',TCON:'genre',TBPM:'bpm',TKEY:'key',TSRC:'isrc'};
const synchsafe=(b,i)=>((b[i]&127)<<21)|((b[i+1]&127)<<14)|((b[i+2]&127)<<7)|(b[i+3]&127);
const int32=(b,i)=>((b[i]*16777216)+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3]);
function decode(b,encoding){try{return new TextDecoder(encoding===1?'utf-16':encoding===2?'utf-16be':encoding===3?'utf-8':'iso-8859-1').decode(b).replace(/\0/g,'').trim()}catch{return ''}}
function readArt(body){
 const encoding=body[0];if(encoding>3)return null;
 let i=1;while(i<body.length&&body[i])i++;if(i>=body.length)return null;
 const mime=new TextDecoder().decode(body.slice(1,i)).toLowerCase();i++;
 if(i>=body.length)return null;i++; // picture type
 if(encoding===1||encoding===2){while(i+1<body.length&&(body[i]!==0||body[i+1]!==0))i+=2;i+=2}
 else {while(i<body.length&&body[i])i++;i++}
 if(!['image/jpeg','image/png','image/webp'].includes(mime)||i>=body.length||body.length-i>10*1024*1024)return null;
 return {mime,bytes:body.slice(i)};
}
export function extractId3(buffer){
 const b=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
 const result={fields:{},artwork:null};
 if(b.length<10||String.fromCharCode(...b.slice(0,3))!=='ID3'||![3,4].includes(b[3]))return result;
 if(b[5]&0x80)return result; // unsynchronisation needs a separate decoder
 const end=Math.min(b.length,10+synchsafe(b,6));let i=10;let scanned=0;
 while(i+10<=end&&scanned++<2000){
  const id=String.fromCharCode(...b.slice(i,i+4));if(!/^[A-Z0-9]{4}$/.test(id))break;
  const size=b[3]===4?synchsafe(b,i+4):int32(b,i+4);i+=10;
  if(!size||size>end-i)break;
  const body=b.subarray(i,i+size);i+=size;
  const field=frameNames[id];
  if(field&&body.length>1){const value=decode(body.subarray(1),body[0]);if(value)result.fields[field]=value.slice(0,240)}
  if(id==='APIC'&&!result.artwork)result.artwork=readArt(body);
 }
 return result;
}
