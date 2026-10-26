/** Local descriptive metadata adapters. Embedded tags are suggestions, never rights proof.
 * All types have a filename fallback; parsers are added per format, not guessed.
 * No fetch, transcription, key collection, licensing inference, or GPS import.
 */
import {normalizeMusicGenre} from './music-genres.js';
export const MAX_UPLOAD_BYTES=256*1024*1024;
export const FORM_FIELDS=Object.freeze(['title','artist','release','songwriters','genre','bpm','key','isrc','iswc','description','daw']);
const AUDIO=/\.(mp3|mp2|wav|wave|bwf|flac|aif|aiff|aifc|ogg|oga|opus|m4a|m4b|mp4|aac|webm|mkv|wma|ape|wv|dsf|dff)$/i;
const IMAGE=/\.(jpe?g|png|tiff?|heic|heif|avif)$/i;
const clean=(value,max=1024)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,max):'';
const array=value=>Array.isArray(value)?value:typeof value==='string'?[value]:[];
const names=value=>Array.isArray(value)?value.slice(0,64).map(v=>clean(v)).filter(Boolean).join(', '):clean(value);
export function filenameTitle(filename){
 const basename=String(filename||'').split(/[\\/]/).at(-1)||'';
 const title=basename.replace(/\.[a-z0-9]{1,16}$/i,'').replace(/_+/g,' ').replace(/\s+/g,' ').trim();
 return clean(title||basename||'Untitled',240);
}
export function baselineMetadata(file){
 return {fields:{title:filenameTitle(file?.name)},fieldSources:{title:'filename'},
  technical:{name:clean(file?.name,512),mimeType:clean(file?.type,127)||'application/octet-stream',byteLength:file?.size||0},
  parser:'filename',notice:''};
}
export function normalizeFields(raw={}){
 const out={};
 for(const field of FORM_FIELDS){
  let value=clean(typeof raw[field]==='number'?String(raw[field]):raw[field],field==='description'?8000:1024);
  if(!value)continue;
  if(field==='title')value=value.slice(0,240);
  if(field==='genre'){value=normalizeMusicGenre(value);if(!value)continue;}
  if(field==='bpm'&&(!Number.isFinite(Number(value))||Number(value)<=0||Number(value)>1000))continue;
  if(field==='isrc'){value=value.replace(/[-\s]/g,'').toUpperCase();if(!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value))continue;}
  out[field]=value;
 }
 return out;
}
function apply(result,raw,parser){
 const fields=normalizeFields(raw);
 Object.assign(result.fields,fields);
 for(const key of Object.keys(fields))result.fieldSources[key]=parser;
 result.parser=parser;
}
function nativeAudioTexts(metadata,ids){
 const accepted=new Set(ids),values=[];
 for(const [type,tags] of Object.entries(metadata?.native||{}).slice(0,16)){
  if(!/^ID3v2\.[234]$/.test(type)||!Array.isArray(tags))continue;
  for(const tag of tags.slice(0,4096)){
   const id=String(tag?.id||'').trim().toUpperCase();
   if(accepted.has(id))values.push(...array(tag.value));
  }
 }
 return values.filter(value=>typeof value==='string').map(value=>clean(value)).filter(Boolean);
}
/** Album title only, never album artist, grouping, sort title or a filename guess.
 * Standard/native tags backfill empty common tags; explicit custom album labels
 * are a last resort. Keep the existing parser responsible for byte decoding.
 */
export function audioAlbum(metadata){
 const first=values=>values.map(value=>clean(value)).find(Boolean)||'';
 const common=first(array(metadata?.common?.album));if(common)return common;
 const standard=[],custom=[],legacy=[];
 for(const [type,tags] of Object.entries(metadata?.native||{}).slice(0,16)){
  if(!Array.isArray(tags))continue;
  for(const tag of tags.slice(0,4096)){
   const id=String(tag?.id||'').trim().toUpperCase();
   const values=array(tag?.value).slice(0,64);
   if(/^ID3v2\.[234]$/.test(type)){
    if(id==='TALB'||id==='TAL')standard.push(...values);
    else if(/^TXXX:ALBUM(?:[ _-]?(?:TITLE|NAME))?$/.test(id))custom.push(...values);
   }else if(/^(?:ID3v1|APEv2)$/i.test(type)&&id==='ALBUM')legacy.push(...values);
  }
 }
 return first(standard)||first(custom)||first(legacy);
}
function writerNames(values){
 const seen=new Set(),out=[];
 for(const raw of values.slice(0,256)){
  if(typeof raw!=='string')continue;
  for(const part of raw.split(/[\u0000;]+/)){
   const value=clean(part).normalize('NFC').replace(/\s+/g,' '),key=value.toLowerCase();
   if(value&&!seen.has(key)){seen.add(key);out.push(value);}
  }
 }
 return out.slice(0,64).join(', ');
}
export function audioSuggestions(metadata){
 const c=metadata?.common||{};
 const composers=array(c.composer).filter(v=>typeof v==='string'&&v.trim());
 const lyricists=array(c.lyricist).filter(v=>typeof v==='string'&&v.trim());
 const writers=[...(composers.length?composers:nativeAudioTexts(metadata,['TCOM','TCM'])),
  ...(lyricists.length?lyricists:nativeAudioTexts(metadata,['TEXT','TXT'])),...array(c.writer),
  ...nativeAudioTexts(metadata,['TXXX:WRITER','TXXX:WRITERS','TXXX:SONGWRITER','TXXX:SONGWRITERS'])];
 return {title:c.title,artist:c.artist||names(c.artists),
  release:audioAlbum(metadata),
  songwriters:writerNames(writers),
  genre:Array.isArray(c.genre)?c.genre.find(g=>normalizeMusicGenre(g)):c.genre,
  bpm:c.bpm,key:c.key,isrc:Array.isArray(c.isrc)?c.isrc[0]:c.isrc,
  description:Array.isArray(c.comment)?c.comment.map(v=>typeof v==='string'?v:v?.text).filter(Boolean).join('\n'):''};
}
function sidecarFields(text){
 let raw;
 try{raw=JSON.parse(text);}catch{
  raw=Object.fromEntries(text.split(/\r?\n/).slice(0,256).map(line=>{const at=line.indexOf(':');return at>0?[line.slice(0,at).trim(),line.slice(at+1).trim()]:null;}).filter(Boolean));
 }
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const aliases={album:'release',author:'artist',composer:'songwriters',comment:'description',software:'daw'};
 const fields={};
 for(const [key,value] of Object.entries(raw).slice(0,128)){
  const lower=key.toLowerCase(),name=aliases[lower]||lower;
  if(FORM_FIELDS.includes(name))fields[name]=Array.isArray(value)?names(value):value;
 }
 return fields;
}
export async function extractUploadMetadata(file,{role='',parseAudio,parseImage,onProgress=()=>{}}={}){
 const result=baselineMetadata(file);
 if(!file||typeof file.arrayBuffer!=='function'||!Number.isSafeInteger(file.size)||file.size>MAX_UPLOAD_BYTES){
  result.notice='Embedded metadata skipped: file exceeds the 256 MiB demo limit.';return result;
 }
 try{
  if(AUDIO.test(file.name)||/^(audio|video)\//.test(file.type||'')){
   const read=parseAudio||((await import('music-metadata')).parseBlob);
   // Preserve successfully decoded tags even if later audio/frame parsing fails.
   // Progress snapshots also survive a worker timeout. Never emit raw tags/bytes.
   let observed=null,lastFields='',updates=0;
   const capture=metadata=>{
    if(!metadata)return;
    apply(result,audioSuggestions(metadata),'embedded audio tags');
    const fields=JSON.stringify(result.fields);
    if(fields!==lastFields&&updates<64){
     lastFields=fields;updates++;
     onProgress({...result,fields:{...result.fields},fieldSources:{...result.fieldSources},technical:{...result.technical}});
    }
   };
   let metadata;
   try{
    metadata=await read(file,{duration:false,skipCovers:true,skipPostHeaders:false,
     observer:update=>{observed=update.metadata;capture(observed);}});
   }catch{
    // The parser may have read TALB before rejecting an unrelated frame/stream.
    capture(observed);
    if(Object.values(result.fieldSources).includes('embedded audio tags')){
     result.notice='Some audio metadata could not be read. Extracted tags were kept; review them before minting.';
     return result;
    }
    throw Error('Audio metadata unavailable');
   }
   capture(metadata);
   const f=metadata?.format||{};
   for(const [key,value] of Object.entries({durationSeconds:f.duration,sampleRateHz:f.sampleRate,channels:f.numberOfChannels,bitDepth:f.bitsPerSample,bitrate:f.bitrate})){
    if(Number.isFinite(value)&&value>0)result.technical[key]=value;
   }
   if(typeof f.codec==='string')result.technical.codec=clean(f.codec,100);
   if(Array.isArray(f.tagTypes))result.technical.tagTypes=f.tagTypes.filter(t=>typeof t==='string').slice(0,16);
   if(castGenre(metadata)&&!normalizeMusicGenre(castGenre(metadata)))result.notice='Embedded genre is not in the approved list; choose it manually.';
  }else if(IMAGE.test(file.name)){
   const read=parseImage||((await import('exifr')).parse);
   const tags=await read(file,{gps:false,xmp:false,iptc:false,icc:false,makerNote:false,userComment:false,
    pick:['XPTitle','ImageDescription','Artist','XPAuthor','ImageWidth','ImageHeight','ExifImageWidth','ExifImageHeight']})||{};
   apply(result,{title:tags.XPTitle||tags.ImageDescription,artist:tags.Artist||tags.XPAuthor,description:tags.ImageDescription},'embedded image tags');
   for(const [key,value] of Object.entries({width:tags.ExifImageWidth||tags.ImageWidth,height:tags.ExifImageHeight||tags.ImageHeight}))if(Number.isSafeInteger(value)&&value>0)result.technical[key]=value;
  }else if(role==='metadata'&&file.size<=256*1024){
   apply(result,sidecarFields(await file.text()),'metadata sidecar');
  }
 }catch{
  // Invalid/unsupported tags do not prevent encryption or replace filename fallback.
  result.notice='Embedded metadata could not be read. Filename defaults remain available.';
 }
 return result;
}
function castGenre(metadata){const genre=metadata?.common?.genre;return Array.isArray(genre)?genre[0]:genre;}

/** Pure deterministic form reconciliation. A typed (even cleared) field always wins.
 * Preview tags win over conflicting master tags; sidecars are explicit metadata input.
 * Other assets retain their own extracted title but cannot rename the release.
 */
export function resolveUploadFields(manual={},touched=[],uploads={}){
 const locked=new Set(touched),values={...manual},sources={};
 const roles=['master','preview','metadata'];
 for(const field of FORM_FIELDS){
  if(locked.has(field))continue;
  let best=null;
  for(const role of roles){
   const data=uploads[role]?.result;
   const value=data?.fields?.[field];if(!value)continue;
   if(data.fieldSources?.[field]==='filename'&&role==='metadata')continue;
   const rank=(data.fieldSources?.[field]==='filename'?0:100)+(role==='metadata'?40:role==='preview'?30:20);
   // Primary filename is preferred; preview is fallback when primary is absent.
   const score=data.fieldSources?.[field]==='filename'?(role==='master'?2:1):rank;
   if(!best||score>best.score)best={value,score,role,source:data.fieldSources?.[field]||'filename'};
  }
  if(best){values[field]=best.value;sources[field]={role:best.role,source:best.source};}
 }
 return {values,sources};
}
export function initialUploadForm(values={}){
 return {manual:{...values},touched:Object.entries(values).filter(([,v])=>v!==''&&v!==null&&v!==undefined).map(([key])=>key),uploads:{}};
}
export function uploadFormReducer(state,action){
 if(action.type==='edit')return {...state,manual:{...state.manual,[action.field]:action.value},touched:[...new Set([...state.touched,action.field])]};
 if(action.type==='reset')return initialUploadForm(action.values);
 if(action.type==='clear-files')return {...state,uploads:{}};
 if(action.type==='start')return {...state,uploads:{...state.uploads,[action.role]:{id:action.id,result:action.result}}};
 if(action.type==='finish'&&state.uploads[action.role]?.id===action.id)return {...state,uploads:{...state.uploads,[action.role]:{id:action.id,result:action.result}}};
 return state;
}
