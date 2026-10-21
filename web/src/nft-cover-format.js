/** Narrow public rendition profile: non-animated canvas PNG, no source metadata. */
export const MAX_NFT_COVER_BYTES=512*1024;
export const MAX_NFT_COVER_SOURCE_BYTES=8*1024*1024;
export const PUBLIC_COVER_CONSENT='publish-public-nft-cover-v1';
export const validCoverCid=value=>typeof value==='string'&&/^(?:baf[a-z2-7]{43,125}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/.test(value);
const signature=[137,80,78,71,13,10,26,10];
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function validateNftCoverPng(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<45||bytes.length>MAX_NFT_COVER_BYTES)throw Error('Public NFT cover must be a PNG of at most 512 KiB.');
 if(signature.some((v,i)=>bytes[i]!==v))throw Error('Public NFT covers accept only normalized PNG bytes.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let at=8,width=0,height=0,hasData=false,endedData=false,ended=false,count=0;
 const allowed=new Set(['IHDR','IDAT','IEND','sRGB','gAMA','cHRM','pHYs']);
 while(at<bytes.length){
  if(at+12>bytes.length)throw Error('Truncated PNG chunk.');
  const length=view.getUint32(at),end=at+12+length;
  if(end>bytes.length)throw Error('Invalid PNG chunk length.');
  const type=String.fromCharCode(...bytes.subarray(at+4,at+8));
  if(!allowed.has(type))throw Error('NFT cover contains unsupported source metadata or animation. Re-export the display copy.');
  if(view.getUint32(at+8+length)!==crc(bytes.subarray(at+4,at+8+length)))throw Error('PNG checksum mismatch.');
  if(count++===0&&type!=='IHDR')throw Error('Missing PNG header.');
  if(type==='IHDR'){
   if(at!==8||length!==13)throw Error('Invalid PNG header.');
   width=view.getUint32(at+8);height=view.getUint32(at+12);
   if(!width||!height||width>512||height>512||bytes[at+16]!==8||![2,6].includes(bytes[at+17])||bytes[at+18]||bytes[at+19]||bytes[at+20])throw Error('NFT cover must be a non-interlaced RGB/RGBA PNG up to 512 by 512 pixels.');
  }else if(type==='IDAT'){
   if(endedData)throw Error('Non-contiguous PNG image data.');
   hasData=true;
  }else{
   if(hasData)endedData=true;
   if(type==='IEND'){
    if(length||!hasData||end!==bytes.length)throw Error('Invalid PNG ending.');
    ended=true;
   }else if(!({sRGB:1,gAMA:4,cHRM:32,pHYs:9}[type]===length))throw Error('Invalid PNG display chunk.');
  }
  at=end;
 }
 if(!ended)throw Error('Incomplete PNG image.');
 return {mime:'image/png',width,height,size:bytes.length};
}
