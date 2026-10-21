import {permissionForFile} from './content-policy.js';
/** Mint Studio -> local reference Player adapter, not a new rights standard.
 * Only selected preview copies leave the browser, after explicit consent.
 * Never serialize the vault, recovery key, private packet, or encrypted source.
 */
import {openDemoDownload} from './demo-vault.js';
const AUDIO_TYPES={mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',opus:'audio/ogg',m4a:'audio/mp4',mp4:'audio/mp4',flac:'audio/flac',webm:'audio/webm',aac:'audio/aac'};
const IMAGE_TYPES={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
const LIMITS={audio:32*1024*1024,artwork:8*1024*1024,lyrics:512*1024};
const extension=file=>String(file?.name||'').split('.').at(-1).toLowerCase();
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
function mimeFor(file,role){
 const ext=extension(file);
 if(role==='audio')return AUDIO_TYPES[ext]||Object.values(AUDIO_TYPES).find(type=>type===file?.mediaType)||null;
 if(role==='artwork')return IMAGE_TYPES[ext]||null;
 return ext==='txt'?'text/plain':ext==='vtt'?'text/vtt':null;
}
export function playerReleaseFiles(packet){
 const files=new Map();
 for(const brick of packet?.bricks||[])for(const file of brick.metadata?.media||[]){if(file?.role&&!files.has(file.role))files.set(file.role,file);}
 const preview=files.get('preview');
 // Player delivery must never decrypt or substitute the Master Recording.
 const audio=mimeFor(preview,'audio')?preview:null;
 const artwork=files.get('artwork'),lyrics=files.get('lyrics');
 return {audio,artwork,lyrics,files:[...files.values()]};
}
function base64(bytes){
 const parts=[];for(let at=0;at<bytes.length;at+=24576)parts.push(String.fromCharCode(...bytes.subarray(at,at+24576)));
 return btoa(parts.join(''));
}
function checkAbort(signal){if(signal?.aborted)throw new DOMException('Preview sharing canceled.','AbortError');}
export async function buildPlayerRelease({packet,mint,vault,consent=false,includeArtwork=true,includeLyrics=true,signal}={}){
 if(consent!==true)throw Error('Confirm sharing selected preview copies with the local Player.');
 if(!packet?.bricks?.length||!mint||(mint.simulated!==true&&mint.status!=='confirmed'))throw Error('Finish the demo or test-chain mint before sharing a preview.');
 const selection=playerReleaseFiles(packet);
 if(!permissionForFile(packet,'preview'))throw Error('Audio Preview playback was disabled in the pre-mint permissions. Update the Brick permissions before publishing.');
 if(!selection.audio)throw Error('Attach a supported Audio Preview (MP3, WAV, OGG, FLAC, M4A, WEBM or AAC). The Master Recording is never used for Player playback.');
 if(!vault?.secret||!vault.encrypted?.get)throw Error('This browser session no longer has the encrypted uploads. Reattach the originals in Mint Studio.');
 const picked={audio:selection.audio};
 if(includeArtwork&&selection.artwork&&permissionForFile(packet,'artwork'))picked.artwork=selection.artwork;
 if(includeLyrics&&selection.lyrics&&permissionForFile(packet,'lyrics'))picked.lyrics=selection.lyrics;
 // Validate every selection before decrypting any file.
 for(const [role,file] of Object.entries(picked)){
  if(!mimeFor(file,role))throw Error(role==='artwork'?'Player covers support PNG, JPEG or WebP.':'Player lyrics support UTF-8 .txt or WebVTT .vtt.');
  if(!Number.isSafeInteger(file.byteLength)||file.byteLength<1||file.byteLength>LIMITS[role])throw Error(role+' exceeds the local preview limit. Audio: 32 MiB; cover: 8 MiB; lyrics: 512 KiB.');
  if(!/^0x[0-9a-f]{64}$/i.test(file.integrity?.digest||''))throw Error('The selected '+role+' has no original-file checksum.');
 }
 let authorization=null;
 if(mint.simulated!==true){
  if(mint.chainId!==1337||!/^0x[0-9a-f]{64}$/i.test(mint.genesisHash||''))throw Error('The local Player requires Ganache policy-enabled mint receipts. Legacy mints need a policy-enabled registration; Sepolia delivery is not configured.');
  const sources={};
  for(const [role,file] of Object.entries(picked)){
   const owner=packet.bricks.find(brick=>brick.metadata.media?.some(item=>item.role===file.role));
   const receipt=mint.receipts?.find(item=>item.sourceId===owner?.localId);
   if(!receipt?.contentPolicy||receipt.status!=='verified')throw Error('This Brick has no verified Player permission. Do not substitute a local consent checkbox for an on-chain grant.');
   sources[role]={brickAddress:receipt.contractAddress,controller:receipt.contentPolicy.controller,revision:receipt.contentPolicy.revision};
  }
  authorization={format:'ybr-player-onchain/v1',chainId:mint.chainId,factoryAddress:mint.factoryAddress,genesisHash:mint.genesisHash,sources};
 }
 const assets={};
 for(const [role,file] of Object.entries(picked)){
  checkAbort(signal);
  const entry=vault.encrypted.get(file.role);
  const output=await openDemoDownload({entry,secret:vault.secret,authorized:true});
  checkAbort(signal);
  const digest=await hash(output.bytes);
  if(digest!==file.integrity.digest.slice(2).toLowerCase()||output.bytes.length!==file.byteLength)throw Error('The '+role+' no longer matches the reviewed release.');
  assets[role]={name:file.name,mime:mimeFor(file,role),sha256:digest,base64:base64(output.bytes)};
 }
 checkAbort(signal);
 const primary=packet.bricks.find(brick=>brick.localId==='master')||packet.bricks[0];
 const metadata=primary.metadata;
 return {format:'ybr-studio-preview/1',audioSourceRole:'preview',consent:'share-selected-copies-with-local-player',
  authorization,title:metadata.title,creator:metadata.creators?.[0]?.name||'Creator',album:metadata.music?.release||'',description:(metadata.description||'').slice(0,2000),assets,
  files:selection.files.map(file=>({role:file.role,name:file.name,sharedAs:Object.entries(picked).find(([,selected])=>selected.role===file.role)?.[0]||null})),
  credits:[...new Map(packet.bricks.flatMap(brick=>(brick.metadata.creators||[]).map(person=>({name:person.name,role:person.role||'creator'}))).map(person=>[person.name+'|'+person.role,person])).values()],
  bricks:packet.bricks.map(brick=>({role:brick.role,title:brick.metadata.title,address:mint.receipts?.find(receipt=>receipt.sourceId===brick.localId)?.contractAddress||null}))};
}
async function jsonRequest(path,options,fetchImpl){
 const response=await fetchImpl(path,{credentials:'same-origin',cache:'no-store',redirect:'error',...options});
 let value;try{value=await response.json();}catch{throw Error('The YBR Player is unavailable. Start it with the integrated web app.');}
 if(!response.ok)throw Error(value.error||'The Player rejected this preview.');
 return value;
}
export async function publishPlayerRelease(options,{fetchImpl=fetch,signal}={}){
 const config=await jsonRequest('/api/player-publish/config',{signal},fetchImpl);
 if(!/^[0-9a-f]{64}$/.test(config.token||''))throw Error('The local Player did not provide a valid publishing session.');
 const payload=await buildPlayerRelease({...options,signal});
 checkAbort(signal);
 return jsonRequest('/api/player-publish/releases',{method:'POST',headers:{'Content-Type':'application/json','X-YBR-Publish-Token':config.token},body:JSON.stringify(payload),signal},fetchImpl);
}
export async function removePlayerRelease(id,{fetchImpl=fetch,signal}={}){
 if(!/^STUDIO-[a-f0-9]{64}$/.test(id||''))throw Error('Invalid local release.');
 const config=await jsonRequest('/api/player-publish/config',{signal},fetchImpl);
 return jsonRequest('/api/player-publish/releases/'+id,{method:'DELETE',headers:{'X-YBR-Publish-Token':config.token},signal},fetchImpl);
}
