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
export function audioSuggestions(metadata){
 const c=metadata?.common||{};
 return {title:c.title,artist:c.artist||names(c.artists),release:c.album,
  songwriters:[...new Set([...array(c.composer),...array(c.lyricist),...array(c.writer)])].filter(v=>typeof v==='string').join(', '),
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
export async function extractUploadMetadata(file,{role='',parseAudio,parseImage}={}){
 const result=baselineMetadata(file);
 if(!file||typeof file.arrayBuffer!=='function'||!Number.isSafeInteger(file.size)||file.size>MAX_UPLOAD_BYTES){
  result.notice='Embedded metadata skipped: file exceeds the 256 MiB demo limit.';return result;
 }
 try{
  if(AUDIO.test(file.name)||/^(audio|video)\//.test(file.type||'')){
   const read=parseAudio||((await import('music-metadata')).parseBlob);
   const metadata=await read(file,{duration:false,skipCovers:true});
   apply(result,audioSuggestions(metadata),'embedded audio tags');
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
