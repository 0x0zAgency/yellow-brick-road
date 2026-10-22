/** Local delivery orchestration. The Brick policy remains the permission authority.
 * Approval is volatile, bound to reviewed public labels, exact files and policies.
 * Delivery failure never rolls back, re-mints, or reclassifies a confirmed mint.
 */
import {publishPlayerRelease,validatePlayerReleaseSelection} from './player-release.js';
const scope=packet=>JSON.stringify((packet?.bricks||[]).map(brick=>({
 id:brick.localId,role:brick.role,title:brick.metadata?.title,description:brick.metadata?.description,
 creators:brick.metadata?.creators,music:brick.metadata?.music,player:brick.metadata?.rights?.player,
 files:(brick.metadata?.media||[]).map(file=>[file.role,file.name,file.byteLength,file.integrity?.digest])
})));
export function reviewPlayerDelivery({packet,consent=false,execution='simulated',chainId=1337}={}){
 if(consent!==true)return null;
 if(execution!=='simulated'&&(execution!=='ganache'||Number(chainId)!==1337))
  throw Error('Automatic local Player delivery supports Ganache 1337 or the explicit simulation only. Return to Step 3 to turn delivery off for this network.');
 validatePlayerReleaseSelection(packet);
 return Object.freeze({format:'ybr-local-delivery-review/1',scope:scope(packet),execution,chainId:Number(chainId)});
}
export async function deliverPlayerAfterMint({packet,mint,vault,approval}={},options={}){
 if(!approval)return {status:'not-requested'};
 const controller=new AbortController(),abort=()=>controller.abort();
 if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,options.timeoutMs??30000);
 try{
  if(controller.signal.aborted)throw new DOMException('Delivery canceled','AbortError');
  if(approval.format!=='ybr-local-delivery-review/1'||approval.scope!==scope(packet))
   throw Error('Player files, credits or permissions changed after approval. Nothing was delivered.');
  if(mint?.simulated===true){
   if(approval.execution!=='simulated')throw Error('A real mint approval cannot be used for a simulated delivery.');
  }else if(mint?.status!=='confirmed'||approval.execution!=='ganache'||mint.chainId!==approval.chainId)
   throw Error('Player delivery requires the confirmed mint matching this review. Inspect transactions; do not remint.');
  const publish=options.publish||publishPlayerRelease;
  const result=await publish({packet,mint,vault,consent:true,includeArtwork:true,includeLyrics:true},{signal:controller.signal});
  if(!/^STUDIO-[a-f0-9]{64}$/.test(result?.brick?.id||''))throw Error('Player response could not be confirmed. Retry delivery, not the mint.');
  return {status:'delivered',brick:result.brick,simulated:mint.simulated===true};
 }catch(error){
  return {status:'needs-attention',error:error.name==='AbortError'?'Delivery timed out or was interrupted. Check the Player, then retry delivery if needed.':error.message||'Player delivery could not be confirmed.'};
 }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
