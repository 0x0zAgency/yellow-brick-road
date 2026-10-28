import {readPublicNftCover} from './nft-cover-read.js';
import {MAX_NFT_COVER_BYTES,PUBLIC_COVER_CONSENT,validCoverCid,validateNftCoverPng} from './nft-cover-format.js';
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export async function uploadNftCover(bytes,{consent=false,fetchImpl=fetch,signal}={}){
 if(consent!==true)throw Error('Approve publishing a public NFT display copy first.');
 validateNftCoverPng(bytes);
 const digest=await hash(bytes);
 const response=await fetchImpl('/api/road-ipfs/nft-cover',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal,
  headers:{'Content-Type':'image/png','X-Road-Public-Cover':PUBLIC_COVER_CONSENT},body:bytes});
 const raw=await response.text();
 if(raw.length>8192)throw Error('Invalid NFT cover upload response.');
 let value;try{value=JSON.parse(raw);}catch{throw Error('NFT cover bridge unavailable. Restart the updated IPFS bridge.');}
 if(!response.ok)throw Error(value.error||'Public cover upload failed.');
 if(!validCoverCid(value.cid)||value.sha256!==digest||value.size!==bytes.length||value.size>MAX_NFT_COVER_BYTES||value.pinned!==true||value.verified!==true||value.mime!=='image/png')throw Error('Public cover pin or checksum could not be verified.');
 // Verify the exact browser-facing GET route, not just Kubo's upload response.
 // A successful pin/URI alone must never be reported as a viewable image.
 const imageURI='ipfs://'+value.cid;
 await readPublicNftCover(imageURI,{fetchImpl,signal,expectedSha256:digest});
 return {...value,imageURI,displayVerified:true};
}
