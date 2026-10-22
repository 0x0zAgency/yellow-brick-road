'use strict';
/** Metadata-only inventory of explicitly shared local previews. Never an access grant.
 * Keep inaccessible uploads visible without leaking media URLs or bypassing live policy.
 */
const REASONS=Object.freeze({
 'different-chain':'Saved on a different Ganache chain history. Switch back to the original test mnemonic/profile; do not remint.',
 'different-factory':'Saved under a different factory on this chain. Select its original factory to verify playback.',
 'legacy-permission':'This older upload has no current on-chain Player permission proof. Its saved preview is retained, but it cannot be played through the current permission system.',
 'permission-changed':'The controller, content revision, permission or file commitment changed. Review the original Brick permissions.',
 'asset-not-authorized':'This asset has no matching Player authorization.',
 'chain-unavailable':'The active Ganache chain or factory is unavailable. Start the matching profile and refresh.',
 'chain-changed':'Chain history changed during verification. Refresh after the correct profile is running.',
 'verification-unavailable':'Current permission could not be verified. Start the original chain/factory and review the Brick.',
 'unavailable':'Playback is unavailable. Saved upload metadata is retained.'
});
function describeSavedUpload(record,grant){
 const available=grant?.allowed===true;
 const reason=available?'available':Object.hasOwn(REASONS,grant?.reason)?grant.reason:'unavailable';
 const authorization=record.authorization;
 // Whitelist fields. No asset data, URLs, paths, private packets or provider errors.
 return {id:record.id,title:record.title,creator:record.creator,album:record.album||'',publishedAt:record.publishedAt,
  available,reason,message:available?'Available on the current Player.':REASONS[reason],
  chain:authorization?{chainId:authorization.chainId,factoryAddress:authorization.factoryAddress,genesisHash:authorization.genesisHash}:null};
}
function newestSavedUploads(records){
 return [...records].sort((a,b)=>{
  const at=Date.parse(a.publishedAt)||0,bt=Date.parse(b.publishedAt)||0;
  return bt-at||String(a.id).localeCompare(String(b.id));
 });
}
module.exports={describeSavedUpload,newestSavedUploads};
