import {openDemoDownload} from './demo-vault.js';
import {MAX_NFT_COVER_SOURCE_BYTES} from './nft-cover-format.js';
import {coverSourceMime} from './raster-display.js';
export {coverSourceMime,prepareNftCover} from './raster-display.js';
export const isRasterCoverFile=file=>!!file&&(/^(image\/(png|jpeg|webp))$/i.test(file.mediaType||file.type||'')||/\.(png|jpe?g|webp)$/i.test(file.name||''));
export const attachedCover=packet=>{
 const media=(packet?.bricks||[]).flatMap(b=>b.metadata?.media||[]);
 // Prefer the explicit release cover; visual works may use their primary raster.
 return media.find(file=>file.role==='artwork')||media.find(file=>file.role==='master'&&isRasterCoverFile(file))||null;
};
const abort=signal=>{if(signal?.aborted)throw new DOMException('Cover preparation canceled.','AbortError');};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
/** Decrypt the selected raster locally; publish only the approved display derivative. */
export async function readAttachedCover({packet,vault,signal}={}){
 const file=attachedCover(packet);
 if(!file||!vault?.secret||!vault.encrypted?.get)throw Error('Attach a cover file here, or use the artwork from the active Mint Studio session.');
 if(!Number.isSafeInteger(file.byteLength)||file.byteLength<1||file.byteLength>MAX_NFT_COVER_SOURCE_BYTES||!/^0x[0-9a-f]{64}$/i.test(file.integrity?.digest||''))throw Error('Attached artwork is too large or has no valid checksum.');
 abort(signal);
 const output=await openDemoDownload({entry:vault.encrypted.get(file.role),secret:vault.secret,authorized:true});
 abort(signal);
 if(output.bytes.length!==file.byteLength||await hash(output.bytes)!==file.integrity.digest.slice(2).toLowerCase())throw Error('Artwork no longer matches the reviewed mint packet.');
 coverSourceMime(output.bytes);
 return output.bytes;
}
