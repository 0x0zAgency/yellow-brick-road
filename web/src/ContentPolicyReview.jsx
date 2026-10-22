import './content-policy.css';

const permissions=[['preview','Play Audio Preview'],['artwork','Display cover artwork'],['lyrics','Display lyrics']];
export default function ContentPolicyReview({value,onChange,assets,simulated=false,readOnly=false,onEdit,delivery=false,onDeliveryChange}){
 if(readOnly)return <section className="cp-review" aria-label="Player permissions summary">
  <span className="eyebrow">SELECTED IN STEP 3</span><h3>YBR Player permissions</h3>
  <p>{simulated?'Simulation only: these choices will not be written to a blockchain.':'The mint records this policy on each applicable Brick. The Player database cannot grant or override these permissions.'}</p>
  <div className="ms-review">{permissions.map(([role,label])=><div key={role}><span>{label}</span><strong>{!assets[role]?.hash?'No file attached':value[role]?'Allowed':'Not allowed'}</strong></div>)}
   <div><span>Automatic Player delivery</span><strong>{delivery?'Approved for after mint':'Not requested'}</strong></div>
   <div><span>Content lock</span><strong>{value.locked?'Permanent after mint':'Versioned file revisions allowed'}</strong></div>
  </div>
  {value.locked&&<p className="cp-warning">Permanent file lock. It cannot be disabled after mint. Playback permissions can still be revoked.</p>}
  <p className="cp-note">Masters and project files stay private. Approved copies are delivered automatically after mint. There is no second Player-enablement step. On-chain permissions still govern access.</p>
  {onEdit&&<button type="button" className="ms-outline" onClick={onEdit}>Edit permissions in Step 3</button>}
 </section>;
 return <section className="cp-review" aria-label="Pre-mint Player permissions and content lock">
  <span className="eyebrow">STEP 3 / IP AND RIGHTS</span><h3>YBR Player permissions</h3>
  <p>{simulated?'Simulation only: these choices will not be written to a blockchain.':'Your wallet-signed mint will record these choices on each applicable Brick, in the same transaction as its registration.'}</p>
  {permissions.map(([role,label])=>
   <label key={role}><input type="checkbox" checked={value[role]&&!!assets[role]?.hash} disabled={!assets[role]?.hash}
    onChange={e=>onChange({...value,[role]:e.target.checked})}/><span>{label}<small>{assets[role]?.name||'Not attached: no permission will be granted'}</small></span></label>)}
  <p className="cp-note">Masters and project files remain private. These permissions do not grant downloads, redistribution, commercial licensing, or AI training. Local delivery is approved here, before mint, rather than in a later Player panel.</p>
  <label className="pr-consent"><input type="checkbox" checked={delivery} disabled={!value.preview||!assets.preview?.hash} onChange={e=>onDeliveryChange?.(e.target.checked)}/>
   <span>Deliver approved copies to YBR Player automatically after mint<small>I have permission to share the permitted Audio Preview, cover, lyrics and release/file labels with users of this local Player.</small></span></label>
  <p className="cp-note">This saves unencrypted copies of the permitted files on your local Player server after confirmation. Changing files, credits or permissions requires renewed approval here. No master, project file or recovery key is sent. Public NFT-cover publication remains a separate choice.</p>
  <label className="cp-lock"><input type="checkbox" role="switch" checked={value.locked} onChange={e=>onChange({...value,locked:e.target.checked})}/>
   <span>Content locked<small>{value.locked?'Permanent after mint: the committed file set cannot be replaced on this Brick.':'Editable through explicit, versioned file revisions. New file bytes require new Player approval.'}</small></span></label>
  {value.locked&&<p className="cp-warning">Permanent file lock. You cannot switch it off after confirmation. Replacement files need a new linked Brick. Playback permissions can still be revoked.</p>}
  <p className="cp-note">Descriptive metadata and NFT thumbnails have separate update controls. This lock protects the committed uploaded files, not every visible label or thumbnail. Registration does not verify ownership.</p>
 </section>;
}
