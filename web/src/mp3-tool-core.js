import {parseBuffer} from 'music-metadata';
import MP3Tag from 'mp3tag.js';
import {audioAlbum} from './upload-metadata.js';
import {TAG_FIELDS,MAX_MP3_BYTES,WRITER_LABELS,writerLabel,text,checkedEdits,tagHeader,concatBytes,inspectEnvelope,buildEditedCopy,outputName} from './mp3-tool-model.js';
const emptyAudio=()=>{const b=new Uint8Array(417*3);for(let i=0;i<3;i++)b.set([255,251,144,100],417*i);return b;};
const rawRead=b=>MP3Tag.readBuffer(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),{unsupported:true,mp4:false,aiff:false,aac:false});
function frameValue(frame,version){return rawRead(concatBytes([tagHeader(version,frame.bytes.length),frame.bytes,emptyAudio()])).v2?.[frame.id];}
function songwriterFrame(frame,version){return frame.id==='TXXX'&&(frameValue(frame,version)||[]).some(x=>WRITER_LABELS.has(writerLabel(x.description)));}
function nativeValue(metadata,id){for(const [type,tags] of Object.entries(metadata.native||{}))if(type.startsWith('ID3v2')){const found=tags.filter(t=>t.id===id).map(t=>text(t.value)).filter(Boolean);if(found.length)return found.join('; ');}return '';}
function valuesFor(metadata){
 const c=metadata.common||{},writers=[];
 for(const tags of Object.values(metadata.native||{}))for(const tag of tags)if(/^TXXX:/i.test(tag.id)&&WRITER_LABELS.has(writerLabel(tag.id.slice(5))))writers.push(text(tag.value));
 const values={title:text(c.title),artist:text(c.artist),album:audioAlbum(metadata),albumArtist:text(c.albumartist),songwriters:[...new Set(writers.filter(Boolean))].join('; '),composer:text(c.composer),lyricist:text(c.lyricist),year:text(c.year),genre:text(c.genre),track:c.track?.no?String(c.track.no)+(c.track.of?'/'+c.track.of:''):'',disc:c.disk?.no?String(c.disk.no)+(c.disk.of?'/'+c.disk.of:''):'',isrc:text(c.isrc),copyright:text(c.copyright)};
 for(const f of TAG_FIELDS)if(f.key!=='songwriters'&&f.key!=='year')values[f.key]=nativeValue(metadata,f.frame)||values[f.key];
 return values;
}
const summaryValue=v=>{
 if(v==null)return '';
 if(typeof v==='string'||typeof v==='number')return String(v).replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').slice(0,600);
 if(ArrayBuffer.isView(v))return `[${v.byteLength} binary bytes]`;
 if(Array.isArray(v))return v.slice(0,8).map(summaryValue).join('; ');
 if(typeof v==='object')return Object.entries(v).slice(0,8).map(([k,x])=>k+': '+(k==='data'?'[binary data]':summaryValue(x))).join(' · ');
 return '';
};
async function parse(bytes){
 const m=await parseBuffer(bytes,{mimeType:'audio/mpeg',size:bytes.length},{duration:false,skipCovers:false});
 if(!/MPEG/i.test(m.format.container||'')||!/Layer 3|MP3/i.test(m.format.codec||''))throw Error('This file is not a supported MPEG Layer III MP3.');
 return m;
}
export async function readMp3(file){
 if(!file||file.size<4||file.size>MAX_MP3_BYTES)throw Error('Choose an MP3 no larger than 64 MiB.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 let metadata;try{metadata=await parse(bytes);}catch{throw Error('Could not read this MP3. The file may be malformed or use another audio format.');}
 let layout,readOnly='';try{layout=inspectEnvelope(bytes);}catch(e){readOnly=e.message;}
 if((metadata.format.tagTypes||[]).some(t=>!/^ID3v(1|2\.[234])$/.test(t)))readOnly='Additional tag formats are read-only to prevent conflicting or lost tags.';
 const all=Object.entries(metadata.native||{}).flatMap(([format,tags])=>tags.map(t=>({format,id:t.id,value:summaryValue(t.value)})));
 const picture=metadata.common.picture?.find(p=>['image/jpeg','image/png','image/webp'].includes(p.format)&&p.data.length<=4*1024*1024);
 return {bytes,metadata,layout,view:{name:file.name||'audio.mp3',size:bytes.length,fields:valuesFor(metadata),readOnly,legacy:!!layout?.legacy,
  version:layout?.version||null,formats:metadata.format.tagTypes||[],codec:metadata.format.codec,sampleRate:metadata.format.sampleRate,channels:metadata.format.numberOfChannels,
  tags:all.slice(0,200),tagCount:all.length,picture:picture?{format:picture.format,data:picture.data}:null,pictureCount:metadata.common.picture?.length||0}};
}
function encodeFrames(values,version){
 if(!Object.keys(values).length)return [];
 const m=new MP3Tag(emptyAudio().buffer);m.tags={v2:values};
 m.save({strict:true,id3v1:{include:false},id3v2:{include:true,version,padding:0,unsupported:false,unsynch:false,encoding:version===3?'utf-16':'utf-8'}});
 if(m.error)throw Error('The tag writer could not encode these changes. No output was produced.');
 return inspectEnvelope(new Uint8Array(m.buffer)).frames;
}
/** Losslessly retain unedited v2 frames, including unknown frames and APIC bytes.
 * Only new/edited text frames go through the standard library encoder.
 */
export async function updateMp3(file,requested,{migrateLegacy=false}={}){
 const edits=checkedEdits(requested),source=await readMp3(file),{bytes,layout,view,metadata}=source;
 if(view.readOnly)throw Error(view.readOnly);
 if(!Object.keys(edits).length)throw Error('Change at least one tag before preparing a copy.');
 if(layout.legacy&&!migrateLegacy)throw Error('Approve converting the legacy ID3v1 tag before exporting.');
 const edited=new Set(Object.keys(edits)),fields={...view.fields,...edits},values={},remove=new Set();
 for(const field of TAG_FIELDS){
  const id=field.key==='year'&&layout.version===4?'TDRC':field.frame;
  const missing=!layout.frames.some(f=>f.id===id);
  // Promote every ID3v1 descriptive field before dropping its conflicting trailer.
  const migrate=layout.legacy&&missing&&['title','artist','album','year','genre','track'].includes(field.key);
  if(!edited.has(field.key)&&!migrate)continue;
  if(field.key==='songwriters'){if(fields.songwriters)values.TXXX=[{description:'SONGWRITER',text:fields.songwriters}];continue;}
  remove.add(id);if(field.key==='year'){remove.add('TYER');remove.add('TDRC');}
  if(fields[field.key])values[id]=fields[field.key];
 }
 if(layout.legacy){
  const comment=(metadata.native?.ID3v1||[]).find(t=>t.id==='comment')?.value;
  if(text(comment)){
   const existing=layout.frames.filter(f=>f.id==='COMM');
   if(!existing.length)values.COMM=[{language:'eng',descriptor:'',text:text(comment)}];
   else if(!existing.some(f=>(frameValue(f,layout.version)||[]).some(c=>text(c.text)===text(comment))))throw Error('The legacy comment conflicts with existing ID3v2 comments. This copy was not exported.');
  }
 }
 const retained=layout.frames.filter(f=>!remove.has(f.id)&&!(edited.has('songwriters')&&songwriterFrame(f,layout.version)));
 const replacements=encodeFrames(values,layout.version);
 const output=buildEditedCopy(bytes,layout,retained,replacements);
 const check=rawRead(output),encoded=rawRead(concatBytes([tagHeader(layout.version,replacements.reduce((n,f)=>n+f.bytes.length,0)),...replacements.map(f=>f.bytes),emptyAudio()]));
 for(const [id,value] of Object.entries(encoded.v2||{})){
  if(id==='TXXX'){
   const writer=(check.v2?.TXXX||[]).find(x=>x.description==='SONGWRITER');if(writer?.text!==values.TXXX[0].text)throw Error('Songwriter verification failed. No file was exported.');
  }else if(JSON.stringify(check.v2?.[id])!==JSON.stringify(value))throw Error('Tag verification failed. No file was exported.');
 }
 const reread=await parse(output);
 const expected=Object.keys(edits).filter(k=>!['songwriters','composer','lyricist','genre','isrc'].includes(k));
 const after=valuesFor(reread);for(const key of expected)if(text(after[key])!==text(edits[key]))throw Error('A conflicting tag prevents verifying '+key+'. No file was exported.');
 const digest=await crypto.subtle.digest('SHA-256',layout.audio),audioHash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 return {buffer:output.buffer,name:outputName(file.name),audioHash,fields:after,keptFrames:retained.length,changedFields:Object.keys(edits),legacyConverted:layout.legacy};
}
