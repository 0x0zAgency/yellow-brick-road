/** Minimal YBR-to-Kubo bridge, deliberately NOT a generic /api/v0 proxy.
 * Only accepts encrypted .roadenc containers from the local Vite pilot.
 */
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';

const MiB=1024*1024;
export const MAX_CIPHERTEXT_BYTES=32*MiB;
const allowedOrigins=new Set(['http://localhost:5173','http://127.0.0.1:5173']);
const CID_RE=/^(?:bafy|bafk|baga|Qm)[a-zA-Z0-9]{20,120}$/;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function checkedKuboUrl(value){
 const url=new URL(value);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/')
  throw Error('Kubo API must be an HTTP loopback URL without credentials or a path.');
 return url.origin;
}
export const KUBO_RPC=checkedKuboUrl(process.env.YBR_KUBO_RPC||'http://127.0.0.1:5001');
export function parseAddOutput(text){
 const records=text.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
 const candidate=records.at(-1);
 if(!CID_RE.test(candidate?.Hash||''))throw Error('Kubo returned no valid content identifier.');
 return candidate.Hash;
}
async function kuboCall(path,{fetchImpl=fetch,body,timeout=90000}={}){
 const res=await fetchImpl(KUBO_RPC+'/api/v0/'+path,{method:'POST',body,signal:AbortSignal.timeout(timeout)});
 if(!res.ok)throw Error('Kubo RPC '+path.split('?')[0]+' failed (HTTP '+res.status+').');
 return res;
}
export async function storeEncryptedBytes(bytes,{fetchImpl=fetch}={}){
 const buffer=Buffer.from(bytes);
 if(!buffer.length||buffer.length>MAX_CIPHERTEXT_BYTES)throw Error('IPFS pilot permits 1 byte to 32 MiB per encrypted asset.');
 // 0ZROAD01 is the authenticated encrypted-container magic from road-encryption.js.
 if(!buffer.subarray(0,8).equals(Buffer.from('0ZROAD01')))throw Error('Only 0ZROAD01 encrypted containers may be uploaded.');
 const headerLength=(buffer[8]<<8)|buffer[9],end=10+headerLength;
 if(!headerLength||end+16>buffer.length)throw Error('Malformed encrypted container.');
 let header;
 try{header=JSON.parse(buffer.subarray(10,end).toString('utf8'))}catch{throw Error('Invalid encrypted-container header.')}
 if(header.v!==1||header.alg!=='AES-256-GCM'||header.kdf!=='PBKDF2-SHA-256'||
    header.iterations!==310000||!Number.isSafeInteger(header.bytes)||header.bytes<0||
    !/^[0-9a-f]{32}$/.test(header.salt||'')||!/^[0-9a-f]{24}$/.test(header.iv||'')||
    header.name!=='encrypted-work'&&header.name!=='brick-metadata')
  throw Error('Unsupported or potentially plaintext-leaking encrypted header.');
 if(header.mime!=='application/octet-stream')
  throw Error('Encrypted upload metadata must not expose the original media type.');
 if(buffer.length-end!==header.bytes+16)throw Error('Ciphertext length disagrees with encrypted-container header.');
 const multipart=new FormData();
 multipart.append('file',new Blob([buffer],{type:'application/octet-stream'}),'ciphertext.roadenc');
 const added=await kuboCall('add?cid-version=1&pin=true&wrap-with-directory=false&progress=false',{fetchImpl,body:multipart});
 const cid=parseAddOutput(await added.text());
 // Verify that the pinned Kubo node can actually serve exactly the submitted ciphertext.
 const retrieved=await kuboCall('cat?arg='+encodeURIComponent(cid),{fetchImpl});
 const remote=Buffer.from(await retrieved.arrayBuffer());
 if(remote.length!==buffer.length||sha256(remote)!==sha256(buffer))
  throw Error('Kubo CID retrieval differs from submitted ciphertext.');
 const pins=await kuboCall('pin/ls?arg='+encodeURIComponent(cid),{fetchImpl});
 const pinned=await pins.json();
 if(!pinned.Keys?.[cid])throw Error('CID was uploaded but its persistent pin was not confirmed.');
 return {cid,sha256:sha256(buffer),size:buffer.length,pinned:true,verified:true};
}
async function bodyBytes(req,max=MAX_CIPHERTEXT_BYTES){
 if(Number(req.headers['content-length']||0)>max)throw Object.assign(Error('Encrypted payload exceeds 32 MiB limit.'),{status:413});
 const parts=[];let len=0;
 for await(const part of req){len+=part.length;if(len>max)throw Object.assign(Error('Encrypted payload exceeds 32 MiB limit.'),{status:413});parts.push(part);}
 return Buffer.concat(parts,len);
}
const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))};
export async function handleUploadRequest(req,res,{store=storeEncryptedBytes,fetchImpl=fetch}={}){
 const url=new URL(req.url,'http://127.0.0.1:8791');
 const origin=req.headers.origin;
 if(origin&&!allowedOrigins.has(origin)){json(res,403,{error:'Only the local Mint Studio origin is allowed.'});return}
 if(req.method==='GET'&&url.pathname==='/api/road-ipfs/health'){
  try{
   const response=await kuboCall('id',{fetchImpl,timeout:5000});
   const data=await response.json();
   json(res,200,{ok:true,provider:'ybr-local-kubo',peerId:data.ID});
  }catch(e){json(res,503,{ok:false,error:'Kubo node unavailable: '+e.message})}
  return;
 }
 if(req.method!=='POST'||url.pathname!=='/api/road-ipfs/upload'){json(res,404,{error:'Endpoint not available.'});return}
 if(req.headers['content-type']!=='application/octet-stream'||req.headers['x-road-encryption']!=='roadenc-v1'){
  json(res,415,{error:'Only encrypted ROADENC1 binary uploads are accepted.'});return;
 }
 try{const bytes=await bodyBytes(req);json(res,200,await store(bytes,{fetchImpl}));}
 catch(e){json(res,e.status||502,{error:e.message||'Kubo upload failed.'});}
}
export function startBridge({port=8791,host='127.0.0.1'}={}){
 const server=createServer((req,res)=>{void handleUploadRequest(req,res)});
 server.listen(port,host,()=>{process.stdout.write('YBR IPFS encrypted-upload bridge on http://'+host+':'+port+' (local pilot only)\n');});
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)startBridge();
