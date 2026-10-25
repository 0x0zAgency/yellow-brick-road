import {prepareNftCover} from './nft-cover-source.js';
import {validateGraphic} from './appearance.js';
/** Reuse the bounded rasterizer, without pinning, uploading or reading any creator vault. */
export async function prepareWorkspaceGraphic(file,{signal}={}){
 if(!file||file.size>8*1024*1024)throw Error('Choose a PNG, JPEG or WebP no larger than 8 MiB.');
 let bytes=await prepareNftCover(new Uint8Array(await file.arrayBuffer()),{signal});
 if(bytes.length>128*1024){
  const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
  try{for(let size=256;bytes.length>128*1024&&size>=32;size/=2){
   const canvas=document.createElement('canvas'),scale=Math.min(size/image.width,size/image.height);
   canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
   const context=canvas.getContext('2d');if(!context)throw Error('Canvas is unavailable.');context.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not prepare this graphic.');bytes=new Uint8Array(await blob.arrayBuffer());
  }}finally{image.close();}
 }
 if(signal?.aborted)throw new DOMException('Graphic preparation cancelled.','AbortError');
 if(bytes.length>128*1024)throw Error('Use a smaller graphic.');
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return validateGraphic('data:image/png;base64,'+btoa(binary));
}
export async function normalizeImportedGraphics(theme,{signal}={}){
 const graphics={...theme.graphics};
 for(const [key,value] of Object.entries(graphics))if(value){
  const bytes=Uint8Array.from(atob(value.slice(22)),c=>c.charCodeAt(0));
  graphics[key]=await prepareWorkspaceGraphic(new Blob([bytes],{type:'image/png'}),{signal});
 }
 return {...theme,graphics};
}
