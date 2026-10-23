'use strict';
/** Durable local observations, not proof of listening, identity, royalties or rights.
 * The server supplies the subject after live authorization. No raw session IDs,
 * usernames, IP addresses, filenames, recovery data or client timestamps are stored.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const HASH=/^[a-f0-9]{64}$/,ADDRESS=/^0x[a-f0-9]{40}$/i;
const EVENTS=Object.freeze({play:'audio',pause:'audio',ended:'audio',seek:'audio',skip:'audio','artwork-view':'artwork','lyrics-view':'lyrics'});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const err=(message,status=400)=>Object.assign(Error(message),{status});
function subjectFor(brick,role='audio'){
 if(!Object.values(EVENTS).includes(role))throw err('Invalid interaction role.');
 const asset=role==='audio'?brick.media:brick.assets?.[role]||brick[role];
 const digest=String(asset?.sha256||'').toLowerCase();
 if(!HASH.test(digest))throw err('The file has no verified checksum.',409);
 const auth=brick.authorization,source=auth?.sources?.[role],road=brick.road;
 let scope;
 if(auth){
  if(!source||auth.chainId!==1337||!ADDRESS.test(auth.factoryAddress)||!/^0x[a-f0-9]{64}$/i.test(auth.genesisHash)||!ADDRESS.test(source.brickAddress)||!/^\d{1,20}$/.test(source.revision))throw err('Missing on-chain interaction scope.',409);
  scope={kind:'on-chain',chainId:auth.chainId,genesisHash:auth.genesisHash.toLowerCase(),factoryAddress:auth.factoryAddress.toLowerCase(),brickAddress:source.brickAddress.toLowerCase(),revision:source.revision};
 }else if(road){
  if(role!=='audio'||!ADDRESS.test(road.brickAddress)||!ADDRESS.test(road.factoryAddress)||!/^0x[a-f0-9]{64}$/i.test(road.genesisHash)||!/^0x[a-f0-9]{64}$/i.test(road.metadataDigest))throw err('Public recording history is unavailable.',409);
  scope={kind:'on-chain-publication',chainId:1337,genesisHash:road.genesisHash.toLowerCase(),factoryAddress:road.factoryAddress.toLowerCase(),brickAddress:road.brickAddress.toLowerCase(),publicationDigest:road.metadataDigest.toLowerCase()};
 }else{
  if(!/^(BRK-AUD-\d+|STUDIO-[a-f0-9]{64})$/.test(brick.id||''))throw err('Unknown demo file identity.');
  scope={kind:'local-demo',id:brick.id};
 }
 return {...scope,role,sha256:digest};
}
function validSubject(value){
 if(!value||!HASH.test(value.sha256)||!Object.values(EVENTS).includes(value.role))return false;
 if(value.kind==='local-demo')return /^(BRK-AUD-\d+|STUDIO-[a-f0-9]{64})$/.test(value.id||'');
 return ['on-chain','on-chain-publication'].includes(value.kind)&&value.chainId===1337&&/^0x[a-f0-9]{64}$/.test(value.genesisHash||'')&&ADDRESS.test(value.factoryAddress||'')&&ADDRESS.test(value.brickAddress||'')&&
  (value.kind==='on-chain'?/^\d{1,20}$/.test(value.revision||''):/^0x[a-f0-9]{64}$/.test(value.publicationDigest||''));
}
function createInteractionStore({file,now=Date.now,maxBytes=16*1024*1024,maxRecords=20000}={}){
 if(!file)throw Error('Interaction journal path is required.');
 const target=path.resolve(file);let records=null,known=new Set(),size=0,identity=null;
 function safe(stat){if(!stat.isFile()||stat.nlink!==1||(process.getuid&&stat.uid!==process.getuid())||(stat.mode&0o077))throw err('Unsafe interaction journal; existing data was not changed.',503);}
 function load(){
  if(records)return;
  let data;
  try{const fd=fs.openSync(target,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));try{const st=fs.fstatSync(fd);safe(st);if(st.size>maxBytes)throw err('Interaction journal is full; archive it explicitly before further capture.',503);data=fs.readFileSync(fd,'utf8');identity=[st.dev,st.ino];size=st.size;}finally{fs.closeSync(fd);}}
  catch(e){if(e.code==='ENOENT'){records=[];return;}throw e;}
  if(data&&!data.endsWith('\n'))throw err('Interaction journal has an incomplete record; preserve it for recovery.',503);
  const parsed=data.split('\n').filter(Boolean).map(line=>{let entry;try{entry=JSON.parse(line);}catch{throw err('Invalid interaction journal; it was not reset.',503);}
   if(entry.format!=='ybr-file-interaction/1'||!validSubject(entry.subject)||!HASH.test(entry.id)||!HASH.test(entry.playback)||!Object.hasOwn(EVENTS,entry.event)||EVENTS[entry.event]!==entry.subject.role||!Number.isFinite(Date.parse(entry.at))||entry.key!==sha(JSON.stringify(entry.subject))||!Number.isFinite(entry.positionSeconds)||entry.positionSeconds<0||entry.positionSeconds>86400)throw err('Invalid stored interaction.',503);
   return entry;});
  if(parsed.length>maxRecords)throw err('Interaction journal reached its record limit.',503);
  records=parsed;known=new Set(records.map(r=>r.id));
 }
 function record({subject,event,eventId,playbackId,sessionSalt,positionSeconds=0}){
  if(!validSubject(subject)||EVENTS[event]!==subject.role||!/^[-a-zA-Z0-9]{16,100}$/.test(eventId||'')||!/^[-a-zA-Z0-9]{16,100}$/.test(playbackId||'')||typeof sessionSalt!=='string'||!Number.isFinite(positionSeconds)||positionSeconds<0||positionSeconds>86400)throw err('Invalid interaction.');
  load();
  const id=sha(sessionSalt+':'+eventId),playback=sha(sessionSalt+':'+playbackId),key=sha(JSON.stringify(subject));
  if(known.has(id))return {recorded:false,duplicate:true};
  const entry={format:'ybr-file-interaction/1',id,playback,subject,key,event,positionSeconds:Math.round(positionSeconds*10)/10,at:new Date(now()).toISOString(),proofLevel:'unverified-client-report'};
  const line=JSON.stringify(entry)+'\n';if(records.length>=maxRecords||size+Buffer.byteLength(line)>maxBytes)throw err('Interaction capture is full. Existing data is retained; archive it explicitly.',507);
  const dir=path.dirname(target);
  // Validate the .road-local parent too, before creating its journal directory.
  const outer=path.dirname(dir);
  if(path.basename(outer)==='.road-local'){
   try{const st=fs.lstatSync(outer);if(st.isSymbolicLink()||!st.isDirectory()||(process.getuid&&st.uid!==process.getuid()))throw err('Unsafe interaction parent directory.',503);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  fs.mkdirSync(dir,{recursive:true,mode:0o700});const parent=fs.lstatSync(dir);
  if(!parent.isDirectory()||parent.isSymbolicLink()||(process.getuid&&parent.uid!==process.getuid()))throw err('Unsafe interaction directory.',503);
  const fd=fs.openSync(target,fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600);
  try{
   const st=fs.fstatSync(fd);safe(st);
   if((identity&&(st.dev!==identity[0]||st.ino!==identity[1]))||st.size!==size)throw err('Interaction journal changed externally. Restart the Player before writing.',409);
   const written=fs.writeSync(fd,line);if(written!==Buffer.byteLength(line))throw err('Incomplete interaction write. Preserve the journal for recovery.',503);
   fs.fsyncSync(fd);identity=[st.dev,st.ino];size+=written;
  }finally{fs.closeSync(fd);}
  records.push(entry);known.add(id);return {recorded:true,duplicate:false};
 }
 function snapshot(subject){
  if(!validSubject(subject))throw err('Invalid interaction scope.');load();
  const key=sha(JSON.stringify(subject)),entries=records.filter(r=>r.key===key),starts=new Set(),ends=new Set();
  const counters={playEvents:0,reportedStarts:0,pauseEvents:0,endedReports:0,seekEvents:0,skipEvents:0,displayReports:0};
  for(const r of entries){if(r.event==='play'){counters.playEvents++;starts.add(r.playback);}else if(r.event==='pause')counters.pauseEvents++;else if(r.event==='ended'){if(starts.has(r.playback))ends.add(r.playback);}else if(r.event==='seek')counters.seekEvents++;else if(r.event==='skip')counters.skipEvents++;else counters.displayReports++;}
  counters.reportedStarts=starts.size;counters.endedReports=ends.size;
  const payload={format:'ybr-interaction-snapshot/1',subject,through:entries.at(-1)?.at||null,first:entries[0]?.at||null,events:entries.length,counters,
   proofLevel:'unverified-client-report',source:'local-ybr-player',meaning:'Observations only. Not unique listeners, verified completion, listening duration, ownership, training attribution or royalty evidence.'};
  return {...payload,digest:'0x'+sha(JSON.stringify(payload))};
 }
 return {record,snapshot};
}
module.exports={EVENTS,subjectFor,createInteractionStore};
