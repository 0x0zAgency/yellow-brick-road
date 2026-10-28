/** Read the public display derivative only. Never request Brick metadata or a key. */
import {MAX_NFT_COVER_BYTES,validateNftCoverPng} from './nft-cover-format.js';
import {publicCoverSource as publicCoverPath} from './brick-presentation.js';
export {publicCoverSource as publicCoverPath} from './brick-presentation.js';
const fail=(code,message)=>Object.assign(Error(message),{code});
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const messages={
 COVER_ENCRYPTED:'This image reference contains encrypted data, not a public thumbnail. No decryption was attempted. Inspect the NFT image URI before changing it.',
 COVER_NOT_PNG:'This reference does not resolve to a supported public PNG thumbnail. The original has not been opened.',
 COVER_UNAVAILABLE:'The public thumbnail could not be retrieved through this IPFS node. Keep its provider online and retry; do not remint.',
 COVER_TIMEOUT:'Public thumbnail retrieval timed out. Check IPFS connectivity and retry; do not remint.'
};
/** Browser decoding is checked as well as PNG structure; Node callers verify bytes only. */
export async function decodePublicCover(bytes,{signal}={}){
 if(typeof globalThis.Image!=='function')return;
 const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'})),image=new Image();
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>done(fail('COVER_TIMEOUT',messages.COVER_TIMEOUT)),10000);
   const done=error=>{clearTimeout(timer);image.onload=null;image.onerror=null;signal?.removeEventListener('abort',cancel);error?reject(error):resolve();};
   const cancel=()=>done(fail('COVER_TIMEOUT',messages.COVER_TIMEOUT));
   image.onload=()=>{
    try{
     if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth>512||image.naturalHeight>512)throw Error('Invalid display dimensions.');
     // A structurally valid PNG can be entirely transparent and appear blank.
     const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
     const context=canvas.getContext('2d');if(!context)throw Error('Canvas unavailable.');
     context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
     let visible=false;for(let i=3;i<pixels.length;i+=4)if(pixels[i]){visible=true;break;}
     if(!visible)return done(fail('COVER_NOT_PNG','The thumbnail is fully transparent. Choose an image with visible pixels before publishing.'));
     done();
    }catch{done(fail('COVER_NOT_PNG','The public thumbnail pixels could not be verified.'));}
   };
   image.onerror=()=>done(fail('COVER_NOT_PNG','The public thumbnail could not be decoded as an image.'));
   if(signal?.aborted)return cancel();
   signal?.addEventListener('abort',cancel,{once:true});image.src=url;
  });
 }finally{image.onload=null;image.onerror=null;image.src='';URL.revokeObjectURL(url);}
}
export async function readPublicNftCover(imageURI,{fetchImpl=fetch,signal,expectedSha256,timeoutMs=15000}={}){
 const path=publicCoverPath(imageURI);
 if(!path)throw fail('COVER_NOT_PNG','A bare public NFT image IPFS URI is required, not an encrypted metadata path.');
 const controller=new AbortController();let timer;
 const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(fail('COVER_TIMEOUT',messages.COVER_TIMEOUT));},timeoutMs);});
 try{return await Promise.race([timeout,(async()=>{
  let response;
  try{response=await fetchImpl(path,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});}
  catch{throw fail('COVER_UNAVAILABLE',messages.COVER_UNAVAILABLE);}
  if(!response.ok){
   // Do not display raw upstream errors, paths or credentials.
   const code=response.headers.get('x-road-cover-error');await response.body?.cancel().catch(()=>{});
   throw fail(Object.hasOwn(messages,code)?code:'COVER_UNAVAILABLE',Object.hasOwn(messages,code)?messages[code]:messages.COVER_UNAVAILABLE);
  }
  const length=response.headers.get('content-length');
  if(response.headers.get('content-type')?.split(';')[0].trim()!=='image/png'||length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_NFT_COVER_BYTES)){
   await response.body?.cancel().catch(()=>{});throw fail('COVER_NOT_PNG',messages.COVER_NOT_PNG);
  }
  const reader=response.body?.getReader();if(!reader)throw fail('COVER_NOT_PNG',messages.COVER_NOT_PNG);
  const parts=[];let total=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_NFT_COVER_BYTES)throw fail('COVER_NOT_PNG','Public thumbnail exceeds the display-copy limit.');parts.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  if(length!==null&&Number(length)!==total)throw fail('COVER_NOT_PNG','Public thumbnail response was incomplete.');
  const bytes=new Uint8Array(total);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
  if(String.fromCharCode(...bytes.subarray(0,8))==='0ZROAD01')throw fail('COVER_ENCRYPTED',messages.COVER_ENCRYPTED);
  let info;try{info=validateNftCoverPng(bytes);}catch{throw fail('COVER_NOT_PNG',messages.COVER_NOT_PNG);}
  const sha256=await digest(bytes),declared=response.headers.get('x-road-image-sha256');
  if(expectedSha256&&sha256!==expectedSha256||declared&&sha256!==declared)throw fail('COVER_MISMATCH','Public thumbnail bytes differ from the reviewed image. No artwork transaction should be sent.');
  await decodePublicCover(bytes,{signal:controller.signal});
  return {...info,bytes,sha256,imageURI,path,displayVerified:true};
 })()]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();}
}
