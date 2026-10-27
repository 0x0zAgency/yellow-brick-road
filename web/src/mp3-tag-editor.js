/** Browser-local ID3 editing. The established libraries decode/encode tags;
 * envelope checks bound work and refuse features we cannot safely round-trip.
 * No network, storage, mint, rights or Player operations belong in this module.
 */
export const MAX_MP3_BYTES=128*1024*1024;
export const MAX_TAG_BYTES=16*1024*1024;
export const TAG_FIELDS=[
 ['title','Title','TIT2'],['artist','Artist','TPE1'],['album','Album / release','TALB'],
 ['albumArtist','Album artist','TPE2'],['composer','Composer','TCOM'],['lyricist','Lyricist','TEXT'],
 ['songwriter','Songwriter','TXXX'],['genre','Genre','TCON'],['year','Year / date','TYER'],
 ['track','Track number / total','TRCK'],['disc','Disc number / total','TPOS'],['bpm','BPM','TBPM'],
 ['isrc','ISRC','TSRC'],['publisher','Publisher / label','TPUB'],['copyright','Copyright notice','TCOP'],
 ['comment','Comment','COMM'],['lyrics','Lyrics','USLT']
];
const asBytes=value=>value instanceof Uint8Array?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):new Uint8Array(value);
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const text=v=>typeof v==='string'?v:typeof v==='number'?String(v):'';
const safeError=message=>new Error(message); // Do not echo parser internals or private tag contents.
const sync=(b,i)=>(b[i]*2097152)+(b[i+1]*16384)+(b[i+2]*128)+b[i+3];
const rawSize=(b,i)=>b[i]*16777216+b[i+1]*65536+b[i+2]*256+b[i+3];
/** Bounds and flags only, not a tag-content parser. ID3 decoding stays in mp3tag.js. */
export function inspectEnvelope(input){
 const b=asBytes(input);if(b.length<4||b.length>MAX_MP3_BYTES)throw safeError('Choose an MP3 between 4 bytes and 128 MiB.');
 let start=0,version=3,reason='',hasV2=false;
 if(b[0]===73&&b[1]===68&&b[2]===51){
  hasV2=true;version=b[3];
  if(b.length<10||![2,3,4].includes(version)||b.slice(6,10).some(x=>x>127))throw safeError('Unsupported or damaged ID3 header. No file was changed.');
  start=10+sync(b,6)+(version===4&&(b[5]&16)?10:0);
  if(start>MAX_TAG_BYTES||start>=b.length)throw safeError('The ID3 tag is truncated or exceeds 16 MiB. No file was changed.');
  if(version===2||b[4]!==0||b[5]!==0)reason='Read-only: this file uses legacy or flagged ID3 features. Export is disabled to avoid losing metadata.';
  if(!reason){
   let at=10,frames=0;const singles=new Set();
   while(at<start&&b[at]!==0){
    if(at+10>start||++frames>4096)throw safeError('Invalid or oversized ID3 frame table.');
    const id=String.fromCharCode(...b.subarray(at,at+4));
    if(!/^[A-Z0-9]{4}$/.test(id)||(version===4&&b.slice(at+4,at+8).some(x=>x>127)))throw safeError('Invalid ID3 frame header.');
    const size=version===4?sync(b,at+4):rawSize(b,at+4);
    if(!size||at+10+size>start)throw safeError('Truncated ID3 frame. No file was changed.');
    if(b[at+8]||b[at+9])reason='Read-only: flagged, encrypted or compressed ID3 frames cannot be safely rewritten here.';
    if(singles.has(id)&&!['TXXX','WXXX','COMM','USLT','APIC','PRIV','UFID','GEOB','POPM'].includes(id))reason='Read-only: repeated ID3 frames require a specialist editor.';
    singles.add(id);at+=10+size;
   }
   if(b.subarray(at,start).some(x=>x!==0))throw safeError('Invalid ID3 padding. No file was changed.');
  }
 }
 const hasV1=b.length>=128&&String.fromCharCode(...b.subarray(b.length-128,b.length-125))==='TAG';
 const end=b.length-(hasV1?128:0);
 if(end<=start)throw safeError('No MPEG audio follows the tags.');
 // APE/Lyrics3 tails need coordinated edits to avoid old fields resurfacing.
 const tail=new TextDecoder('latin1').decode(b.subarray(Math.max(start,end-160),end));
 if(/APETAGEX|LYRICS200|LYRICSEND/.test(tail))reason='Read-only: APEv2 or Lyrics3 tags require coordinated editing in a specialist editor.';
 return {start,end,version,hasV1,hasV2,reason};
}
async function libraries(){const [{default:MP3Tag},{parseBuffer}]=await Promise.all([import('mp3tag.js'),import('music-metadata')]);return {MP3Tag,parseBuffer};}
const frameId=(field,version)=>field==='year'&&version===4?'TDRC':TAG_FIELDS.find(f=>f[0]===field)?.[2];
function values(tags,version,common={}){
 const v=tags.v2||{},v1=tags.v1||{},out={};
 const aliases={albumArtist:'albumartist'},old={TPE2:'TP2',TCOM:'TCM',TEXT:'TXT',TCON:'TCO',TYER:'TYE',TRCK:'TRK',TPOS:'TPA',TBPM:'TBP',TSRC:'TRC',TPUB:'TPB',TCOP:'TCR'};
 for(const [key] of TAG_FIELDS){const id=frameId(key,version),fallback=common[aliases[key]||key];out[key]=text(v[id]||v[old[id]]||v1[key]||(Array.isArray(fallback)?fallback.join('; '):fallback));}
 out.album=text(tags.album||common.album);out.title=text(tags.title||common.title);out.artist=text(tags.artist||common.artist);
 out.comment=text((v.COMM||v.COM)?.[0]?.text||v1.comment);out.lyrics=text((v.USLT||v.ULT)?.[0]?.text);
 out.songwriter=(v.TXXX||v.TXX||[]).filter(x=>/^songwriters?$|^writers?$/i.test(x?.description||'')).map(x=>text(x.text)).filter(Boolean).join('; ');
 return out;
}
function inventory(tags){return Object.entries(tags.v2||{}).slice(0,4096).map(([id,value])=>({id,summary:typeof value==='string'?value.slice(0,180):Array.isArray(value)?value.length+' item(s)':'Structured tag'}));}
function picture(tags){
 const entries=tags.v2?.APIC||tags.v2?.PIC||[],p=entries.find(p=>p.type===3)||entries[0];
 if(!p||!Array.isArray(p.data)||p.data.length>8*1024*1024)return null;
 const b=new Uint8Array(p.data);
 const mime=b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71?'image/png':b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':null;
 return mime?{bytes:b,mime}:null; // Never render SVG, external URLs or arbitrary embedded data.
}
async function load(buffer){
 const bytes=asBytes(buffer),envelope=inspectEnvelope(bytes),{MP3Tag,parseBuffer}=await libraries();
 let metadata,tags;
 try{metadata=await parseBuffer(bytes,{mimeType:'audio/mpeg'},{duration:false,skipCovers:true});}
 catch{throw safeError('This file could not be verified as an MP3. No file was changed.');}
 if(!/^MPEG/i.test(metadata.format.container||'')||!/layer\s*(?:3|iii)/i.test(metadata.format.codec||''))throw safeError('This tool edits MPEG Layer III MP3 files only.');
 try{tags=MP3Tag.readBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),{unsupported:true,mp4:false,aiff:false,aac:false});}
 catch{throw safeError('The ID3 tags could not be read safely. No file was changed.');}
 return {bytes,envelope,MP3Tag,tags,metadata};
}
export async function readMp3Tags(buffer){
 const {envelope,tags,metadata}=await load(buffer);
 return {fields:values(tags,envelope.version,metadata.common),frames:inventory(tags),picture:picture(tags),
  tagVersion:envelope.hasV2?'ID3v2.'+envelope.version:envelope.hasV1?'ID3v1':'No ID3 tags',
  legacy:envelope.hasV1,readOnly:!!envelope.reason,notice:envelope.reason,
  format:{codec:metadata.format.codec,sampleRate:metadata.format.sampleRate,channels:metadata.format.numberOfChannels},
  coverCount:(tags.v2?.APIC||tags.v2?.PIC||[]).length};
}
export function validateChanges(changes){
 if(!changes||typeof changes!=='object'||Array.isArray(changes))throw safeError('Invalid tag changes.');
 const allowed=TAG_FIELDS.map(x=>x[0]);
 for(const [key,value] of Object.entries(changes)){
  if(!allowed.includes(key)||typeof value!=='string'||value.length>(key==='lyrics'?64000:key==='comment'?8000:1024)||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw safeError('Invalid or oversized tag value.');
  if(!['lyrics','comment'].includes(key)&&/[\r\n]/.test(value))throw safeError('Only lyrics and comments support multiple lines.');
  if(key==='isrc'&&value&&!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(value))throw safeError('ISRC must contain 12 letters/digits without spaces or hyphens.');
  if(['track','disc'].includes(key)&&value&&!/^\d{1,4}(\/\d{1,4})?$/.test(value))throw safeError('Track and disc must use a number or number/total.');
  if(key==='bpm'&&value&&(!/^\d{1,4}$/.test(value)||Number(value)<1||Number(value)>1000))throw safeError('BPM must be a whole number between 1 and 1000.');
 }
 return changes;
}
function setText(v,id,value){if(value)v[id]=value;else delete v[id];}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
export async function writeMp3Tags(buffer,changes,{coverMode='keep',coverBytes=null}={}){
 validateChanges(changes);
 if(!['keep','replace','remove'].includes(coverMode))throw safeError('Invalid artwork action.');
 const {bytes,envelope,MP3Tag,tags}=await load(buffer);
 if(envelope.reason)throw safeError(envelope.reason);
 const v=structuredClone(tags.v2||{}),version=envelope.hasV2?envelope.version:3;
 // Migrate legacy descriptive tags before omitting the limited ID3v1 trailer.
 const v1=tags.v1||{};
 for(const key of ['title','artist','album','year','track','genre'])if(!v[frameId(key,version)]&&text(v1[key]))v[frameId(key,version)]=text(v1[key]);
 if(!v.COMM&&v1.comment)v.COMM=[{language:'eng',descriptor:'',text:text(v1.comment)}];
 for(const [key,value] of Object.entries(changes)){
  const id=frameId(key,version);
  if(key==='year'&&value&&!(version===3?/^\d{4}$/:/^\d{4}(-\d{2}(-\d{2})?)?$/).test(value))throw safeError(version===3?'ID3v2.3 requires a four-digit year.':'Use YYYY, YYYY-MM or YYYY-MM-DD.');
  if(key==='songwriter'){
   const retained=(v.TXXX||[]).filter(x=>!/^songwriters?$|^writers?$/i.test(x.description||''));
   if(value)retained.push({description:'SONGWRITER',text:value});
   if(retained.length)v.TXXX=retained;else delete v.TXXX;
  }else if(key==='comment'||key==='lyrics'){
   const frames=[...(v[id]||[])],prior=frames.shift()||{language:'eng',descriptor:''};
   if(value)frames.unshift({...prior,text:value});
   if(frames.length)v[id]=frames;else delete v[id];
  }else{
   setText(v,id,value);
   if(key==='album'&&v.TXXX){v.TXXX=v.TXXX.filter(x=>!/^album(?:[ _-]?(?:title|name))?$/i.test(x.description||''));if(!v.TXXX.length)delete v.TXXX;}
  }
 }
 if(coverMode!=='keep'){
  const others=(v.APIC||[]).filter(p=>p.type!==3);
  if(coverMode==='replace'){
   const b=asBytes(coverBytes||[]);
   if(!b.length||b.length>512*1024||![137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n))throw safeError('Choose a normalized PNG display copy no larger than 512 KiB.');
   others.unshift({format:'image/png',type:3,description:'Front cover',data:Array.from(b)});
  }
  if(others.length)v.APIC=others;else delete v.APIC;
 }
 const expected=JSON.stringify(canonical(v));
 let output,after;
 try{
  // Avoid uncounted padding in the pinned writer; source audio must stay byte-identical.
  output=asBytes(MP3Tag.writeBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),{v2:v},
   {strict:false,id3v1:{include:false},id3v2:{include:true,version,unsupported:true,padding:0,encoding:'utf-16'}}));
  after=MP3Tag.readBuffer(output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength),{unsupported:true});
 }catch{throw safeError('These tags cannot be exported safely. The original file is unchanged.');}
 const outEnvelope=inspectEnvelope(output);
 if(!equal(bytes.subarray(envelope.start,envelope.end),output.subarray(outEnvelope.start,outEnvelope.end)))throw safeError('Audio-byte verification failed. Export was blocked; the original is unchanged.');
 if(expected!==JSON.stringify(canonical(after.v2||{})))throw safeError('A metadata frame did not round-trip safely. Export was blocked to prevent tag loss.');
 return {bytes:output,fields:values(after,version),audioVerified:true,tagVersion:'ID3v2.'+version,legacyMigrated:envelope.hasV1};
}
export function updatedFilename(name){return (String(name||'audio').split(/[\\/]/).pop().replace(/\.mp3$/i,'').replace(/[\x00-\x1f\x7f]/g,'').slice(0,150)||'audio')+'-tagged.mp3';}
