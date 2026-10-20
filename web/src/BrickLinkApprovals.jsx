import {useState} from 'react';
import {createPublicClient,createWalletClient,custom,defineChain,isAddress} from 'viem';
import {checkLinkedBrick,newLinkRequest,buildLinkResponse,verifyLinkResponse,decodeLinkPackage,typedLinkData,LINK_RELATIONS,normalizeLinkRequest} from './brick-authorization.js';
const T={name:'Local signer',nativeCurrency:{name:'Test Ether',symbol:'ETH',decimals:18}};
export function walletClientForLinks(provider,id){
 const chain=defineChain({id,name:id===11155111?'Sepolia':'Connected EVM network',nativeCurrency:T.nativeCurrency,rpcUrls:{default:{http:['http://127.0.0.1:8545']}}});
 return {reader:createPublicClient({chain,transport:custom(provider)}),signer:createWalletClient({chain,transport:custom(provider)})};
}
export function LinkAuthorizationCreator({wallet,assets,links,onChange,onConnect}){
 const [busy,setBusy]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const update=(id,changes)=>onChange(links.map(link=>link.id===id?{...link,...changes}:link));
 const add=()=>onChange([...links,{id:String(Date.now())+'-'+links.length,relation:'cover-art',targetBrick:'',factory:'',scope:'Use as credited cover artwork in this release only.',request:null,response:null}]);
 const runRequest=async link=>{
  setBusy(link.id);setError('');setNotice('');
  try{
   if(!wallet)throw Error('Connect the requesting artist wallet first.');
   if(!assets.master?.hash)throw Error('Attach and hash the primary source file first.');
   const provider=window.ethereum;
   if(!provider?.request)throw Error('A Web3 browser wallet is required.');
   const chainId=Number(BigInt(await provider.request({method:'eth_chainId'})));
   if(!isAddress(link.targetBrick)||!isAddress(link.factory))throw Error('Enter the existing Brick and its originating factory addresses.');
   const signer=walletClientForLinks(provider,chainId);
   const ipId=await signer.reader.readContract({address:link.targetBrick,abi:[{name:'ipId',type:'function',stateMutability:'view',inputs:[],outputs:[{type:'bytes32'}]}],functionName:'ipId'});
   const request=newLinkRequest({chainId,requester:wallet,sourceCommitment:'0x'+assets.master.hash,targetBrick:link.targetBrick,
    targetIpId:ipId,factory:link.factory,relation:link.relation,scope:link.scope,deadline:Math.floor(Date.now()/1000)+30*86400});
   const checked=await checkLinkedBrick(signer.reader,request);
   update(link.id,{request,response:null,controller:checked.controller});
   setNotice('Request prepared. Share the request JSON with the controller of '+link.targetBrick+'. They must sign in their wallet.');
  }catch(e){setError(e.shortMessage||e.message)}finally{setBusy(null)}
 };
 const importResponse=async(link,input)=>{
  setBusy(link.id);setError('');setNotice('');
  try{
   if(!link.request)throw Error('Prepare a request first.');
   const provider=window.ethereum;
   if(!provider?.request)throw Error('A Web3 browser wallet is required.');
   const body=decodeLinkPackage(input);
   const {reader}=walletClientForLinks(provider,link.request.chainId);
   await verifyLinkResponse(reader,link.request,body);
   update(link.id,{response:body,controller:body.controller});
   setNotice('Controller signature validated against the current blockchain state. This does not grant a DSP license or create an on-chain relationship.');
  }catch(e){setError(e.shortMessage||e.message);update(link.id,{response:null})}finally{setBusy(null)}
 };
 const copy=async(value)=>{
  try{await navigator.clipboard.writeText(value);setNotice('Copied to clipboard.');setError('')}catch{setError('Clipboard unavailable. Select and copy the JSON manually.')}
 };
 return <section className="ms-link-panel">
  <h3>Reference existing Bricks · separate-wallet authorization</h3>
  <p>Link an existing cover artwork, composition, lyrics or other Brick. The referenced Brick's controller must approve the specific work relationship. Addresses alone never count as permission.</p>
  {!wallet&&<button type="button" className="ms-outline" onClick={onConnect}>Connect artist wallet to request authorization</button>}
  {links.map(link=><article className="ms-link" key={link.id}>
   <div className="ms-link-header"><strong>{LINK_RELATIONS.find(x=>x.value===link.relation)?.label||'Reference'}</strong><button type="button" onClick={()=>onChange(links.filter(x=>x.id!==link.id))}>Remove</button></div>
   <div className="ms-fields">
    <label>Relationship<select value={link.relation} onChange={e=>update(link.id,{relation:e.target.value,request:null,response:null})}>{LINK_RELATIONS.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}</select></label>
    <label>Existing Brick contract address<input value={link.targetBrick} placeholder="0x..." onChange={e=>update(link.id,{targetBrick:e.target.value.trim(),request:null,response:null})}/></label>
    <label>Its YellowBrickFactory contract address<input value={link.factory} placeholder="0x..." onChange={e=>update(link.id,{factory:e.target.value.trim(),request:null,response:null})}/></label>
    <label>Requested use / credit / scope<textarea rows={2} value={link.scope} maxLength={250} onChange={e=>update(link.id,{scope:e.target.value,request:null,response:null})}/></label>
   </div>
   <button type="button" className="ms-outline" disabled={busy!==null||!wallet} onClick={()=>void runRequest(link)}>Verify Brick &amp; prepare approval request</button>
   {link.request&&<div className="ms-link-json"><strong>Request for the other wallet</strong><textarea readOnly rows={5} aria-label="Link request JSON" value={JSON.stringify(link.request,null,2)}/><button type="button" onClick={()=>void copy(JSON.stringify(link.request,null,2))}>Copy request JSON</button><small>Controller expected: {link.controller}. Expiration: {new Date(link.request.deadline*1000).toLocaleString()}</small></div>}
   {link.request&&<div className="ms-link-json"><strong>Paste signed approval response from controller</strong><textarea rows={5} aria-label="Signed approval response JSON" placeholder="Paste JSON returned by the owner…" defaultValue={link.response?JSON.stringify(link.response,null,2):''} key={link.request.nonce} onBlur={e=>{if(e.target.value.trim())void importResponse(link,e.target.value.trim())}}/><small>{link.response?'Controller signature verified for this request (rechecked before mint).':'Pending current-controller EIP-712 signature. Paste and leave this field to verify.'}</small></div>}
  </article>)}
  <button type="button" className="ms-outline" onClick={add}>+ Add existing Brick reference</button>
  <p className="ms-link-note">For a Safe or other contract wallet controller, obtain an ERC-1271-compatible signature externally and paste its signed response. EIP-712 verifies a narrowly scoped approval, not all collaborators' rights; enforcement and licensing remain separate.</p>
  {error&&<p className="ms-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>;
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
   const checked=await checkLinkedBrick(reader,request);
   if(checked.controller.toLowerCase()!==wallet.toLowerCase())throw Error('This wallet is not the referenced Brick controller. Use its controlling wallet.');
   const accounts=await provider.request({method:'eth_accounts'});
   if(!accounts.some(a=>a.toLowerCase()===wallet.toLowerCase()))throw Error('Wallet disconnected or changed.');
   const signature=await signer.signTypedData({account:wallet,...typedLinkData(request)});
   const response=buildLinkResponse(request,signature,wallet);
   await verifyLinkResponse(reader,request,response);
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
  <button type="button" className="ms-outline" disabled={!preview||!ack||working||!wallet} onClick={()=>void approve()}>{working?'Checking…':'Validate controller and sign approval'}</button>
  {result&&<div className="ms-link-json"><strong>Signed response · send this back to requester</strong><textarea rows={7} readOnly value={result}/><button onClick={()=>void navigator.clipboard.writeText(result)} type="button">Copy signed response</button></div>}
  {error&&<p role="alert" className="ms-error">{error}</p>}
  <p className="ms-link-note">Signatures are not uploaded or stored by the Road. The requester must receive this response and revalidate it before minting. For smart-contract multisigs, use a compatible ERC-1271 signing workflow.</p>
 </section>;
}
