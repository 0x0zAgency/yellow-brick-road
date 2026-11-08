import StatusArea from './StatusArea.jsx';
import {ACTIVE_NETWORK,activeRpcUrl,requireActiveNetwork} from './active-network.js';
import {useEffect,useRef,useState} from 'react';
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
 const [busy,setBusy]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[picker,setPicker]=useState(false),[ack,setAck]=useState({});
 const operation=useRef(0),context=JSON.stringify([wallet,chainId,factoryAddress,rpcUrl,network,assets.master?.hash]),currentContext=useRef(context);
 currentContext.current=context;
 useEffect(()=>{operation.current++;setBusy(null);setError('');setNotice('');setAck({});},[context]);
 useEffect(()=>()=>{operation.current++;},[]);
 const same=(a,b)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
 const update=(id,changes)=>onChange(previous=>previous.map(link=>link.id===id?{...link,...changes}:link));
 const edit=(id,changes)=>{update(id,{...changes,request:null,response:null,controller:null});setAck({});setError('');setNotice('');};
 const freshRequest=link=>link.request&&same(link.request.requester,wallet)&&link.request.chainId===Number(chainId)&&same(link.request.sourceCommitment,'0x'+assets.master?.hash);
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
  update(link.id,{request,response:null,controller:checked.controller});setAck({});
  setNotice(same(checked.controller,wallet)?'This wallet controls the selected Brick. Review its use below, then approve with your wallet.':'Request prepared. Share the request JSON with the Brick controller for approval.');
 });
 const add=(candidate=null)=>{
  const link={id:crypto.randomUUID(),relation:'cover-art',targetBrick:candidate?.address||'',factory:candidate?.factory||factoryAddress||'',title:candidate?.title||'',scope:'Use as credited cover artwork in this release only.',request:null,response:null};
  if(candidate&&links.some(l=>l.relation===link.relation&&same(l.targetBrick,link.targetBrick))){setError('This artwork is already referenced.');return;}
  onChange(previous=>[...previous,link]);
  if(candidate){setPicker(false);void runRequest(link);}
 };
 const approveOwn=link=>run(link,async guard=>{
  if(!freshRequest(link)||ack[link.id]!==link.request.nonce)throw Error('Review and confirm this exact use before approving.');
  const provider=window.ethereum,{reader,signer}=walletClientForLinks(provider,link.request.chainId);
  const response=await signLinkApproval({reader,signer,provider,account:wallet,request:link.request,check:guard});guard();
  update(link.id,{response,controller:response.controller});
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
  setNotice('Controller approval verified. It will be checked again before minting.');
 });
 const copy=async value=>{
  try{await navigator.clipboard.writeText(value);setNotice('Copied to clipboard.');setError('')}catch{setError('Clipboard unavailable. Select and copy the JSON manually.')}
 };
 return <details className="ms-link-panel ms-reference-tools">
  <summary>Reference existing Bricks</summary>
  <p>Already registered your album art? Choose its Brick from your wallet and approve its use in this Building. You can also request approval from another controller.</p>
  {!wallet&&<button type="button" className="ms-outline" onClick={onConnect}>Connect artist wallet to request authorization</button>}
  {wallet&&<button type="button" className="ms-outline" disabled={busy!==null} onClick={()=>setPicker(value=>!value)}>{picker?'Close my Bricks':'Choose from my Bricks'}</button>}
  {picker&&<WalletBrickReferencePicker key={context} wallet={wallet} chainId={chainId} factoryAddress={factoryAddress} rpcUrl={rpcUrl} network={network} disabled={busy!==null} onSelect={add}/>}
  {links.map(link=>{const own=same(link.controller,wallet),fresh=freshRequest(link);return <article className="ms-link" key={link.id} aria-label={link.title||'Brick reference'}>
   <div className="ms-link-header"><strong>{link.title||LINK_RELATIONS.find(x=>x.value===link.relation)?.label||'Reference'}</strong><button type="button" disabled={busy!==null} onClick={()=>onChange(previous=>previous.filter(x=>x.id!==link.id))}>Remove</button></div>
   <div className="ms-fields">
    <label>Relationship<select aria-label="Relationship" disabled={busy!==null} value={link.relation} onChange={e=>edit(link.id,{relation:e.target.value})}>{LINK_RELATIONS.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}</select></label>
    <label>Existing Brick contract address<input disabled={busy!==null} value={link.targetBrick} placeholder="0x..." onChange={e=>edit(link.id,{targetBrick:e.target.value.trim(),title:''})}/></label>
    <label>Its YellowBrickFactory contract address<input disabled={busy!==null} value={link.factory} placeholder="0x..." onChange={e=>edit(link.id,{factory:e.target.value.trim(),title:''})}/></label>
    <label>Requested use / credit / scope<textarea disabled={busy!==null} rows={2} value={link.scope} maxLength={250} onChange={e=>edit(link.id,{scope:e.target.value})}/></label>
   </div>
   <button type="button" className="ms-outline" disabled={busy!==null||!wallet} onClick={()=>void runRequest(link)}>Verify Brick &amp; prepare approval request</button>
   {link.request&&!fresh&&<p>Work or wallet changed. Prepare a fresh approval request.</p>}
   {fresh&&own&&<div className="ms-link-review">
    <strong>{link.response?'Approved by your wallet':'Approve with the controlling wallet'}</strong>
    <p>Use: {link.scope}</p><p>Work: {workTitle||'This work'}</p><p>Controller: <code>{link.controller}</code></p>
    {!link.response&&<><label className="ms-check"><input type="checkbox" disabled={busy!==null} checked={ack[link.id]===link.request.nonce} onChange={e=>setAck(previous=>({...previous,[link.id]:e.target.checked?link.request.nonce:null}))}/> I approve this Brick for the stated use in this Building.</label>
    <button type="button" className="ms-outline" disabled={busy!==null||ack[link.id]!==link.request.nonce} onClick={()=>void approveOwn(link)}>Approve with my wallet</button><small>Signs an approval message. No transaction or ownership transfer.</small></>}
    {link.response&&<p>Existing artwork will be referenced. Its controller and approval are checked again before minting.</p>}
   </div>}
   {fresh&&<details className="ms-link-json" open={own?undefined:true}><summary>{own?'Approval details / export':'Exchange approval with the controller'}</summary>
    <strong>Approval request</strong><textarea readOnly rows={5} aria-label="Link request JSON" value={JSON.stringify(link.request,null,2)}/><button type="button" onClick={()=>void copy(JSON.stringify(link.request,null,2))}>Copy request JSON</button><small>Controller: {link.controller}. Expiration: {new Date(link.request.deadline*1000).toLocaleString()}</small>
    <strong>Signed approval response</strong><textarea readOnly={!!link.response} disabled={busy!==null} rows={5} aria-label="Signed approval response JSON" placeholder="Paste JSON returned by the controller…" defaultValue={link.response?JSON.stringify(link.response,null,2):''} key={link.request.nonce+String(!!link.response)} onBlur={e=>{if(e.target.value.trim()&&!link.response)void importResponse(link,e.target.value.trim())}}/><small>{link.response?'Controller signature verified for this request (rechecked before mint).':'Pending current-controller signature. Paste and leave this field to verify.'}</small>
   </details>}
  </article>})}
  <button type="button" className="ms-outline" disabled={busy!==null} onClick={()=>add()}>+ Add existing Brick reference</button>
  <p className="ms-link-note">A reference approves only the stated use. For a Safe or other contract-wallet controller, use an ERC-1271-compatible signature and import the response.</p>
  <StatusArea busy={busy!==null} label="Checking Brick approval…" error={error} message={notice} name="Reference request status"/>
 </details>;
}
export function BrickOwnerApprovals({wallet,onConnect}){
 const [text,setText]=useState(''),[result,setResult]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false),[ack,setAck]=useState(false);
 let preview=null;
 try{if(text.trim())preview=normalizeLinkRequest(decodeLinkPackage(text))}catch{/* Invalid JSON is shown when validation is requested. */}
 const approve=async()=>{
  setWorking(true);setError('');setResult('');
  try{
   if(!wallet)throw Error('Connect the controlling wallet first.');
   const provider=window.ethereum;
   if(!provider?.request)throw Error('A browser wallet is required.');
   const request=decodeLinkPackage(text),currentChain=Number(BigInt(await provider.request({method:'eth_chainId'})));
   const {reader,signer}=walletClientForLinks(provider,currentChain);
   const response=await signLinkApproval({reader,signer,provider,account:wallet,request});
   setResult(JSON.stringify(response,null,2));
  }catch(e){setError(e.shortMessage||e.message||'Approval failed')}finally{setWorking(false)}
 };
 return <section className="ms-link-panel">
  <h3>Approve a Brick reference request</h3>
  <p>Read the request and confirm that the source commitment, relationship and proposed scope are correct. Approval signs a narrowly scoped message; it does not send a transaction or transfer ownership.</p>
  <textarea className="ms-link-paste" aria-label="Received Brick link request" rows={7} placeholder="Paste creator's link-request JSON…" value={text} onChange={e=>{setText(e.target.value);setResult('');setError('');setAck(false)}}/>
  {preview&&<div className="ms-link-review">
   <strong>Review exactly what you are being asked to authorize</strong>
   <p>Requesting wallet: <code>{preview.requester}</code></p>
   <p>Referenced Brick: <code>{preview.targetBrick}</code></p>
   <p>Source work commitment: <code>{preview.sourceCommitment}</code></p>
   <p>Relationship: <strong>{preview.relation}</strong></p>
   <p>Scope: <strong>{preview.scope}</strong></p>
   <p>Network: chain {preview.chainId}; expires {new Date(preview.deadline*1000).toLocaleString()}</p>
   <label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I approve this exact relationship and scope as controller of the referenced Brick.</label>
  </div>}
  {wallet?<p>Signing wallet: {wallet}</p>:<button className="ms-outline" type="button" onClick={onConnect}>Connect owner wallet</button>}
  <button type="button" className="ms-outline" disabled={!preview||!ack||working||!wallet} onClick={()=>void approve()}>Validate controller and sign approval</button>
  {result&&<div className="ms-link-json"><strong>Signed response · send this back to requester</strong><textarea rows={7} readOnly value={result}/><button onClick={()=>void navigator.clipboard.writeText(result)} type="button">Copy signed response</button></div>}
  <StatusArea busy={working} label="Checking controller and requesting approval…" error={error} name="Reference approval status"/>
  <p className="ms-link-note">Signatures are not uploaded or stored by the Road. The requester must receive this response and revalidate it before minting. For smart-contract multisigs, use a compatible ERC-1271 signing workflow.</p>
 </section>;
}
