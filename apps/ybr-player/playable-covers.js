'use strict';
// Creator presentation objects. References reuse existing preview permissions;
// a Building or a committed layout never grants rights to its source files.
const fs=require('node:fs'),path=require('node:path');
const {sha256}=require('./studio-releases');
const M=require('./public/artwork-model');
const SOURCE=/^STUDIO-[a-f0-9]{64}$/,ID=/^(?:BUILDING|COVER)-[a-f0-9]{64}$/;
const AUDIO_RELEASE_TYPES=Object.freeze(['Single','EP','Album','Compilation']);
const bad=(message,status=400)=>Object.assign(Error(message),{status});
function title(value){if(typeof value!=='string'||!value.trim()||value.length>200||/[\x00-\x1f\x7f]/.test(value))throw bad('Enter a title of 1–200 characters.');return value.trim();}
function ids(value){if(!Array.isArray(value)||!value.length||value.length>64||new Set(value).size!==value.length||value.some(id=>typeof id!=='string'||!SOURCE.test(id)))throw bad('Choose distinct uploaded audio Bricks.');return [...value].sort();}
const label=value=>typeof value==='string'?value.normalize('NFC').trim().replace(/\s+/g,' '):'';
const legacyBuildingId=id=>'BUILDING-'+sha256('release:'+id);
/** Local browsing groups, not on-chain membership or rights assertions. */
function uploadBuildings(uploads){
 const groups=new Map();
 for(const brick of uploads){
  const album=label(brick.album),name=album||label(brick.title),groupBy=album?'album':'track',auth=brick.authorization;
  // A shared album title must not merge distinct chains or wallet profiles.
  const scope=auth?[auth.chainId,auth.factoryAddress?.toLowerCase(),auth.genesisHash?.toLowerCase(),auth.sources?.audio?.controller?.toLowerCase()]:['local-preview'];
  const key=JSON.stringify([scope,groupBy,name.toLowerCase()]);
  if(!groups.has(key))groups.set(key,{format:'ybr-audio-building/1',id:'BUILDING-'+sha256('upload-group:'+key),title:name,members:[],legacyIds:[],source:'mint-studio',groupBy,publishedAt:brick.publishedAt});
  const group=groups.get(key);group.members.push(brick.id);group.legacyIds.push(legacyBuildingId(brick.id));
  if(brick.publishedAt>group.publishedAt)group.publishedAt=brick.publishedAt;
 }
 return [...groups.values()].map(group=>({...group,members:group.members.sort()}));
}
function createPlayableCovers({directory=path.resolve(__dirname,'../../.road-local/playable-covers'),studio,checkPermission,now=Date.now,maxRecords=200}){
 const root=path.resolve(directory);
 function read(id){
  if(!ID.test(id||''))return null;
  let fd;try{fd=fs.openSync(path.join(root,id+'.json'),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>32768)throw bad('Invalid saved cover.',409);const value=JSON.parse(fs.readFileSync(fd,'utf8'));if(value.id!==id)return null;return value;}
  catch(e){if(e.code==='ENOENT')return null;throw e;}finally{if(fd!==undefined)fs.closeSync(fd);}
 }
 function list(prefix){try{return fs.readdirSync(root).filter(n=>n.startsWith(prefix+'-')&&ID.test(n.slice(0,-5))&&n.endsWith('.json')).slice(0,maxRecords).flatMap(n=>{try{return read(n.slice(0,-5))||[];}catch{return [];}});}catch(e){if(e.code==='ENOENT')return [];throw e;}}
 function save(prefix,data){
  const id=prefix+'-'+sha256(JSON.stringify(data)),prior=read(id);if(prior)return {created:false,record:prior};
  fs.mkdirSync(root,{recursive:true,mode:0o700});if(fs.lstatSync(root).isSymbolicLink())throw bad('Invalid cover storage.',409);
  if(fs.readdirSync(root).filter(n=>ID.test(n.slice(0,-5))).length>=maxRecords)throw bad('The local cover library is full.',413);
  const record={...data,id,publishedAt:new Date(now()).toISOString()},temporary=fs.mkdtempSync(path.join(root,'.incoming-'));
  try{const file=path.join(temporary,'record.json');fs.writeFileSync(file,JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(file,path.join(root,id+'.json'));}finally{fs.rmSync(temporary,{recursive:true,force:true});}
  return {created:true,record};
 }
 async function source(id,role='audio',memo){
  if(!SOURCE.test(id||''))throw bad('Choose an uploaded audio Brick.');
  const key=id+':'+role;if(memo?.has(key))return memo.get(key);
  const pending=(async()=>{
   const brick=studio.get(id);if(!brick||!(await checkPermission(brick,role)).allowed)throw bad('A source is unavailable or its Player permission changed. Refresh your uploads.',409);
   if(!brick.assets?.[role])throw bad(role==='artwork'?'Choose a release with shared cover artwork.':'This upload has no Audio Preview.');
   return brick;
  })();
  memo?.set(key,pending);return pending;
 }
 function buildings(){return [...list('BUILDING'),...uploadBuildings(studio.list())];}
 async function building(id,memo,parents){
  const item=(parents||buildings()).find(b=>b.id===id||b.legacyIds?.includes(id));
  if(!item)throw bad('Create an audio Building before using Cover Art Studio.',409);
  if(item.source==='mint-studio'){
   // A newly uploaded/revoked album member must not disable unrelated covers.
   const members=(await Promise.all(item.members.map(async id=>{try{await source(id,'audio',memo);return id;}catch{return null;}}))).filter(Boolean);
   if(!members.length)throw bad('This upload group has no available audio. Refresh your uploads.',409);
   return {...item,members};
  }
  await Promise.all(item.members.map(id=>source(id,'audio',memo)));return item;
 }
 async function createBuilding(body){
  if(!AUDIO_RELEASE_TYPES.includes(body?.releaseType))throw bad('Choose an audio Building type: Single, EP, Album or Compilation.');
  const members=ids(body.members);await Promise.all(members.map(id=>source(id)));
  return save('BUILDING',{format:'ybr-audio-building/1',title:title(body.title),releaseType:body.releaseType,members,source:'creator'});
 }
 async function commit(body){
  if(body.consent!=='commit-playable-cover')throw bad('Confirm committing this Playable Cover to the Player.',403);
  const parent=await building(body.buildingId);
  const requested=ids([...(new Set([body.layout?.artworkBrickId,...(body.layout?.regions||[]).map(r=>r?.brickId)]))]);
  await Promise.all(requested.map(id=>source(id)));
  const layout=M.decode(body.layout,new Set(requested));
  const artwork=await source(layout.artworkBrickId,'artwork');
  // Verify the copies before committing references. Private originals stay private.
  for(const id of requested)studio.asset(id,'audio');studio.asset(artwork.id,'artwork');
  const sensitivity=body.sensitivity??.25;
  if(typeof sensitivity!=='number'||!Number.isFinite(sensitivity)||sensitivity<.02||sensitivity>.7)throw bad('Blend reach must be between 2% and 70%.');
  const sources=requested.map(id=>{const b=studio.get(id);return {id,sha256:b.media.sha256,mimeType:b.media.mimeType};});
  return save('COVER',{format:'ybr-playable-cover/1',type:'PlayableCover',title:title(body.title),buildingId:parent.id,buildingTitle:parent.title,layout,sensitivity,sources,artworkSha256:artwork.artwork.sha256});
 }
 async function describe(record,memo,parents){
  if(record?.format!=='ybr-playable-cover/1')return null;
  try{
   const parent=await building(record.buildingId,memo,parents);
   const sources=await Promise.all(record.sources.map(s=>source(s.id,'audio',memo)));
   if(sources.some((b,i)=>b.media.sha256!==record.sources[i].sha256))return null;
   M.decode(record.layout,new Set(sources.map(b=>b.id)));
   const cover=await source(record.layout.artworkBrickId,'artwork',memo);if(cover.artwork.sha256!==record.artworkSha256)return null;
   return {...record,buildingId:parent.id,buildingTitle:parent.title,source:'playable-cover',creator:[...new Set(sources.map(b=>b.creator))].join(' · '),streamAllowed:true,theme:'gold',durationSeconds:0,
    artwork:{...cover.artwork,sourceBrickId:cover.id},files:[],credits:[],
    rights:{notes:'Each source keeps its own Player permission. This local Building does not transfer rights.'},
    provenance:{agent:cover.creator,activity:'Creator-committed Playable Cover',vocabulary:'https://www.w3.org/TR/prov-o/'}};
  }catch{return null;}
 }
 async function playable(memo=new Map(),parents=buildings()){return (await Promise.all(list('COVER').map(record=>describe(record,memo,parents)))).filter(Boolean);}
 async function catalog(){
  const memo=new Map(),parents=buildings();
  const uploads=(await Promise.all(studio.list().map(async b=>{try{await source(b.id,'audio',memo);const art=b.artwork&&(await checkPermission(b,'artwork')).allowed?b.artwork:null;return {id:b.id,title:b.title,album:b.album,creator:b.creator,media:b.media,artwork:art,authorization:b.authorization};}catch{return null;}}))).filter(Boolean);
  const allowed=new Set(uploads.map(b=>b.id));
  const visible=parents.map(b=>b.source==='mint-studio'?{...b,members:b.members.filter(id=>allowed.has(id))}:b)
   .filter(b=>b.members.length&&b.members.every(id=>allowed.has(id))).map(({legacyIds,...b})=>b);
  return {mode:'local-creator-preview',uploads,buildings:visible,covers:await playable(memo,parents)};
 }
 function remove(id){if(!/^COVER-[a-f0-9]{64}$/.test(id||''))throw bad('Invalid Playable Cover.');if(!read(id))return false;fs.unlinkSync(path.join(root,id+'.json'));return true;}
 return {catalog,createBuilding,commit,playable,remove,get:async id=>describe(read(id)),source};
}
module.exports={createPlayableCovers,AUDIO_RELEASE_TYPES,uploadBuildings};
