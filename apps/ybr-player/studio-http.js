'use strict';
/** Development-only preview ingestion. Same-origin loopback plus per-process
 * CSRF token, no wildcard CORS. Never use this as production identity/auth.
 */
const crypto=require('node:crypto');
const {MAX_REQUEST_BYTES,LIMITS}=require('./studio-releases');
function trustedLocalRequest(req){
 const ip=req.socket.remoteAddress;
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip))return false;
 let host;
 try{host=new URL((req.socket.encrypted?'https://':'http://')+req.headers.host);}catch{return false;}
 if(!['127.0.0.1','localhost','[::1]'].includes(host.hostname)||host.pathname!=='/'||host.username||host.password||host.search||host.hash)return false;
 if(req.headers.origin&&req.headers.origin!==host.origin)return false;
 return !['cross-site','none'].includes(req.headers['sec-fetch-site']);
}
async function readPublication(req,limit=MAX_REQUEST_BYTES){
 if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw Object.assign(Error('Expected application/json.'),{status:415});
 const length=req.headers['content-length'];
 if(length&&(!/^\d+$/.test(length)||Number(length)>limit))throw Object.assign(Error('Preview request exceeds the size limit.'),{status:413});
 const chunks=[];let count=0;
 for await(const chunk of req){count+=chunk.length;if(count>limit)throw Object.assign(Error('Preview request exceeds the size limit.'),{status:413});chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks,count).toString('utf8'));}catch{throw Object.assign(Error('Invalid preview JSON.'),{status:400});}
}
function createStudioHttp({library,covers,sendJson,requireSession,parseRange,checkPermission=async()=>({allowed:true})}){
 const token=crypto.randomBytes(32).toString('hex');
 const validToken=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&crypto.timingSafeEqual(Buffer.from(value,'hex'),Buffer.from(token,'hex'));
 async function deliver(req,res,id,role){
  const record=library.get(id);
  if(!record||!(await checkPermission(record,role)).allowed){sendJson(res,403,{error:'The current on-chain Player permission does not allow this asset.'});return;}
  const asset=library.asset(id,role);
  if(!asset){sendJson(res,404,{error:'Preview asset not found.'});return;}
  const range=role==='audio'?parseRange(req.headers.range,asset.bytes.length):{start:0,end:asset.bytes.length-1,partial:false};
  if(!range){res.writeHead(416,{'Content-Range':'bytes */'+asset.bytes.length,'Cache-Control':'no-store'});res.end();return;}
  const {start,end,partial}=range;
  res.writeHead(partial?206:200,{
   'Content-Type':asset.mime+(asset.mime.startsWith('text/')?'; charset=utf-8':''),
   'Content-Length':end-start+1,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
   'Cross-Origin-Resource-Policy':'same-origin','X-YBR-Content-SHA256':asset.sha256,
   ...(role==='audio'?{'Accept-Ranges':'bytes'}:{}),
   ...(partial?{'Content-Range':`bytes ${start}-${end}/${asset.bytes.length}`}:{})
  });
  res.end(req.method==='HEAD'?undefined:asset.bytes.subarray(start,end+1));
 }
 async function handle(req,res,route){
  if(route.startsWith('/api/player-publish')){
   if(!trustedLocalRequest(req)){sendJson(res,403,{error:'Preview publishing requires the same-origin local Road application.'});return true;}
   if(route==='/api/player-publish/config'&&req.method==='GET'){
    sendJson(res,200,{mode:'local-creator-preview',token,limits:LIMITS});return true;
   }
   if(!validToken(req.headers['x-ybr-publish-token'])){sendJson(res,403,{error:'Local publishing token required.'});return true;}
   if(covers&&route==='/api/player-publish/cover-studio'&&req.method==='GET'){
    sendJson(res,200,await covers.catalog());return true;
   }
   if(covers&&['/api/player-publish/audio-buildings','/api/player-publish/playable-covers'].includes(route)&&req.method==='POST'){
    const body=await readPublication(req,32768);
    const result=await (route.endsWith('audio-buildings')?covers.createBuilding(body):covers.commit(body));
    sendJson(res,result.created?201:200,result);return true;
   }
   const coverRemoval=/^\/api\/player-publish\/playable-covers\/(COVER-[a-f0-9]{64})$/.exec(route);
   if(covers&&coverRemoval&&req.method==='DELETE'){sendJson(res,200,{removed:covers.remove(coverRemoval[1])});return true;}
   const preview=/^\/api\/player-publish\/assets\/(STUDIO-[a-f0-9]{64})\/(audio|artwork)$/.exec(route);
   if(preview&&(req.method==='GET'||req.method==='HEAD')){await deliver(req,res,preview[1],preview[2]);return true;}
   if(route==='/api/player-publish/releases'&&req.method==='POST'){
    const body=await readPublication(req);
    for(const role of Object.keys(body.assets||{}))if(!(await checkPermission(body,role)).allowed){sendJson(res,403,{error:'Current on-chain Player permission or file commitment does not match this release.'});return true;}
    const result=library.publish(body);sendJson(res,result.created?201:200,result);return true;
   }
   const removal=/^\/api\/player-publish\/releases\/(STUDIO-[a-f0-9]{64})$/.exec(route);
   if(removal&&req.method==='DELETE'){
    sendJson(res,200,{removed:library.remove(removal[1])});return true;
   }
   sendJson(res,404,{error:'Publishing endpoint not found.'});return true;
  }
  const media=/^\/api\/studio-releases\/(STUDIO-[a-f0-9]{64})\/(artwork|lyrics)$/.exec(route);
  if(media){
   if(!requireSession(req,res))return true;
   if(req.method!=='GET'&&req.method!=='HEAD'){sendJson(res,405,{error:'Read-only asset endpoint.'});return true;}
   await deliver(req,res,media[1],media[2]);return true;
  }
  return false;
 }
 return {handle,deliver};
}
module.exports={createStudioHttp,trustedLocalRequest};
