/** Display helpers only. No signing, decryption, publication or permission changes. */
import {validCoverCid} from './nft-cover-format.js';
const address=value=>/^0x[\da-f]{40}$/i.test(value||'');
const hash=value=>/^0x[\da-f]{64}$/i.test(value||'');
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export const shortId=value=>{const text=String(value??'');return text.length>22?text.slice(0,10)+'…'+text.slice(-6):text;};
export function publicCoverSource(uri){
 return typeof uri==='string'&&uri.startsWith('ipfs://')&&validCoverCid(uri.slice(7))?'/api/road-ipfs/nft-cover/'+uri.slice(7):null;
}
export function localThumbnailRpc(value){
 try{const url=new URL(value);return url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash?url.href:null;}catch{return null;}
}
export function mintOverview(mint,expectedCount=0){
 const receipts=Array.isArray(mint?.receipts)?mint.receipts:[];
 const simulated=mint?.simulated===true;
 const verified=simulated?0:receipts.filter(r=>r.status==='verified').length;
 const complete=!simulated&&mint?.status==='confirmed'&&receipts.length>0&&verified===receipts.length&&receipts.length>=expectedCount;
 return {simulated,verified,total:receipts.length,expected:Math.max(expectedCount,receipts.length),complete,
  tone:simulated?'neutral':complete?'success':'warning',
  label:simulated?'Simulation only':complete?'Verified on chain':'Needs attention',
  outstanding:simulated?0:Math.max(expectedCount,receipts.length)-verified};
}
// ABI is intentionally restricted to read-only identity and receipt metadata.
export const presentationAbi=[
 ['receiptToken',[], 'address'],['factory',[],'address'],['brickForToken',['uint256'],'address'],
 ['ownerOf',['uint256'],'address'],['tokenURI',['uint256'],'string']
].map(([name,inputs,output])=>({type:'function',name,stateMutability:'view',inputs:inputs.map(type=>({type})),outputs:[{type:output}]}));
export function receiptCoverImage(tokenURI,{brickAddress,ipId}){
 const prefix='data:application/json;base64,';
 if(typeof tokenURI!=='string'||tokenURI.length>32000||!tokenURI.startsWith(prefix))throw Error('Unsupported public receipt metadata.');
 let data;try{data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(tokenURI.slice(prefix.length)),c=>c.charCodeAt(0))));}catch{throw Error('Invalid public receipt metadata.');}
 const attributes=Array.isArray(data?.attributes)?data.attributes:[];
 const matches=(name,value)=>{const found=attributes.filter(a=>a?.trait_type===name);return found.length===1&&same(found[0].value,value);};
 if(!matches('Brick Contract',brickAddress)||!matches('Registration IP ID',ipId))throw Error('Public receipt metadata identifies another Brick.');
 return publicCoverSource(data.image)?data.image:null; // Never render embedded SVG, HTML or arbitrary hosts.
}
export async function readRegistrationCover({client,chainId,factoryAddress,brickAddress,ipId,collection,tokenId,originator,anchor}){
 if(!client||!Number.isSafeInteger(chainId)||chainId<=0||!address(factoryAddress)||!address(brickAddress)||!hash(ipId))throw Error('Missing registration identity.');
 if(tokenId!==undefined&&tokenId!==null&&(!/^\d{1,78}$/.test(String(tokenId))||BigInt(tokenId)!==BigInt(ipId)))throw Error('Token does not match the registration identity.');
 if(await client.getChainId()!==chainId)throw Error('Thumbnail network changed.');
 const head=await client.getBlock(anchor?{blockNumber:BigInt(anchor.number)}:{blockTag:'latest'});
 if(!hash(head?.hash)||head.number===null||head.number===undefined||anchor&&!same(head.hash,anchor.hash))throw Error('Thumbnail history changed.');
 const read=(target,functionName,args=[])=>client.readContract({address:target,abi:presentationAbi,functionName,args,blockNumber:head.number});
 const actualCollection=await read(factoryAddress,'receiptToken');
 if(!address(actualCollection)||(collection&&!same(collection,actualCollection)))throw Error('NFT collection does not match this factory.');
 const id=BigInt(ipId);
 const [factory,brick,holder,uri]=await Promise.all([read(actualCollection,'factory'),read(actualCollection,'brickForToken',[id]),read(actualCollection,'ownerOf',[id]),read(actualCollection,'tokenURI',[id])]);
 if(!same(factory,factoryAddress)||!same(brick,brickAddress)||!address(holder)||originator&&!same(holder,originator))throw Error('NFT does not match the registered Brick.');
 const image=receiptCoverImage(uri,{brickAddress,ipId});
 const finalHead=await client.getBlock({blockNumber:head.number});
 if(await client.getChainId()!==chainId||!same(finalHead.hash,head.hash))throw Error('Thumbnail history changed during verification.');
 return image;
}
