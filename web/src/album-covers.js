/** Album tags suggest public display copies, never shared track metadata or rights. */
import {readRegistrationCover,publicCoverSource} from './brick-presentation.js';
export const ALBUM_COVERS_KEY='road:album-covers:v1';
const same=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase();
const address=value=>/^0x[\da-f]{40}$/i.test(value||'');
const hash=value=>/^0x[\da-f]{64}$/i.test(value||'');
export const normalizeAlbum=value=>typeof value==='string'?value.normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase():'';
export function previewAlbum(assets){
 const preview=assets?.preview;
 return preview?.status==='ready'&&preview.hash&&preview.extracted?.fieldSources?.release==='embedded audio tags'?
  preview.extracted.fields.release||'':'';
}
const albumHash=async album=>'0x'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalizeAlbum(album)))),x=>x.toString(16).padStart(2,'0')).join('');
function clean(record){
 if(!record||!hash(record.albumKey)||!address(record.wallet)||!address(record.factoryAddress)||!address(record.brickAddress)||!hash(record.genesisHash)||!hash(record.ipId)||!Number.isSafeInteger(record.chainId)||record.chainId<=0)return null;
 // No raw album tags, metadata, file names, images or keys in this index.
 return Object.fromEntries(['albumKey','wallet','factoryAddress','brickAddress','genesisHash','ipId','chainId'].map(key=>[key,record[key]]));
}
export function loadAlbumCovers(storage){
 try{const raw=storage?.getItem(ALBUM_COVERS_KEY);if(!raw||raw.length>256*1024)return [];
  const records=JSON.parse(raw);return Array.isArray(records)&&records.length<=200?records.map(clean).filter(Boolean):[];
 }catch{return [];}
}
export async function rememberAlbumCover(storage,{album,packet,mint}){
 if(!normalizeAlbum(album)||mint?.simulated!==false||mint.status!=='confirmed'||mint.nftCover?.status!=='verified'||!publicCoverSource(mint.nftCover.imageURI))return;
 if(!mint.receipts?.length||mint.receipts.some(r=>r.status!=='verified'))return;
 const receipt=mint.receipts.find(r=>r.sourceId==='master');
 const record=clean({albumKey:await albumHash(album),wallet:packet?.account?.address,chainId:mint.chainId,factoryAddress:mint.factoryAddress,
  genesisHash:mint.genesisHash,brickAddress:receipt?.contractAddress,ipId:receipt?.id});
 if(!record)return;
 const records=loadAlbumCovers(storage).filter(r=>!(same(r.brickAddress,record.brickAddress)&&same(r.genesisHash,record.genesisHash)&&r.chainId===record.chainId));
 storage?.setItem(ALBUM_COVERS_KEY,JSON.stringify([record,...records].slice(0,200)));
}
export function matchingPlayerUploads(uploads,{album,wallet,chainId,factoryAddress,genesisHash}){
 if(!normalizeAlbum(album))return [];
 return (Array.isArray(uploads)?uploads:[]).slice(0,200).filter(upload=>{
  const auth=upload?.authorization;
  return normalizeAlbum(upload?.album)===normalizeAlbum(album)&&auth?.chainId===Number(chainId)&&same(auth.factoryAddress,factoryAddress)&&
   same(auth.genesisHash,genesisHash)&&same(auth.sources?.audio?.controller,wallet)&&address(auth.sources?.audio?.brickAddress);
 }).map(upload=>({wallet,chainId:Number(chainId),factoryAddress,genesisHash,brickAddress:upload.authorization.sources.audio.brickAddress}));
}
async function playerUploads(fetchImpl,signal){
 const request=async(path,headers)=>{
  const response=await fetchImpl('/api/player-publish/'+path,{credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers});
  if(!response.ok)throw Error('Previous Player uploads unavailable.');return response.json();
 };
 const config=await request('config');if(!/^[a-f0-9]{64}$/.test(config.token||''))throw Error('Player publishing session unavailable.');
 return (await request('cover-studio',{'X-YBR-Publish-Token':config.token})).uploads;
}
async function connect(options){
 const {connectChain}=await import('./chain-mint.js');
 return connectChain({...options,account:options.wallet});
}
const aborted=signal=>{if(signal?.aborted)throw new DOMException('Album lookup canceled.','AbortError');};
export async function verifyAlbumCover(candidate,options,{client,readCover=readRegistrationCover}={}){
 if(!candidate||!address(options.wallet)||!same(candidate.wallet,options.wallet)||candidate.chainId!==Number(options.chainId)||!same(candidate.factoryAddress,options.factoryAddress))throw Error('Album artwork belongs to another wallet or network. Review it again.');
 if(!client)({client}=await connect(options));
 if(!same((await client.getBlock({blockNumber:0n})).hash,candidate.genesisHash))throw Error('The earlier upload belongs to another chain history.');
 const imageURI=await readCover({client,chainId:Number(options.chainId),factoryAddress:options.factoryAddress,
  brickAddress:candidate.brickAddress,ipId:candidate.ipId,originator:options.wallet});
 if(!publicCoverSource(imageURI)||candidate.imageURI&&candidate.imageURI!==imageURI)throw Error('The previous NFT artwork changed or is unavailable. Review the album suggestion again.');
 return imageURI;
}
export async function findAlbumCovers(options,dependencies={}){
 if(!normalizeAlbum(options.album)||!address(options.wallet)||!address(options.factoryAddress))return {covers:[],playerUnavailable:false};
 const {client,check}=await (dependencies.connect||connect)(options);
 const genesisHash=(await client.getBlock({blockNumber:0n})).hash;
 const scope={...options,chainId:Number(options.chainId),genesisHash},albumKey=await albumHash(options.album);
 const records=loadAlbumCovers(options.storage).filter(r=>same(r.albumKey,albumKey)&&same(r.wallet,options.wallet)&&r.chainId===scope.chainId&&same(r.factoryAddress,options.factoryAddress)&&same(r.genesisHash,genesisHash));
 let playerUnavailable=false;
 try{records.push(...matchingPlayerUploads(await (dependencies.playerUploads||playerUploads)(dependencies.fetchImpl||fetch,options.signal),scope));}
 catch{playerUnavailable=true;}
 aborted(options.signal);
 const unique=[...new Map(records.map(r=>[r.brickAddress.toLowerCase(),r])).values()].slice(0,20),covers=[];
 const abi=[{type:'function',name:'ipId',stateMutability:'view',inputs:[],outputs:[{type:'bytes32'}]}];
 for(const record of unique){
  aborted(options.signal);
  try{
   const ipId=record.ipId||await client.readContract({address:record.brickAddress,abi,functionName:'ipId'});
   const candidate={...record,ipId};
   const imageURI=await verifyAlbumCover(candidate,scope,{client,readCover:dependencies.readCover});
   if(!covers.some(c=>c.imageURI===imageURI))covers.push({...candidate,imageURI});
  }catch{/* Stale or fallback-only NFTs are not suggestions. */}
 }
 await check();aborted(options.signal);
 return {covers,playerUnavailable};
}
