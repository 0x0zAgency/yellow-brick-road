/** Minimal YBR-to-Kubo bridge, deliberately NOT a generic /api/v0 proxy.
 * Encrypted originals remain private. A separate consent-gated endpoint accepts
 * public NFT display thumbnails only. Recovery keys never leave the browser.
 */
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {MAX_NFT_COVER_BYTES,PUBLIC_COVER_CONSENT,validCoverCid,validateNftCoverPng} from '../src/nft-cover-format.js';

const MiB=1024*1024;
export const MAX_CIPHERTEXT_BYTES=32*MiB;
const MAX_RPC_REPLY_BYTES=64*1024;
const allowedOrigins=new Set(['http://localhost:5173','http://127.0.0.1:5173','https://localhost:5173','https://127.0.0.1:5173']);
const loopbackNames=new Set(['127.0.0.1','localhost','[::1]']);
const CID_RE=/^(?:bafy|bafk|baga|Qm)[a-zA-Z0-9]{20,120}$/;
const validCid=cid=>typeof cid==='string'&&cid===cid.trim()&&CID_RE.test(cid);
const PRIVATE_HEADER_FIELDS=new Set(['v','alg','kdf','iterations','salt','iv','name','mime','bytes']);
const failure=(message,status)=>Object.assign(Error(message),{status});
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function checkedKuboUrl(value){
 const url=new URL(value);
 if(url.protocol!=='http:'||!loopbackNames.has(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)
  throw Error('Kubo API must be an HTTP loopback URL without credentials or a path.');
 return url.origin;
}
export const KUBO_RPC=checkedKuboUrl(process.env.YBR_KUBO_RPC||'http://127.0.0.1:5001');
export function parseAddOutput(text){
 const records=text.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
 const candidate=records.at(-1);
 if(!validCid(candidate?.Hash))throw Error('Kubo returned no valid content identifier.');
 return candidate.Hash;
}
async function kuboCall(path,{fetchImpl=fetch,body,timeout=90000}={}){
 const res=await fetchImpl(KUBO_RPC+'/api/v0/'+path,{method:'POST',body,headers:{'Accept-Encoding':'identity'},redirect:'error',signal:AbortSignal.timeout(timeout)});
 if(!res.ok){
  await res.body?.cancel().catch(()=>{});
  throw Object.assign(Error('Kubo RPC '+path.split('?')[0]+' failed (HTTP '+res.status+').'),{upstreamStatus:res.status});
 }
 return res;
}

/** Enforce the cap while consuming the stream, even when Content-Length lies or
 * is absent. Do not allocate an unrestricted arrayBuffer from a Kubo response.
 */
export async function readBoundedBytes(response,{max=MAX_CIPHERTEXT_BYTES}={}){
 const rawLength=response.headers.get('content-length');
 const declared=rawLength===null?null:Number(rawLength);
 if(rawLength!==null&&(!/^\d+$/.test(rawLength)||!Number.isSafeInteger(declared))){
  await response.body?.cancel().catch(()=>{});
  throw failure('Invalid content length from Kubo.',502);
 }
 if(declared!==null&&declared>max){
  await response.body?.cancel().catch(()=>{});
  throw failure('Kubo response exceeds the permitted size limit (32 MiB for encrypted content).',413);
 }
 if(!response.body){
  if(declared)throw failure('Kubo response ended before its declared content length.',502);
  return Buffer.alloc(0);
 }
 const reader=response.body.getReader();
 const chunks=[];let length=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   length+=value.byteLength;
   if(length>max)throw failure('Kubo response exceeds the permitted size limit (32 MiB for encrypted content).',413);
   chunks.push(value);
  }
  if(declared!==null&&length!==declared)throw failure('Kubo response length does not match Content-Length.',502);
  return Buffer.concat(chunks,length);
 }catch(error){
  await reader.cancel().catch(()=>{});
  throw error;
 }finally{reader.releaseLock();}
}

/** Structural validation only: the browser authenticates the AES-GCM tag after
 * retrieving bytes. Generic fields prevent source names/MIME leaking in headers.
 */
export function validateEncryptedContainer(bytes){
 if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>MAX_CIPHERTEXT_BYTES)
  throw failure('IPFS pilot permits 1 byte to 32 MiB per encrypted asset.',413);
 const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
 // 0ZROAD01 is the authenticated encrypted-container magic from road-encryption.js.
 if(!buffer.subarray(0,8).equals(Buffer.from('0ZROAD01')))throw Error('Only 0ZROAD01 encrypted containers are permitted.');
 if(buffer.length<10)throw Error('Malformed encrypted container.');
 const headerLength=(buffer[8]<<8)|buffer[9],end=10+headerLength;
 if(!headerLength||end+16>buffer.length)throw Error('Malformed encrypted container.');
 let header;
 try{header=JSON.parse(buffer.subarray(10,end).toString('utf8'))}catch{throw Error('Invalid encrypted-container header.');}
 if(!header||typeof header!=='object'||Array.isArray(header)||
    Object.keys(header).some(key=>!PRIVATE_HEADER_FIELDS.has(key))||
    header.v!==1||header.alg!=='AES-256-GCM'||header.kdf!=='PBKDF2-SHA-256'||
    header.iterations!==310000||!Number.isSafeInteger(header.bytes)||header.bytes<0||
    !/^[0-9a-f]{32}$/.test(header.salt||'')||!/^[0-9a-f]{24}$/.test(header.iv||'')||
    header.name!=='encrypted-work'&&header.name!=='brick-metadata')
  throw Error('Unsupported or potentially plaintext-leaking encrypted header.');
 if(header.mime!=='application/octet-stream')
  throw Error('Encrypted metadata must not expose the original media type.');
 if(buffer.length-end!==header.bytes+16)throw Error('Ciphertext length disagrees with encrypted-container header.');
 return buffer;
}

async function readRpcJson(response){
 return JSON.parse((await readBoundedBytes(response,{max:MAX_RPC_REPLY_BYTES})).toString('utf8'));
}
async function localPin(cid,{fetchImpl=fetch,missingStatus=502}={}){
 let response;
 try{response=await kuboCall('pin/ls?arg='+encodeURIComponent(cid),{fetchImpl});}
 catch(error){
  // Kubo returns HTTP 500 for an otherwise valid CID with no matching pin.
  if(missingStatus===404&&[404,500].includes(error.upstreamStatus))
   throw failure('CID is not pinned or its local pin is unavailable on this YBR node.',404);
  throw error;
 }
 const pinned=await readRpcJson(response);
 if(!['recursive','direct'].includes(pinned.Keys?.[cid]?.Type))
  throw failure('CID is not pinned on this local YBR node.',missingStatus);
}
async function readCiphertext(cid,{fetchImpl=fetch}={}){
 // Ask for one extra byte so oversized content cannot masquerade as a valid
 // truncated response. The streamed reader independently enforces the cap.
 const response=await kuboCall('cat?arg='+encodeURIComponent(cid)+'&length='+(MAX_CIPHERTEXT_BYTES+1),{fetchImpl});
 return readBoundedBytes(response);
}
export async function retrieveEncryptedBytes(cid,{fetchImpl=fetch}={}){
 if(!validCid(cid))throw failure('A bare supported IPFS CID is required.',400);
 await localPin(cid,{fetchImpl,missingStatus:404});
 const bytes=validateEncryptedContainer(await readCiphertext(cid,{fetchImpl}));
 return {bytes,cid,sha256:sha256(bytes),size:bytes.length,pinned:true,verified:true};
}
export async function storeEncryptedBytes(bytes,{fetchImpl=fetch}={}){
 const buffer=validateEncryptedContainer(bytes);
 const multipart=new FormData();
 multipart.append('file',new Blob([buffer],{type:'application/octet-stream'}),'ciphertext.roadenc');
 const added=await kuboCall('add?cid-version=1&pin=true&wrap-with-directory=false&progress=false',{fetchImpl,body:multipart});
 const cid=parseAddOutput((await readBoundedBytes(added,{max:MAX_RPC_REPLY_BYTES})).toString('utf8'));
 // Verify that the pinned Kubo node can actually serve exactly the submitted ciphertext.
 const remote=await readCiphertext(cid,{fetchImpl});
 if(remote.length!==buffer.length||sha256(remote)!==sha256(buffer))
  throw Error('Kubo CID retrieval differs from submitted ciphertext.');
 await localPin(cid,{fetchImpl});
 return {cid,sha256:sha256(buffer),size:buffer.length,pinned:true,verified:true};
}
/** Explicit public rendition only. Never accepted by the encrypted upload route. */
export async function storeNftCover(bytes,{fetchImpl=fetch}={}){
 const info=validateNftCoverPng(bytes),buffer=Buffer.from(bytes);
 const multipart=new FormData();
 multipart.append('file',new Blob([buffer],{type:'image/png'}),'nft-cover.png');
 const added=await kuboCall('add?cid-version=1&pin=true&wrap-with-directory=false&progress=false',{fetchImpl,body:multipart});
 const cid=parseAddOutput((await readBoundedBytes(added,{max:MAX_RPC_REPLY_BYTES})).toString('utf8'));
 if(!validCoverCid(cid))throw Error('Unsupported public cover CID.');
 const response=await kuboCall('cat?arg='+encodeURIComponent(cid)+'&length='+(MAX_NFT_COVER_BYTES+1),{fetchImpl});
 const remote=await readBoundedBytes(response,{max:MAX_NFT_COVER_BYTES});
 if(!buffer.equals(remote))throw Error('Kubo retrieval differs from the reviewed public cover.');
 await localPin(cid,{fetchImpl});
 return {...info,cid,sha256:sha256(buffer),pinned:true,verified:true};
}
/** Public covers may be provided by another IPFS node; ciphertext recovery stays local-pin-only. */
export async function retrieveNftCover(cid,{fetchImpl=fetch}={}){
 if(!validCoverCid(cid))throw failure('A bare public-cover CID is required.',400);
 // A local pin proves retention, not whether a PUBLIC image may be read. Kubo
 // can fetch this bounded rendition from peers. Do not apply this to recovery.
 let bytes;
 try{
  const response=await kuboCall('cat?arg='+encodeURIComponent(cid)+'&length='+(MAX_NFT_COVER_BYTES+1),{fetchImpl,timeout:12000});
  bytes=await readBoundedBytes(response,{max:MAX_NFT_COVER_BYTES});
 }catch(error){throw Object.assign(failure('Public thumbnail is unavailable through this IPFS node.',error.name==='TimeoutError'?504:503),{code:error.name==='TimeoutError'?'COVER_TIMEOUT':'COVER_UNAVAILABLE'});}
 if(bytes.subarray(0,8).equals(Buffer.from('0ZROAD01')))throw Object.assign(failure('The NFT image reference is encrypted, not a public thumbnail.',422),{code:'COVER_ENCRYPTED'});
 try{validateNftCoverPng(bytes);}catch{throw Object.assign(failure('The NFT image reference is not a supported public PNG.',422),{code:'COVER_NOT_PNG'});}
 return {bytes,size:bytes.length};
}
async function bodyBytes(req,max=MAX_CIPHERTEXT_BYTES){
 if(Number(req.headers['content-length']||0)>max)throw Object.assign(Error(max===MAX_NFT_COVER_BYTES?'Public NFT cover exceeds 512 KiB limit.':'Encrypted payload exceeds 32 MiB limit.'),{status:413});
 const parts=[];let len=0;
 for await(const part of req){len+=part.length;if(len>max)throw Object.assign(Error(max===MAX_NFT_COVER_BYTES?'Public NFT cover exceeds 512 KiB limit.':'Encrypted payload exceeds 32 MiB limit.'),{status:413});parts.push(part);}
 return Buffer.concat(parts,len);
}
const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))};
function localHost(host){
 if(typeof host!=='string'||!host)return false;
 try{
  const url=new URL('http://'+host);
  return loopbackNames.has(url.hostname)&&url.host===host&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash;
 }catch{return false;}
}
export async function handleUploadRequest(req,res,{store=storeEncryptedBytes,retrieve=retrieveEncryptedBytes,storeCover=storeNftCover,retrieveCover=retrieveNftCover,fetchImpl=fetch}={}){
 // The Vite proxy preserves the browser Host. Accept loopback names only, on
 // any local port, so a DNS-rebinding host cannot read the local pin store.
 if(!localHost(req.headers.host)){json(res,403,{error:'A loopback Host header is required.'});return}
 const origin=req.headers.origin;
 if(origin&&!allowedOrigins.has(origin)){json(res,403,{error:'Only the local Mint Studio origin is allowed.'});return}
 if(req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:'Cross-site access to the local YBR bridge is forbidden.'});return}
 const path=req.url;
 // Match origin-form paths verbatim. No URL redirects, path normalization,
 // query strings, encoded CID paths, or caller-selected RPC endpoints.
 if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||/[?#]/.test(path)){
  json(res,400,{error:'Use an exact local bridge path without query parameters.'});return;
 }
 if(req.method==='GET'&&path==='/api/road-ipfs/health'){
  try{
   const response=await kuboCall('id',{fetchImpl,timeout:5000});
   const data=await readRpcJson(response);
   json(res,200,{ok:true,provider:'ybr-local-kubo',peerId:data.ID});
  }catch(e){json(res,503,{ok:false,error:'Kubo node unavailable: '+e.message})}
  return;
 }
 if(req.method==='GET'&&path.startsWith('/api/road-ipfs/content/')){
  const cid=path.slice('/api/road-ipfs/content/'.length);
  if(!validCid(cid)){json(res,400,{error:'A bare supported IPFS CID is required.'});return}
  try{
   const content=await retrieve(cid,{fetchImpl});
   res.writeHead(200,{
    'Content-Type':'application/octet-stream',
    'Content-Length':content.size,
    'Content-Disposition':'attachment; filename="ciphertext.roadenc"',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'X-Road-Encryption':'roadenc-v1',
    'X-Road-CID':content.cid,
    'X-Road-Ciphertext-SHA256':content.sha256,
    'X-Road-Ciphertext-Size':content.size
   });
   res.end(content.bytes);
  }catch(error){json(res,error.status||502,{error:error.message||'Unable to retrieve encrypted content.'});}
  return;
 }
 if(req.method==='GET'&&path.startsWith('/api/road-ipfs/nft-cover/')){
  const cid=path.slice('/api/road-ipfs/nft-cover/'.length);
  if(!validCoverCid(cid)){json(res,400,{error:'A bare public-cover CID is required.'});return;}
  try{
   const cover=await retrieveCover(cid,{fetchImpl});
   validateNftCoverPng(cover.bytes);
   res.writeHead(200,{'Content-Type':'image/png','Content-Length':cover.bytes.length,'Content-Disposition':'inline; filename="nft-cover.png"','X-Road-CID':cid,'X-Road-Image-SHA256':sha256(cover.bytes),'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin'});
   res.end(cover.bytes);
  }catch(error){
   const known=new Set(['COVER_ENCRYPTED','COVER_NOT_PNG','COVER_UNAVAILABLE','COVER_TIMEOUT']);
   const code=known.has(error.code)?error.code:'COVER_UNAVAILABLE';
   res.setHeader('X-Road-Cover-Error',code);
   json(res,error.status||503,{code,error:'Public NFT thumbnail unavailable. Inspect the public image reference or retry IPFS.'});
  }
  return;
 }
 if(req.method==='POST'&&path==='/api/road-ipfs/nft-cover'){
  if(req.headers['content-type']!=='image/png'||req.headers['x-road-public-cover']!==PUBLIC_COVER_CONSENT){
   json(res,415,{error:'Explicit public NFT cover consent and image/png are required.'});return;
  }
  try{
   const bytes=await bodyBytes(req,MAX_NFT_COVER_BYTES);
   validateNftCoverPng(bytes);
   json(res,200,await storeCover(bytes,{fetchImpl}));
  }catch(error){json(res,error.status||400,{error:error.message||'Public NFT cover upload failed.'});}
  return;
 }
 if(req.method!=='POST'||path!=='/api/road-ipfs/upload'){json(res,404,{error:'Endpoint not available.'});return}
 if(req.headers['content-type']!=='application/octet-stream'||req.headers['x-road-encryption']!=='roadenc-v1'){
  json(res,415,{error:'Only encrypted ROADENC1 binary uploads are accepted.'});return;
 }
 try{const bytes=await bodyBytes(req);json(res,200,await store(bytes,{fetchImpl}));}
 catch(e){json(res,e.status||502,{error:e.message||'Kubo upload failed.'});}
}
export function startBridge({port=8791,host='127.0.0.1'}={}){
 if(!['127.0.0.1','localhost','::1'].includes(host))throw Error('The IPFS pilot bridge must bind to a loopback interface.');
 const server=createServer((req,res)=>{void handleUploadRequest(req,res).catch(()=>{
  if(!res.headersSent)json(res,500,{error:'Local YBR bridge request failed.'});else res.destroy();
 });});
 server.listen(port,host,()=>{process.stdout.write('YBR IPFS encrypted-content bridge on http://'+host+':'+port+' (local pilot only)\n');});
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)startBridge();
