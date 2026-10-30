/** Local HTTPS IPFS gateway for wallet image requests. Public PNG derivatives
 * only; this does not proxy Kubo's admin API or the encrypted recovery bridge. */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import {X509Certificate,createPrivateKey} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import httpsTools from '../../scripts/dev-https.cjs';
import {KUBO_RPC,retrieveNftCover,sha256} from './ipfs-bridge.mjs';
import {validCoverCid,validateNftCoverPng} from '../src/nft-cover-format.js';

const ROOT=fileURLToPath(new URL('../..',import.meta.url));
export const WALLET_GATEWAY_PORT=8792;
export const WALLET_GATEWAY_HOST='localhost:'+WALLET_GATEWAY_PORT;
const directory=root=>path.join(root,'.road-local','wallet-gateway');
const {privateDirectory,readPrivate}=httpsTools;
const files=['key.pem','cert.pem','ca.pem'];

function validateTls(dir){
 privateDirectory(path.dirname(dir));privateDirectory(dir);
 const [key,cert,ca]=files.map(name=>readPrivate(path.join(dir,name)));
 const leaf=new X509Certificate(cert),issuer=new X509Certificate(ca),now=Date.now();
 for(const c of [leaf,issuer])if(now<Date.parse(c.validFrom)||now>=Date.parse(c.validTo))throw Error('Wallet gateway certificate expired.');
 if(!issuer.ca||leaf.ca||!leaf.verify(issuer.publicKey)||!leaf.checkPrivateKey(createPrivateKey(key))||
    !leaf.checkHost('localhost')||!leaf.checkIP('127.0.0.1')||!leaf.checkHost('cover.ipfs.localhost'))
  throw Error('Wallet gateway requires a matching certificate for localhost and *.ipfs.localhost.');
 return {key,cert,ca,minVersion:'TLSv1.2'};
}
export function loadWalletTls(root=ROOT){
 // Absence is an unconfigured optional service; malformed configuration fails.
 try{fs.lstatSync(directory(root));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 return validateTls(directory(root));
}
export function setupWalletGateway(root=ROOT,{run=spawnSync,log=console.log,expectedCa}={}){
 if(loadWalletTls(root)){log('[YBR] Wallet gateway certificates are ready.');return;}
 const version=run('mkcert',['-version'],{encoding:'utf8'});
 if(version.error||version.status!==0)throw Error('Install mkcert and run npm run setup:https first.');
 const result=run('mkcert',['-CAROOT'],{encoding:'utf8'});
 if(result.error||result.status!==0||!result.stdout?.trim())throw Error('Cannot locate the existing mkcert CA. Run npm run setup:https first.');
 const caFile=path.join(result.stdout.trim(),'rootCA.pem');
 if(!fs.existsSync(caFile))throw Error('No existing mkcert CA. Run npm run setup:https first.');
 const stat=fs.lstatSync(caFile);
 if(!stat.isFile()||stat.size>1024*1024)throw Error('Invalid mkcert CA certificate.');
 const ca=fs.readFileSync(caFile);if(!new X509Certificate(ca).ca)throw Error('Invalid mkcert CA certificate.');
 if(expectedCa&&new X509Certificate(ca).fingerprint256!==new X509Certificate(expectedCa).fingerprint256)
  throw Error('The current mkcert CA differs from this checkout’s HTTPS CA. Run npm run setup:wallet explicitly after checking local certificate trust.');
 const local=path.join(root,'.road-local');privateDirectory(local,{create:true});
 const temp=fs.mkdtempSync(path.join(local,'wallet-tls-'));fs.chmodSync(temp,0o700);
 try{
  // Reuse the existing CA. Never install trust, copy its private key, replace
  // the app's certificates, or change the OS/browser certificate policy here.
  const generated=run('mkcert',['-cert-file',path.join(temp,'cert.pem'),'-key-file',path.join(temp,'key.pem'),
   'localhost','127.0.0.1','::1','*.ipfs.localhost'],{stdio:'inherit'});
  if(generated.error||generated.status!==0)throw Error('Could not create wallet gateway certificates.');
  fs.writeFileSync(path.join(temp,'ca.pem'),ca,{flag:'wx',mode:0o600});
  for(const name of files)fs.chmodSync(path.join(temp,name),0o600);
  validateTls(temp);fs.renameSync(temp,directory(root));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
 log('[YBR] Wallet gateway ready. Start npm run wallet:gateway, or restart npm run dev.');
 log('[YBR] In MetaMask Settings > Privacy > IPFS gateway, enter https://'+WALLET_GATEWAY_HOST+'.');
}

/** A clean checkout can retain app HTTPS while losing its separate wallet leaf.
 * Reissue only that missing leaf with the same existing CA. Never install trust,
 * replace an existing wallet certificate, or change the app's browser origin. */
export function prepareWalletGateway(root=ROOT,{run=spawnSync,log=console.log}={}){
 const existing=loadWalletTls(root);if(existing)return existing;
 const appTls=httpsTools.loadHttps(root,{});
 if(!appTls){
  log('[YBR] Wallet artwork is not configured. For local MetaMask images, run npm run setup:https, then npm run setup:wallet. Set its IPFS gateway to https://'+WALLET_GATEWAY_HOST+'.');
  return null;
 }
 try{
  log('[YBR] Restoring missing wallet image certificates using this checkout’s existing HTTPS CA...');
  setupWalletGateway(root,{run,log,expectedCa:appTls.ca});
  return loadWalletTls(root);
 }catch(error){
  // Optional artwork delivery must not prevent the rest of the stack starting.
  // No unverified/HTTP wallet endpoint is substituted when restoration fails.
  log('[YBR] Wallet artwork setup required: '+error.message);
  log('[YBR] Run npm run setup:wallet, then npm run wallet:gateway. NFT metadata was not changed.');
  return null;
 }
}

/** Standard path and CID subdomain forms. No paths into private originals. */
export function walletCoverRequest(host,url){
 if(typeof host!=='string'||typeof url!=='string'||/[?#%\\]/.test(url))return null;
 let parsed;try{parsed=new URL('https://'+host);}catch{return null;}
 if(parsed.host!==host||parsed.pathname!=='/'||parsed.username||parsed.password||parsed.search||parsed.hash)return null;
 const name=parsed.hostname;
 if(['localhost','127.0.0.1','[::1]'].includes(name)){
  if(url==='/health')return {health:true};
  const cid=url.startsWith('/ipfs/')?url.slice(6):'';
  return validCoverCid(cid)?{cid}:null;
 }
 const match=/^([a-z2-7]{1,63})\.ipfs\.localhost$/.exec(name);
 return match&&url==='/'&&validCoverCid(match[1])?{cid:match[1]}:null;
}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
export function createWalletHandler({retrieve=retrieveNftCover,kuboRpc=KUBO_RPC}={}){
 const pending=new Map(); // Coalesce a wallet grid's concurrent requests.
 return async(req,res)=>{
  const target=walletCoverRequest(req.headers.host,req.url);
  if(!target){json(res,404,{error:'Public thumbnail endpoint not found.'});return;}
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');json(res,405,{error:'Read-only image gateway.'});return;}
  if(target.health){json(res,200,{format:'ybr-wallet-gateway/1',kuboRpc});return;}
  try{
   if(!pending.has(target.cid)){
    if(pending.size>=16){json(res,503,{error:'Thumbnail gateway busy. Retry shortly.'});return;}
    const job=Promise.resolve().then(()=>retrieve(target.cid));pending.set(target.cid,job);
    void job.finally(()=>pending.delete(target.cid)).catch(()=>{});
   }
   const {bytes}=await pending.get(target.cid);
   validateNftCoverPng(bytes);
   res.writeHead(200,{'Content-Type':'image/png','Content-Length':bytes.length,
    'Content-Disposition':'inline; filename="nft-cover.png"','Cache-Control':'private, max-age=300',
    'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",
    // Wallet extensions load these intentionally public pixels cross-origin.
    // The private upload/recovery bridge keeps its own same-origin restrictions.
    'Cross-Origin-Resource-Policy':'cross-origin','Access-Control-Allow-Origin':'*',
    'X-Road-CID':target.cid,'X-Road-Image-SHA256':sha256(bytes)});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){
   const code=['COVER_ENCRYPTED','COVER_NOT_PNG','COVER_TIMEOUT'].includes(error.code)?error.code:'COVER_UNAVAILABLE';
   json(res,code==='COVER_ENCRYPTED'||code==='COVER_NOT_PNG'?422:503,{code,error:'Public PNG unavailable from this IPFS node.'});
  }
 };
}
export async function startWalletGateway({root=ROOT,port=WALLET_GATEWAY_PORT,tls=loadWalletTls(root),handler=createWalletHandler()}={}){
 if(!tls)throw Error('Run npm run setup:wallet first.');
 const server=https.createServer(tls,(req,res)=>void handler(req,res).catch(()=>{
  if(!res.headersSent)json(res,500,{error:'Wallet image request failed.'});else res.destroy();
 }));
 server.requestTimeout=15000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return server;
}
export function probeWalletGateway(tls){
 return new Promise((resolve,reject)=>{
  const req=https.get({hostname:'127.0.0.1',port:WALLET_GATEWAY_PORT,path:'/health',ca:tls.ca},res=>{
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>4096){res.destroy();reject(Error('Unexpected wallet gateway response.'));}else chunks.push(chunk);});
   res.on('error',reject);res.on('end',()=>{
    try{const data=JSON.parse(Buffer.concat(chunks));if(res.statusCode!==200||data.format!=='ybr-wallet-gateway/1'||data.kuboRpc!==KUBO_RPC)throw Error();resolve(true);}
    catch{reject(Error('Port 8792 is not this YBR wallet gateway. Stop the conflicting service.'));}
   });
  });
  req.setTimeout(3000,()=>req.destroy(Error('Wallet gateway health check timed out.')));
  req.on('error',e=>e.code==='ECONNREFUSED'?resolve(false):reject(e));
 });
}
export async function ensureWalletGateway({root=ROOT,spawnOwned,waitUntil,log=console.log,run=spawnSync,probe=probeWalletGateway}={}){
 const tls=prepareWalletGateway(root,{run,log});if(!tls)return;
 if(!await probe(tls)){
  const child=spawnOwned('YBR wallet gateway',process.execPath,[fileURLToPath(import.meta.url)]);let error;
  child.once('error',e=>{error=e;});
  await waitUntil('YBR wallet gateway',async()=>{
   if(error||child.exitCode!==null||child.signalCode!==null)throw Object.assign(Error('Wallet gateway failed to start.'),{fatal:true});
   return probe(tls);
  },{timeoutMs:10000});
 }
 log('[YBR] Public NFT wallet gateway: https://'+WALLET_GATEWAY_HOST+' (MetaMask Settings > Privacy > IPFS gateway).');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.includes('--setup'))setupWalletGateway();
  else{await startWalletGateway();console.log('[YBR] Public NFT thumbnails at https://'+WALLET_GATEWAY_HOST+' (loopback only).');}
 }catch(error){console.error('[YBR] '+error.message);process.exitCode=1;}
}
