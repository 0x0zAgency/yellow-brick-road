import './content-policy.css';

export default function ContentPolicyReview({value,onChange,assets,simulated=false}){
 return <section className="cp-review" aria-label="Pre-mint Player permissions and content lock">
  <span className="eyebrow">REVIEW BEFORE MINT</span><h3>YBR Player permissions</h3>
  <p>{simulated?'Simulation only: these choices will not be written to a blockchain.':'Your wallet-signed mint will record these choices on each applicable Brick, in the same transaction as its registration.'}</p>
  {[['preview','Play Audio Preview'],['artwork','Display cover artwork'],['lyrics','Display lyrics']].map(([role,label])=>
   <label key={role}><input type="checkbox" checked={value[role]&&!!assets[role]?.hash} disabled={!assets[role]?.hash}
    onChange={e=>onChange({...value,[role]:e.target.checked})}/><span>{label}<small>{assets[role]?.name||'Not attached: no permission will be granted'}</small></span></label>)}
  <p className="cp-note">Masters and project files remain private. These permissions do not grant downloads, redistribution, commercial licensing, or AI training. File sharing still requires your explicit post-mint confirmation.</p>
  <label className="cp-lock"><input type="checkbox" role="switch" checked={value.locked} onChange={e=>onChange({...value,locked:e.target.checked})}/>
   <span>Content locked<small>{value.locked?'Permanent after mint: the committed file set cannot be replaced on this Brick.':'Editable through explicit, versioned file revisions. New file bytes require new Player approval.'}</small></span></label>
  {value.locked&&<p className="cp-warning">Permanent file lock. You cannot switch it off after confirmation. Replacement files need a new linked Brick. Playback permissions can still be revoked.</p>}
  <p className="cp-note">Descriptive metadata and NFT thumbnails have separate update controls. This lock protects the committed uploaded files, not every visible label or thumbnail. Registration does not verify ownership.</p>
 </section>;
}
