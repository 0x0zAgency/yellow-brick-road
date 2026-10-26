/** Pure bounded raster preparation, shared by appearance and NFT display copies. No vault or upload access. */
import {MAX_NFT_COVER_BYTES,MAX_NFT_COVER_SOURCE_BYTES,validateNftCoverPng} from './nft-cover-format.js';
const abort=signal=>{if(signal?.aborted)throw new DOMException('Cover preparation canceled.','AbortError');};
export function coverSourceMime(bytes){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX_NFT_COVER_SOURCE_BYTES)throw Error('Choose a PNG, JPEG or WebP cover no larger than 8 MiB.');
 if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP')return 'image/webp';
 throw Error('NFT covers support PNG, JPEG and WebP, not SVG or encrypted containers.');
}
/** Render a deliberately public derivative. Source EXIF/text/C2PA are not copied or claimed. */
export async function prepareNftCover(bytes,{signal}={}){
 abort(signal);
 const mime=coverSourceMime(bytes),url=URL.createObjectURL(new Blob([bytes],{type:mime}));
 const image=new Image();
 try{
  await new Promise((resolve,reject)=>{
   const cancel=()=>{image.src='';finish(new DOMException('Cover preparation canceled.','AbortError'));};
   const finish=error=>{signal?.removeEventListener('abort',cancel);image.onload=null;image.onerror=null;error?reject(error):resolve();};
   image.onload=()=>finish();image.onerror=()=>finish(Error('This cover could not be decoded. Choose another PNG, JPEG or WebP.'));
   signal?.addEventListener('abort',cancel,{once:true});image.src=url;
  });
  abort(signal);
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width||!height||width>16384||height>16384||width*height>32000000)throw Error('Cover exceeds the 32-megapixel input limit. Resize it locally first.');
  let scale=Math.min(1,512/width,512/height);
  for(let attempt=0;attempt<4;attempt++,scale/=2){
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
   const context=canvas.getContext('2d');if(!context)throw Error('Canvas is unavailable in this browser.');
   context.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   abort(signal);
   if(blob&&blob.size<=MAX_NFT_COVER_BYTES){const result=new Uint8Array(await blob.arrayBuffer());validateNftCoverPng(result);return result;}
  }
  throw Error('Cannot create a display copy within the 512 KiB limit.');
 }finally{image.src='';URL.revokeObjectURL(url);}
}
