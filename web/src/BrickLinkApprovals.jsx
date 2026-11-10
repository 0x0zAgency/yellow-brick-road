import StatusArea from './StatusArea.jsx';
import {ACTIVE_NETWORK,activeRpcUrl,requireActiveNetwork} from './active-network.js';
import {useEffect,useRef,useState} from 'react';
import BrickApprovalModal from './BrickApprovalModal.jsx';
import {workspaceInbox,rememberReference,forgetReference,subscribeReferences,getReferenceResponse,updateReference,localReferences} from './request-inbox.js';
import {linkRequestDigest} from './brick-authorization.js';
import WalletBrickReferencePicker from './WalletBrickReferencePicker.jsx';
import {createPublicClient,createWalletClient,custom,http,defineChain,isAddress} from 'viem';
import {checkLinkedBrick,newLinkRequest,signLinkApproval,verifyLinkResponse,decodeLinkPackage,LINK_RELATIONS,normalizeLinkRequest} from './brick-authorization.js';
const T={name:'Local signer',nativeCurrency:{name:'Test Ether',symbol:'ETH',decimals:18}};
export function walletClientForLinks(provider,id){
 requireActiveNetwork(id);
 const chain=defineChain({id,name:id===11155111?'Sepolia':'Connected EVM network',nativeCurrency:T.nativeCurrency,rpcUrls:{default:{http:['http://127.0.0.1:8545']}}});
 return {reader:createPublicClient({chain,transport:ACTIVE_NETWORK?http(activeRpcUrl()):custom(provider)}),signer:createWalletClient({chain,transport:custom(provider)})};
}
export function LinkAuthorizationCreator({wallet,assets,links,onChange,onConnect,chainId,factoryAddress,rpcUrl,network,workTitle}){
 const [busy,setBusy]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[picker,setPicker]=useState(false),[approvalId,setApprovalId]=useState(null);
 const operation=useRef(0),context=JSON.stringify([wallet,chainId,factoryAddress,rpcUrl,network,assets.master?.hash]),currentContext=useRef(context);
 const latest=useRef(links);latest.current=links;
 useEffect(()=>subscribeReferences(()=>{
  const changed=latest.current.some(link=>link.request&&!link.response&&getReferenceResponse(link.request));
  if(changed)onChange(previous=>previous.map(link=>link.request&&!link.response&&getReferenceResponse(link.request)?{...link,response:getReferenceResponse(link.request)}:link));
 }),[onChange]);
 currentContext.current=context;
 useEffect(()=>{operation.current++;setBusy(null);setError('');setNotice('');setApprovalId(null);},[context]);
 useEffect(()=>()=>{operation.current++;},[]);
 const same=(a,b)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
 const update=(id,changes)=>onChange(previous=>previous.map(link=>link.id===id?{...link,...changes}:link));
 const terminal=link=>['declined','withdrawn','stale','expired'].includes(link.requestStatus)||link.request&&link.request.deadline*1000<=Date.now();
 const edit=(id,changes)=>{forgetReference(links.find(link=>link.id===id)?.request);update(id,{...changes,request:null,response:null,controller:null,sent:false,requestStatus:null});setApprovalId(null);setError('');setNotice('');};
 const freshRequest=link=>link.request&&same(link.request.requester,wallet)&&link.request.chainId===Number(chainId)&&same(link.request.sourceCommitment,'0x'+assets.master?.hash);
 useEffect(()=>{
  for(const link of links){
   if(!link.request)continue;
   if(!freshRequest(link)){forgetReference(link.request);continue;}
   if(!localReferences().some(row=>row.id===linkRequestDigest(link.request)))rememberReference({request:link.request,controller:link.controller,workTitle,brickTitle:link.title,status:link.response?'approved':'pending',response:link.response,remote:!!link.sent});
  }
 },[links,context,workTitle]);
 const run=async(link,task)=>{
  const revision=++operation.current,active=()=>operation.current===revision&&currentContext.current===context;
  const guard=()=>{if(!active())throw Error('Work or wallet changed. Prepare a fresh approval request.');};
  setBusy(link.id);setError('');setNotice('');
  try{await task(guard);}catch(e){if(active())setError(e.shortMessage||e.message);}finally{if(active())setBusy(null);}
 };
 const runRequest=link=>run(link,async guard=>{
  if(!wallet)throw Error('Connect the requesting artist wallet first.');
  if(!assets.master?.hash)throw Error('Attach and hash the primary source file first.');
  const provider=window.ethereum;
  if(!provider?.request)throw Error('A Web3 browser wallet is required.');
  const actualChain=Number(BigInt(await provider.request({method:'eth_chainId'})));
  if(actualChain!==Number(chainId))throw Error('Switch your wallet to the selected mint network.');
  if(!isAddress(link.targetBrick)||!isAddress(link.factory))throw Error('Enter the existing Brick and its originating factory addresses.');
  const {reader}=walletClientForLinks(provider,actualChain);
  const ipId=await reader.readContract({address:link.targetBrick,abi:[{name:'ipId',type:'function',stateMutability:'view',inputs:[],outputs:[{type:'bytes32'}]}],functionName:'ipId'});
  const request=newLinkRequest({chainId:actualChain,requester:wallet,sourceCommitment:'0x'+assets.master.hash,targetBrick:link.targetBrick,
   targetIpId:ipId,factory:link.factory,relation:link.relation,scope:link.scope,deadline:Math.floor(Date.now()/1000)+30*86400});
  const checked=await checkLinkedBrick(reader,request);guard();
  forgetReference(link.request);
  rememberReference({request,controller:checked.controller,workTitle,brickTitle:link.title});
  update(link.id,{request,response:null,controller:checked.controller,sent:false,requestStatus:'pending'});setApprovalId(same(checked.controller,wallet)?link.id:null);
  setNotice(same(checked.controller,wallet)?'This wallet controls the selected Brick. Review its use below, then approve with your wallet.':'Request prepared. Send it to the controller’s inbox for approval.');
 });
 const add=(candidate=null)=>{
  const link={id:crypto.randomUUID(),relation:'cover-art',targetBrick:candidate?.address||'',factory:candidate?.factory||factoryAddress||'',title:candidate?.title||'',scope:'Use as credited cover artwork in this release only.',request:null,response:null};
  if(candidate&&links.some(l=>l.relation===link.relation&&same(l.targetBrick,link.targetBrick))){setError('This artwork is already referenced.');return;}
  onChange(previous=>[...previous,link]);
  if(candidate){setPicker(false);void runRequest(link);}
 };
 const approveOwn=link=>run(link,async guard=>{
  if(!freshRequest(link)||approvalId!==link.id)throw Error('Review this use before approving.');
  const provider=window.ethereum,{reader,signer}=walletClientForLinks(provider,link.request.chainId);
  const response=await signLinkApproval({reader,signer,provider,account:wallet,request:link.request,check:guard});guard();
  update(link.id,{response,controller:response.controller});setApprovalId(null);
  updateReference(linkRequestDigest(link.request),{response,status:'approved'});
  setNotice('Approved by your wallet. This Building will reference the existing Brick; no duplicate artwork will be minted.');
 });
 const importResponse=(link,input)=>run(link,async guard=>{
  if(!freshRequest(link))throw Error('Prepare a fresh request for this work and wallet first.');
  const provider=window.ethereum;
  if(!provider?.request)throw Error('A Web3 browser wallet is required.');
  update(link.id,{response:null});
  const body=decodeLinkPackage(input),{reader}=walletClientForLinks(provider,link.request.chainId);
  await verifyLinkResponse(reader,link.request,body);guard();
  update(link.id,{response:body,controller:body.controller});
  updateReference(linkRequestDigest(link.request),{response:body,status:'approved'});
  setNotice('Controller approval verified. It will be checked again before minting.');
 });
 const copy=async value=>{
  try{await navigator.clipboard.writeText(value);setNotice('Copied to clipboard.');setError('')}catch{setError('Clipboard unavailable. Select and copy the JSON manually.')}
 };
 const approval=links.find(link=>link.id===approvalId&&freshRequest(link)&&same(link.controller,wallet));
 const sendRequest=link=>run(link,async guard=>{
  if(!freshRequest(link))throw Error('Prepare a fresh request first.');
  const inbox=workspaceInbox();await inbox.initialize();guard();
  if(!inbox.authenticated||!same(inbox.account,wallet)){await inbox.connect();guard();await inbox.login();guard();}
  const record=await inbox.api('/references',{method:'POST',body:{request:link.request,workTitle,brickTitle:link.title}});guard();
  rememberReference({...record,remote:true});update(link.id,{sent:true,requestStatus:'pending'});setNotice('Request sent. The controller will see it in their notifications.');
 });
 const withdrawRequest=link=>run(link,async guard=>{
  const inbox=workspaceInbox();await inbox.initialize();guard();
  if(!inbox.authenticated||!same(inbox.account,wallet)){await inbox.connect();guard();await inbox.login();guard();}
  await inbox.api('/references/'+linkRequestDigest(link.request)+'/decision',{method:'POST',body:{action:'withdraw'}});guard();
  forgetReference(link.request);update(link.id,{sent:false,request:null,response:null,controller:null});setNotice('Request withdrawn. You can edit or remove this reference.');
 });
 const closeApproval=()=>{operation.current++;setBusy(null);setError('');setApprovalId(null);};
 return <><details className="ms-link-panel ms-reference-tools">
  <summary>Reference existing Bricks</summary>
  <p>Already registered your album art? Choose its Brick from your wallet and approve its use in this Building. You can also request approval from another controller.</p>
  {!wallet&&<button type="button" className="ms-outline" onClick={onConnect}>Connect artist wallet to request authorization</button>}
  {wallet&&<button type="button" className="ms-outline" disabled={busy!==null} onClick={()=>setPicker(value=>!value)}>{picker?'Close my Bricks':'Choose from my Bricks'}</button>}
  {picker&&<WalletBrickReferencePicker key={context} wallet={wallet} chainId={chainId} factoryAddress={factoryAddress} rpcUrl={rpcUrl} network={network} disabled={busy!==null} onSelect={add}/>}
  {links.map(link=>{const own=same(link.controller,wallet),fresh=freshRequest(link);return <article className="ms-link" key={link.id} aria-label={link.title||'Brick reference'}>
   <div className="ms-link-header"><strong>{link.title||LINK_RELATIONS.find(x=>x.value===link.relation)?.label||'Reference'}</strong><button type="button" disabled={busy!==null||!!link.sent&&!terminal(link)} onClick={()=>{forgetReference(link.request);onChange(previous=>previous.filter(x=>x.id!==link.id));}}>Remove</button></div>
   <div className="ms-fields">
    <label>Relationship<select aria-label="Relationship" disabled={busy!==null||!!link.sent&&!terminal(link)} value={link.relation} onChange={e=>edit(link.id,{relation:e.target.value})}>{LINK_RELATIONS.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}</select></label>
    <label>Existing Brick contract address<input disabled={busy!==null||!!link.sent&&!terminal(link)} value={link.targetBrick} placeholder="0x..." onChange={e=>edit(link.id,{targetBrick:e.target.value.trim(),title:''})}/></label>
    <label>Its YellowBrickFactory contract address<input disabled={busy!==null||!!link.sent&&!terminal(link)} value={link.factory} placeholder="0x..." onChange={e=>edit(link.id,{factory:e.target.value.trim(),title:''})}/></label>
    <label>Requested use / credit / scope<textarea aria-label="Requested use / credit / scope" disabled={busy!==null||!!link.sent&&!terminal(link)} rows={2} value={link.scope} maxLength={250} onChange={e=>edit(link.id,{scope:e.target.value})}/></label>
   </div>
   <button type="button" className="ms-outline" disabled={busy!==null||!wallet||!!link.sent&&!terminal(link)} onClick={()=>void runRequest(link)}>Verify Brick &amp; prepare approval request</button>
   {terminal(link)&&<p role="status">This request is {link.request.deadline*1000<=Date.now()?'expired':link.requestStatus}. Prepare a new request before continuing.</p>}
   {link.request&&!fresh&&<p>Work or wallet changed. Prepare a fresh approval request.</p>}
   {fresh&&own&&<div className="ms-link-review">
    <strong>{link.response?'Approved by your wallet':'Awaiting your approval'}</strong>
    {!link.response&&<button type="button" className="ms-outline" disabled={busy!==null} onClick={()=>{setError('');setApprovalId(link.id);}}>Review approval</button>}
    {link.response&&<p>Existing artwork will be referenced. Its controller and approval are checked again before minting.</p>}
   </div>}
   {fresh&&!own&&!link.response&&<button type="button" className="ms-outline" disabled={busy!==null||link.sent} onClick={()=>void sendRequest(link)}>{link.sent?'Request sent to inbox':'Send to controller inbox'}</button>}
   {link.sent&&!link.response&&<button type="button" className="ms-outline" disabled={busy!==null} onClick={()=>void withdrawRequest(link)}>Withdraw request to edit</button>}
   {fresh&&<details className="ms-link-json"><summary>{own?'Approval details / export':'Advanced: exchange approval JSON'}</summary>
    <strong>Approval request</strong><textarea readOnly rows={5} aria-label="Link request JSON" value={JSON.stringify(link.request,null,2)}/><button type="button" onClick={()=>void copy(JSON.stringify(link.request,null,2))}>Copy request JSON</button><small>Controller: {link.controller}. Expiration: {new Date(link.request.deadline*1000).toLocaleString()}</small>
    <strong>Signed approval response</strong><textarea readOnly={!!link.response} disabled={busy!==null} rows={5} aria-label="Signed approval response JSON" placeholder="Paste JSON returned by the controller…" defaultValue={link.response?JSON.stringify(link.response,null,2):''} key={link.request.nonce+String(!!link.response)} onBlur={e=>{if(e.target.value.trim()&&!link.response)void importResponse(link,e.target.value.trim())}}/><small>{link.response?'Controller signature verified for this request (rechecked before mint).':'Pending current-controller signature. Paste and leave this field to verify.'}</small>
   </details>}
  </article>})}
  <button type="button" className="ms-outline" disabled={busy!==null} onClick={()=>add()}>+ Add existing Brick reference</button>
  <p className="ms-link-note">A reference approves only the stated use. For a Safe or other contract-wallet controller, use an ERC-1271-compatible signature and import the response.</p>
  <StatusArea busy={busy!==null} label="Checking Brick approval…" error={error} message={notice} name="Reference request status"/>
 </details>{approval&&<BrickApprovalModal key={approval.request.nonce} request={approval.request} controller={approval.controller} brickTitle={approval.title} workTitle={workTitle} busy={busy!==null} error={error} onClose={closeApproval} onApprove={()=>void approveOwn(approval)}/>}</>;
}
export function BrickOwnerApprovals({wallet,onConnect}){
 const [text,setText]=useState(''),[result,setResult]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false),[verified,setVerified]=useState(null),[review,setReview]=useState(null);
 const generation=useRef(0),context=JSON.stringify([wallet,text]),current=useRef(context);current.current=context;
 useEffect(()=>subscribeReferences(()=>{if(verified){const response=getReferenceResponse(verified);if(response){setResult(JSON.stringify(response,null,2));setReview(null);}}}),[verified]);
 useEffect(()=>{
  const id=++generation.current;setResult('');setError('');setVerified(null);setReview(null);setWorking(false);
  if(!wallet||!text.trim())return;
  let request;try{request=normalizeLinkRequest(decodeLinkPackage(text));}catch{return;}
  setWorking(true);
  void (async()=>{
   const provider=window.ethereum;
   if(!provider?.request)throw Error('A browser wallet is required.');
   const chainId=Number(BigInt(await provider.request({method:'eth_chainId'}))),{reader}=walletClientForLinks(provider,chainId);
   const checked=await checkLinkedBrick(reader,request);
   if(checked.controller.toLowerCase()!==wallet.toLowerCase())throw Error('This wallet is not the referenced Brick controller. Use its controlling wallet.');
   if(id===generation.current&&current.current===context){rememberReference({request,controller:wallet});setVerified(request);setReview(request);}
  })().catch(e=>{if(id===generation.current)setError(e.shortMessage||e.message);}).finally(()=>{if(id===generation.current)setWorking(false);});
  return()=>{generation.current++;};
 },[context]);
 const close=()=>{generation.current++;setReview(null);setWorking(false);setError('');};
 const approve=async()=>{
  const id=++generation.current,request=review;
  const check=()=>{if(id!==generation.current||current.current!==context)throw Error('Approval request or wallet changed.');};
  setWorking(true);setError('');setResult('');
  try{
   const provider=window.ethereum,{reader,signer}=walletClientForLinks(provider,request.chainId);
   const response=await signLinkApproval({reader,signer,provider,account:wallet,request,check});check();
   setResult(JSON.stringify(response,null,2));setReview(null);
   updateReference(linkRequestDigest(request),{response,status:'approved'});
  }catch(e){if(id===generation.current)setError(e.shortMessage||e.message||'Approval failed');}finally{if(id===generation.current)setWorking(false);}
 };
 return <section className="ms-link-panel">
  <h3>Approve a Brick reference request</h3>
  <p>Paste a request to review it in an approval window. The connected wallet must control the referenced Brick.</p>
  <textarea className="ms-link-paste" aria-label="Received Brick link request" rows={7} placeholder="Paste creator's link-request JSON…" value={text} onChange={e=>setText(e.target.value)}/>
  {!wallet&&<button className="ms-outline" type="button" onClick={onConnect}>Connect owner wallet</button>}
  {verified&&!result&&<button type="button" className="ms-outline" disabled={working} onClick={()=>{setError('');setReview(verified);}}>Review approval</button>}
  {result&&<div className="ms-link-json"><strong>Signed response · send this back to requester</strong><textarea rows={7} readOnly aria-label="Signed Brick approval" value={result}/><button onClick={()=>void navigator.clipboard.writeText(result)} type="button">Copy signed response</button></div>}
  <StatusArea busy={working} label="Checking controller and requesting approval…" error={error} name="Reference approval status"/>
  <p className="ms-link-note">Signatures stay in this session. Send the response to the requester; it is checked again before minting.</p>
  {review&&<BrickApprovalModal key={review.nonce} request={review} controller={wallet} busy={working} error={error} onClose={close} onApprove={()=>void approve()}/>}
 </section>;
}
