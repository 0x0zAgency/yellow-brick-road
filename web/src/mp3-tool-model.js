/** Bounded tag envelopes and lossless frame assembly, not a text-tag codec.
 * Text decoding/encoding belongs to music-metadata and mp3tag.js.
 */
export const MAX_MP3_BYTES=64*1024*1024;
export const MAX_TAG_BYTES=8*1024*1024;
export const TAG_FIELDS=Object.freeze([
 ['title','Title','TIT2'],['artist','Artist','TPE1'],['album','Album','TALB'],
 ['albumArtist','Album artist','TPE2'],['songwriters','Songwriters','TXXX'],
 ['composer','Composers','TCOM'],['lyricist','Lyricists','TEXT'],['year','Year','TYER'],
 ['genre','Genre','TCON'],['track','Track / total','TRCK'],['disc','Disc / total','TPOS'],
 ['isrc','ISRC','TSRC'],['copyright','Copyright','TCOP']
].map(([key,label,frame])=>Object.freeze({key,label,frame})));
export const WRITER_LABELS=new Set(['SONGWRITER','SONGWRITERS','WRITER','WRITERS']);
export const writerLabel=v=>String(v??'').toUpperCase().replace(/[^A-Z]/g,'');
export const text=v=>Array.isArray(v)?v.map(text).filter(Boolean).join('; '):typeof v==='string'?v.replace(/\0/g,'').trim():typeof v==='number'?String(v):'';
export function checkedEdits(values){
 if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Invalid tag changes.');
 const result={};
 for(const [key,value] of Object.entries(values)){
  const field=TAG_FIELDS.find(f=>f.key===key);
  if(!field||typeof value!=='string'||value.length>2048||/[\x00-\x1f\x7f]/.test(value))throw Error('Use text of at most 2,048 characters per tag, without control characters.');
  const v=value.trim();
  if(key==='year'&&v&&!/^\d{4}$/.test(v))throw Error('Year must contain four digits, or be blank.');
  if(['track','disc'].includes(key)&&v){
   if(!/^\d{1,4}(\/\d{1,4})?$/.test(v))throw Error('Use a number or number/total for track and disc.');
   const [number,total]=v.split('/').map(Number);if(number<1||total===0||total<number)throw Error('Track/disc totals must not be smaller than the number.');
  }
  if(key==='isrc'&&v&&!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(v))throw Error('Use a 12-character ISRC without hyphens, or leave it blank.');
  result[key]=key==='isrc'?v.toUpperCase():v;
 }
 return result;
}
export const bytesEqual=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const ascii=(b,at,n)=>String.fromCharCode(...b.subarray(at,at+n));
const sync=(b,at)=>{
 if(b.subarray(at,at+4).length!==4||b.subarray(at,at+4).some(v=>v>127))throw Error('Invalid ID3 tag length.');
 return b[at]*2097152+b[at+1]*16384+b[at+2]*128+b[at+3];
};
export function tagHeader(version,size){
 if(![3,4].includes(version)||!Number.isSafeInteger(size)||size<0||size>MAX_TAG_BYTES)throw Error('Tag data exceeds the safe editing limit.');
 const h=new Uint8Array([73,68,51,version,0,0,0,0,0,0]);for(let i=9;i>=6;i--){h[i]=size&127;size=Math.floor(size/128);}return h;
}
export function concatBytes(parts){const n=parts.reduce((sum,p)=>sum+p.length,0),out=new Uint8Array(n);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
export function inspectEnvelope(input){
 const b=input instanceof Uint8Array?input:new Uint8Array(input);
 if(b.length<4||b.length>MAX_MP3_BYTES)throw Error('Choose an MP3 no larger than 64 MiB.');
 const legacy=b.length>=128&&ascii(b,b.length-128,3)==='TAG';
 const end=b.length-(legacy?128:0);let start=0,version=3,frames=[];
 if(ascii(b,0,3)==='ID3'){
  if(b.length<10)throw Error('Truncated ID3 header.');
  version=b[3];if(![3,4].includes(version))throw Error('This ID3 version is read-only here. Editing supports ID3v2.3 and ID3v2.4.');
  if(b[4]!==0||b[5]!==0)throw Error('This tag uses extended headers, unsynchronisation or footer flags. It is read-only to prevent data loss.');
  const size=sync(b,6);start=10+size;if(size>MAX_TAG_BYTES||start>end)throw Error('Truncated or oversized ID3 tag.');
  let at=10;
  while(at<start){
   if(b[at]===0){if(b.subarray(at,start).some(v=>v!==0))throw Error('Unexpected data after ID3 padding.');break;}
   if(at+10>start||frames.length>=2048)throw Error('Invalid or oversized ID3 frame list.');
   const id=ascii(b,at,4);if(!/^[A-Z0-9]{4}$/.test(id))throw Error('Invalid ID3 frame identifier.');
   const size=version===4?sync(b,at+4):new DataView(b.buffer,b.byteOffset+at+4,4).getUint32(0);
   if(!size||at+10+size>start)throw Error('Truncated ID3 frame.');
   if(b[at+8]||b[at+9]||['SEEK','CHAP','CTOC','ASPI','MLLT','RBUF','SIGN','ENCR','GRID','COMR'].includes(id))throw Error('This file contains flagged, signed or position-sensitive tags. It is read-only to preserve them.');
   frames.push({id,bytes:b.slice(at,at+10+size)});at+=10+size;
  }
 }
 if(ascii(b,Math.max(start,end-32),8)==='APETAGEX'||ascii(b,Math.max(start,end-9),9)==='LYRICS200'||ascii(b,Math.max(start,end-9),9)==='LYRICSEND')throw Error('Additional APE/Lyrics tags are read-only in this editor.');
 if(ascii(b,start,3)==='ID3')throw Error('Multiple ID3 tags are read-only in this editor.');
 return {version,start,end,legacy,frames,audio:b.subarray(start,end)};
}
export function buildEditedCopy(input,envelope,retained,replacements){
 const payload=concatBytes([...retained,...replacements].map(f=>f.bytes));
 const out=concatBytes([...(payload.length?[tagHeader(envelope.version,payload.length),payload]:[]),new Uint8Array(input).subarray(envelope.start,envelope.end)]);
 const after=inspectEnvelope(out);
 if(!bytesEqual(envelope.audio,after.audio))throw Error('Audio verification failed. No edited file was produced.');
 return out;
}
export function outputName(name){const base=String(name||'audio').split(/[\\/]/).pop().replace(/\.mp3$/i,'').replace(/[\x00-\x1f\x7f]/g,'').slice(0,180)||'audio';return base+'-tagged.mp3';}
