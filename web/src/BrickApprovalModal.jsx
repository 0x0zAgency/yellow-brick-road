import {useEffect,useId,useRef} from 'react';
import StatusArea from './StatusArea.jsx';
import {LINK_RELATIONS} from './brick-authorization.js';
import './brick-approval.css';

export default function BrickApprovalModal({request,controller,workTitle,brickTitle,busy,error,onClose,onApprove}){
 const dialog=useRef(null),heading=useRef(null),titleId=useId();
 useEffect(()=>{
  const node=dialog.current,previous=document.activeElement;
  node.showModal();heading.current?.focus({preventScroll:true});
  return()=>{node.close();if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[]);
 return <dialog ref={dialog} className="brick-approval-dialog" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose();}}>
  <span className="br-kicker">BRICK REFERENCE</span>
  <h2 ref={heading} tabIndex={-1} id={titleId}>Approve this use?</h2>
  <p><strong>{workTitle||'The requesting work'}</strong> will reference <strong>{brickTitle||'your existing Brick'}</strong>.</p>
  <dl><div><dt>Relationship</dt><dd>{LINK_RELATIONS.find(item=>item.value===request.relation)?.label||request.relation}</dd></div><div><dt>Requested use</dt><dd>{request.scope}</dd></div></dl>
  <p className="brick-approval-note">Sign an approval message with your wallet. The original Brick stays in place; ownership is unchanged.</p>
  <details><summary>Approval details</summary><dl>
   <div><dt>Referenced Brick</dt><dd><code>{request.targetBrick}</code></dd></div>
   <div><dt>Requesting wallet</dt><dd><code>{request.requester}</code></dd></div>
   <div><dt>Controlling wallet</dt><dd><code>{controller}</code></dd></div>
   <div><dt>Source commitment</dt><dd><code>{request.sourceCommitment}</code></dd></div>
   <div><dt>Network / expiry</dt><dd>{request.chainId} · {new Date(request.deadline*1000).toLocaleString()}</dd></div>
  </dl></details>
  <StatusArea busy={busy} label="Confirm approval in your wallet…" error={error} name="Approval status"/>
  <div className="brick-approval-actions"><button type="button" className="ms-outline" onClick={onClose}>Not now</button><button type="button" className="ms-primary" disabled={busy} onClick={onApprove}>Approve with my wallet</button></div>
 </dialog>;
}
