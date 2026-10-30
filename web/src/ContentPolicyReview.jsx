import './content-policy.css';

const permissions=[['preview','Play Audio Preview'],['artwork','Display cover artwork'],['lyrics','Display lyrics']];
export default function ContentPolicyReview({value,onChange,assets,simulated=false,readOnly=false,onEdit,delivery=false,onDeliveryChange,usingDefaults=false,playerEnabled=true}){
 const title=playerEnabled?'YBR Player permissions':'Content protection';
 if(readOnly)return <section className="cp-review" aria-label={playerEnabled?'Player permissions summary':'Content protection summary'}>
  <span className="eyebrow">SELECTED IN STEP 3</span><h3>{title}</h3>
  <p>{simulated?'Simulation only: these choices will not be written to a blockchain.':playerEnabled?'The mint records this policy on each applicable new Brick. The Player database cannot grant or override these permissions.':'The mint records the file-lock policy on each new Brick.'}</p>
  <div className="ms-review">{playerEnabled&&permissions.map(([role,label])=><div key={role}><span>{label}</span><strong>{!assets[role]?.hash?'No file attached':value[role]?'Allowed':'Not allowed'}</strong></div>)}
   {playerEnabled&&<div><span>Automatic Player delivery</span><strong>{delivery?'Approved for after mint':'Not requested'}</strong></div>}
   <div><span>Content lock</span><strong>{value.locked?'Permanent after mint':'Versioned file revisions allowed'}</strong></div>
  </div>
  {value.locked&&<p className="cp-warning">Permanent file lock. It cannot be disabled after mint.{playerEnabled?' Playback permissions can still be revoked.':''}</p>}
  {playerEnabled&&<p className="cp-note">Masters and project files stay private. Approved copies are delivered automatically after mint. There is no second Player-enablement step. On-chain permissions still govern access.</p>}
  {onEdit&&<button type="button" className="ms-outline" onClick={onEdit}>{playerEnabled?'Edit permissions in Step 3':'Edit content protection in Step 3'}</button>}
 </section>;
 return <section className="cp-review" aria-label={playerEnabled?'Pre-mint Player permissions and content lock':'Pre-mint content protection'}>
  <span className="eyebrow">STEP 3 / IP AND RIGHTS</span><h3>{title}</h3>
  {usingDefaults&&<p className="cp-note">Your saved creator defaults are applied. Review these selections for this work.{playerEnabled?' You can turn delivery off below before minting.':''}</p>}
  <p>{simulated?'Simulation only: these choices will not be written to a blockchain.':'Your wallet-signed mint will record these choices on each applicable new Brick, in the same transaction as its registration.'}</p>
  {playerEnabled&&<>{permissions.map(([role,label])=>
   <label key={role}><input type="checkbox" checked={value[role]&&!!assets[role]?.hash} disabled={!assets[role]?.hash}
    onChange={e=>onChange({...value,[role]:e.target.checked})}/><span>{label}<small>{assets[role]?.name||'Not attached: no permission will be granted'}</small></span></label>)}
   <p className="cp-note">Masters and project files remain private. These permissions do not grant downloads, redistribution, commercial licensing, or AI training. Local delivery is approved here, before mint, rather than in a later Player panel.</p>
   <label className="pr-consent"><input type="checkbox" checked={delivery} disabled={!value.preview||!assets.preview?.hash} onChange={e=>onDeliveryChange?.(e.target.checked)}/>
    <span>Deliver approved copies to YBR Player automatically after mint<small>I have permission to share the permitted Audio Preview, cover, lyrics and release/file labels with users of this local Player.</small></span></label>
   <p className="cp-note">This saves unencrypted copies of the permitted files on your local Player server after confirmation. {usingDefaults?'Default delivery follows your reviewed files and permissions until you change this checkbox.':'Changing files, credits or permissions requires renewed approval here.'} No master, project file or recovery key is sent. Public NFT-cover publication remains a separate choice.</p>
  </>}
  <label className="cp-lock"><input type="checkbox" role="switch" checked={value.locked} onChange={e=>onChange({...value,locked:e.target.checked})}/>
   <span>Content locked<small>{value.locked?'Permanent after mint: the committed file set cannot be replaced on this Brick.':playerEnabled?'Editable through explicit, versioned file revisions. New file bytes require new Player approval.':'Editable through explicit, versioned file revisions.'}</small></span></label>
  {value.locked&&<p className="cp-warning">Permanent file lock. You cannot switch it off after confirmation. Replacement files need a new linked Brick.{playerEnabled?' Playback permissions can still be revoked.':''}</p>}
  <p className="cp-note">Descriptive metadata and NFT thumbnails have separate update controls. This lock protects the committed uploaded files, not every visible label or thumbnail. Registration does not verify ownership.</p>
 </section>;
}
