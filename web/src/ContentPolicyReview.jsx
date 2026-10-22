import './content-policy.css';

const permissions=[['preview','Play Audio Preview'],['artwork','Display cover artwork'],['lyrics','Display lyrics']];
export default function ContentPolicyReview({value,onChange,assets,simulated=false,readOnly=false,onEdit}){
 if(readOnly)return <section className="cp-review" aria-label="Player permissions summary">
  <span className="eyebrow">SELECTED IN STEP 2</span><h3>YBR Player permissions</h3>
  <p>{simulated?'Simulation only: these choices will not be written to a blockchain.':'The mint records this policy on each applicable Brick. The Player database cannot grant or override these permissions.'}</p>
  <div className="ms-review">{permissions.map(([role,label])=><div key={role}><span>{label}</span><strong>{!assets[role]?.hash?'No file attached':value[role]?'Allowed':'Not allowed'}</strong></div>)}
   <div><span>Content lock</span><strong>{value.locked?'Permanent after mint':'Versioned file revisions allowed'}</strong></div>
  </div>
  {value.locked&&<p className="cp-warning">Permanent file lock. It cannot be disabled after mint. Playback permissions can still be revoked.</p>}
  <p className="cp-note">Masters and project files stay private. Sharing selected preview copies with the local Player is a separate delivery step, not a new permission grant.</p>
  {onEdit&&<button type="button" className="ms-outline" onClick={onEdit}>Edit permissions in Step 2</button>}
 </section>;
 return <section className="cp-review" aria-label="Pre-mint Player permissions and content lock">
  <span className="eyebrow">STEP 2 / FILE PERMISSIONS</span><h3>YBR Player permissions</h3>
  <p>{simulated?'Simulation only: these choices will not be written to a blockchain.':'Your wallet-signed mint will record these choices on each applicable Brick, in the same transaction as its registration.'}</p>
  {permissions.map(([role,label])=>
   <label key={role}><input type="checkbox" checked={value[role]&&!!assets[role]?.hash} disabled={!assets[role]?.hash}
    onChange={e=>onChange({...value,[role]:e.target.checked})}/><span>{label}<small>{assets[role]?.name||'Not attached: no permission will be granted'}</small></span></label>)}
  <p className="cp-note">Masters and project files remain private. These permissions do not grant downloads, redistribution, commercial licensing, or AI training. File sharing still requires your explicit post-mint confirmation.</p>
  <label className="cp-lock"><input type="checkbox" role="switch" checked={value.locked} onChange={e=>onChange({...value,locked:e.target.checked})}/>
   <span>Content locked<small>{value.locked?'Permanent after mint: the committed file set cannot be replaced on this Brick.':'Editable through explicit, versioned file revisions. New file bytes require new Player approval.'}</small></span></label>
  {value.locked&&<p className="cp-warning">Permanent file lock. You cannot switch it off after confirmation. Replacement files need a new linked Brick. Playback permissions can still be revoked.</p>}
  <p className="cp-note">Descriptive metadata and NFT thumbnails have separate update controls. This lock protects the committed uploaded files, not every visible label or thumbnail. Registration does not verify ownership.</p>
 </section>;
}
