'use strict';
/** Local Ganache adapter for opt-in publicly streamable YBR sound-recording Bricks.
 * Protocol source of truth: YellowBrickFactory events + each Brick's on-chain
 * controller, contentHash, metadataDigest and metadataURI. Only locally
 * published, digest-matched, unencrypted media is eligible. Fail closed.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {ethers}=require('ethers');

const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const IPID=/^0x[0-9a-fA-F]{64}$/;
const AUDIO_TYPES=new Set(['audio/wav','audio/mpeg','audio/ogg','audio/mp4','audio/flac','audio/webm']);
const FACTORY_ABI=[
 'event BrickDeployed(bytes32 indexed ipId,address indexed brick,address indexed originator,bytes32 contentHash)',
 'function implementation() view returns (address)',
 'function isBrick(address) view returns (bool)'
];
const BRICK_ABI=[
 'function ipId() view returns (bytes32)','function originator() view returns (address)',
 'function controller() view returns (address)','function contentHash() view returns (bytes32)',
 'function metadataDigest() view returns (bytes32)','function metadataURI() view returns (string)'
];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const lower=s=>String(s).toLowerCase();
const LOCALHOSTS=new Set(['127.0.0.1','localhost','[::1]']);
function loopbackUrl(value){
 const parsed=new URL(value);
 if(parsed.protocol!=='http:'||!LOCALHOSTS.has(parsed.hostname)||parsed.username||parsed.password||
  parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('Ganache RPC must use an HTTP loopback origin');
 return parsed.origin;
}
function readFactoryAddress(repoRoot,env=process.env){
 if(env.YBR_GANACHE_FACTORY) {
  if(!ADDRESS.test(env.YBR_GANACHE_FACTORY))throw Error('Invalid YBR_GANACHE_FACTORY');
  return env.YBR_GANACHE_FACTORY;
 }
 for(const file of ['.road-local/factory.json','.road-local/ganache-mint-receipts.json']){
  try{
   const data=JSON.parse(fs.readFileSync(path.join(repoRoot,file),'utf8'));
   if(data.chainId===1337&&ADDRESS.test(data.factoryAddress))return data.factoryAddress;
  }catch(e){if(e.code!=='ENOENT')throw e;}
 }
 return null;
}
function makeGateway({repoRoot=path.resolve(__dirname,'../..'),rpcUrl=process.env.YBR_GANACHE_RPC||'http://127.0.0.1:8545',
 factoryAddress,publicOrigin=process.env.YBR_ROAD_PUBLIC_ORIGIN||'http://127.0.0.1:4173',
 documentDir=path.join(__dirname,'data/road-public'),mediaDir=path.join(__dirname,'media/road-public'),
 provider=null}={}){
 const rpc=loopbackUrl(rpcUrl);
 const origin=loopbackUrl(publicOrigin);
 const factoryAddr=factoryAddress===undefined?readFactoryAddress(repoRoot):factoryAddress;
 if(factoryAddr!==null&&!ADDRESS.test(factoryAddr))throw Error('Invalid factory address');
 const rpcProvider=provider||new ethers.providers.JsonRpcProvider(rpc,{name:'ganache-local',chainId:1337});
 const factory=factoryAddr?new ethers.Contract(factoryAddr,FACTORY_ABI,rpcProvider):null;
 const configuration={chainId:1337,kind:'ganache-local',factoryAddress:factoryAddr,publicOrigin:origin};
 async function ready(){
  if(!factory)return {ready:false,reason:'Factory not configured. Run npm run ganache:deploy and keep the chain running.',...configuration};
  try{
   const chain=await rpcProvider.getNetwork();
   if(chain.chainId!==1337)throw Error('Expected local Ganache chain ID 1337');
   if((await rpcProvider.getCode(factoryAddr))==='0x')throw Error('Configured factory has no deployed code. Has Ganache restarted?');
   const impl=await factory.implementation();
   if(!ADDRESS.test(impl)||(await rpcProvider.getCode(impl))==='0x')throw Error('Not a valid YellowBrickFactory');
   return {ready:true,...configuration};
  }catch(error){return {ready:false,reason:error.message,...configuration};}
 }
 async function getPublished(event){
  const {ipId,brick:address,originator,contentHash}=event.args;
  if(!IPID.test(ipId)||!ADDRESS.test(address))return null;
  const contract=new ethers.Contract(address,BRICK_ABI,rpcProvider);
  const [registered,id,controller,creator,mediaHash,metadataDigest,metadataURI]=await Promise.all([
   factory.isBrick(address),contract.ipId(),contract.controller(),contract.originator(),
   contract.contentHash(),contract.metadataDigest(),contract.metadataURI()
  ]);
  if(!registered||lower(id)!==lower(ipId)||lower(mediaHash)!==lower(contentHash)||lower(creator)!==lower(originator))return null;
  const base=origin+'/road/metadata/';
  if(metadataURI!==base+lower(ipId)||!IPID.test(metadataDigest))return null;
  const manifestPath=path.join(documentDir,lower(ipId)+'.json');
  let raw;
  try{raw=fs.readFileSync(manifestPath);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if('0x'+sha(raw)!==lower(metadataDigest))return null;
  let manifest;
  try{manifest=JSON.parse(raw.toString('utf8'));}catch{return null;}
  if(manifest?.standard!=='0x0z-road-ip'||manifest.schemaVersion!=='1.0.0'||manifest.objectType!=='sound-recording'||manifest.road?.ipId!==lower(ipId))return null;
  if(manifest.rights?.playback?.mode!=='public-stream'||manifest.rights.playback.audience!=='any-player'||
   manifest.rights.playback.authorization!=='controller-published-on-chain'||!manifest.rights.playback.terms)return null;
  // The current controller can revoke at any time by publishing new metadata on-chain.
  // A controller change suspends old opt-in grants until re-published by the new controller.
  if(lower(manifest.road.controllerAtPublication)!==lower(controller))return null;
  const master=manifest.media?.find(m=>m.role==='public-stream');
  if(!master||master.access?.visibility!=='public'||master.access.encryption!=='none'||
   !AUDIO_TYPES.has(master.mediaType)||master.integrity?.algorithm!=='sha2-256'||
   lower(master.integrity.digest)!==lower(mediaHash)||
   !Number.isSafeInteger(master.byteLength)||master.byteLength<=0)return null;
  const name=master.name;
  if(typeof name!=='string'||path.basename(name)!==name||!/^[-a-zA-Z0-9_.]+$/.test(name))return null;
  const audioPath=path.join(mediaDir,name);
  let bytes;
  try{bytes=fs.readFileSync(audioPath);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(bytes.length!==master.byteLength||'0x'+sha(bytes)!==lower(mediaHash))return null;
  const track={
   id:lower(ipId),type:'AudioBrick',title:manifest.title,creator:manifest.creators?.[0]?.name||'Unknown creator',
   description:manifest.description||'',durationSeconds:(manifest.music?.durationMs||0)/1000,theme:'gold',
   streamAllowed:true,source:'road',rights:{license:manifest.rights.playback.terms,notes:'On-chain controller publication (local Ganache demo). Not independent verification of legal rights.'},
   provenance:{agent:manifest.creators?.[0]?.name||'Publisher',activity:'Published to YBR Ganache',entity:lower(ipId),
    vocabulary:'https://www.w3.org/TR/prov-o/'},
   media:{mimeType:master.mediaType,sha256:sha(bytes)},
   road:{chainId:1337,brickAddress:address,ipId:lower(ipId),originator,controller,
    factoryAddress:factoryAddr,metadataURI,metadataDigest:lower(metadataDigest),contentHash:lower(mediaHash),
    licenseMode:'public-stream',terms:manifest.rights.playback.terms},
   mediaPath:audioPath
  };
  if(typeof track.title!=='string'||!track.title.trim())return null;
  return track;
 }
 async function list(){
  const status=await ready();
  if(!status.ready)return {status,tracks:[]};
  const latest=await rpcProvider.getBlockNumber();
  if(latest>99999)throw Error('Ganache local catalog scan capped at 100,000 blocks; use a Road indexer.');
  const events=await factory.queryFilter(factory.filters.BrickDeployed(),0,latest);
  if(events.length>1000)throw Error('Ganache local catalog scan capped at 1,000 Bricks');
  const tracks=[];
  for(const e of events){
   try{const item=await getPublished(e);if(item)tracks.push(item);}
   catch(error){if(process.env.YBR_PLAYER_DEBUG==='1')console.warn('Skipping invalid Road Brick',String(error));}
  }
  return {status,tracks};
 }
 async function track(ipId){
  if(!IPID.test(ipId))return null;
  const {tracks}=await list();
  return tracks.find(t=>t.id===lower(ipId))||null;
 }
 return {ready,list,track,config:configuration};
}
module.exports={makeGateway,readFactoryAddress,loopbackUrl};
