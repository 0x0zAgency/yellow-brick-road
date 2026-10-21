/** YBR's free Player permission profile. File tags cannot set this policy.
 * The mint commits it atomically; a local checkbox is not an on-chain grant.
 */
export const PLAYER_APPLICATION='urn:ybr:application:ybr-player:v1';
export const ZERO_HASH='0x'+'0'.repeat(64);
export const DEFAULT_CONTENT_POLICY=Object.freeze({preview:true,artwork:true,lyrics:true,locked:false});
const HASH=/^0x[0-9a-f]{64}$/i;
const bits={preview:1,artwork:2,lyrics:4};
export function policyFileManifest(media=[]){
 if(!Array.isArray(media)||media.length>64)throw Error('Invalid policy file set.');
 const seen=new Set();
 return media.map(file=>{
  if(typeof file.role!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(file.role)||seen.has(file.role)||
     file.integrity?.algorithm!=='sha2-256'||!HASH.test(file.integrity?.digest||'')||
     !Number.isSafeInteger(file.byteLength)||file.byteLength<0)throw Error('Every policy file needs a unique role, SHA-256 and byte length.');
  seen.add(file.role);
  return [file.role,file.integrity.digest.toLowerCase(),file.byteLength];
 }).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
}
export function addContentPolicy(bricks,selection){
 if(!selection)return bricks; // Explicit compatibility path for older model callers.
 for(const key of ['preview','artwork','lyrics','locked'])if(typeof selection[key]!=='boolean')throw Error('Review all Player permissions and content lock options.');
 return bricks.map(brick=>{
  const manifest=policyFileManifest(brick.metadata.media);
  const present=new Set(manifest.map(file=>file[0]));
  const permissions=Object.fromEntries(Object.keys(bits).map(role=>[role,selection[role]&&present.has(role)]));
  return {...brick,metadata:{...brick.metadata,
   rights:{...brick.metadata.rights,player:{application:PLAYER_APPLICATION,profile:'local-preview-v1',
    status:'proposal-until-confirmed-on-chain',permissions,
    terms:'Revocable YBR Player preview playback and selected artwork/lyrics display only. No master access, download entitlement, commercial sublicense, redistribution or AI training grant.'}},
   extensions:{...brick.metadata.extensions,contentPolicy:{version:1,locked:selection.locked,initialRevision:1,fileManifest:manifest}}
  }};
 });
}
export async function initialPolicyFor(metadata){
 const declaration=metadata?.extensions?.contentPolicy;
 if(!declaration)return null;
 if(declaration.version!==1||typeof declaration.locked!=='boolean'||metadata.rights?.player?.application!==PLAYER_APPLICATION)
  throw Error('Unsupported content policy.');
 const manifest=policyFileManifest(metadata.media);
 if(JSON.stringify(declaration.fileManifest)!==JSON.stringify(manifest))throw Error('Files changed after policy review.');
 const files=Object.fromEntries(manifest.map(([role,digest])=>[role,digest]));
 const permissions=metadata.rights.player.permissions;
 let mask=0;
 for(const [role,bit] of Object.entries(bits)){
  if(typeof permissions?.[role]!=='boolean'||permissions[role]&&!files[role])throw Error('Permission has no matching uploaded file.');
  if(permissions[role])mask|=bit;
 }
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(manifest))));
 return {files:{manifestDigest:'0x'+Array.from(digest,b=>b.toString(16).padStart(2,'0')).join(''),
  previewHash:files.preview||ZERO_HASH,artworkHash:files.artwork||ZERO_HASH,lyricsHash:files.lyrics||ZERO_HASH},
  permissions:mask,locked:declaration.locked};
}
export function permissionForFile(packet,role){
 const brick=packet?.bricks?.find(b=>b.metadata.media?.some(file=>file.role===role));
 const policy=brick?.metadata.rights?.player;
 return policy?policy.application===PLAYER_APPLICATION&&policy.permissions?.[role]===true:true;
}
