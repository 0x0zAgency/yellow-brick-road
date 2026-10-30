import {useEffect,useState} from 'react';
import {findReusableBricks,matchesReusableFiles,reuseMedia} from './reuse-bricks.js';
const labels={master:'recording / primary work',artwork:'cover artwork',composition:'songwriting evidence'};
export default function ExistingFileBricks({assets,composition,wallet,chainId,factoryAddress,rpcUrl,network,value,onChange}){
 const [state,setState]=useState({candidates:[]}),[retry,setRetry]=useState(0);
 const scope=JSON.stringify([wallet,chainId,factoryAddress,rpcUrl,network]);
 useEffect(()=>{
  const controller=new AbortController();setState({candidates:[],loading:true});
  if(!wallet||!/^0x[\da-f]{40}$/i.test(factoryAddress)){setState({candidates:[]});return;}
  void findReusableBricks({wallet,chainId,factoryAddress,rpcUrl,network,provider:window.ethereum,signal:controller.signal})
   .then(result=>{if(!controller.signal.aborted)setState({...result,scope});})
   .catch(error=>{if(!controller.signal.aborted)setState({candidates:[],scope,error:error.shortMessage||error.message});});
  return()=>controller.abort();
 },[scope,retry]);
 if(!wallet)return null;
 const candidates=state.scope===scope?state.candidates:[];
 const matches=['master','artwork',...(composition?['composition']:[])].map(part=>({part,rows:candidates.filter(c=>matchesReusableFiles(c,part,reuseMedia(assets,part,{composition})))})).filter(group=>group.rows.length||value[group.part]);
 return <section className="ms-link-panel" aria-label="Matching uploaded files">
  <h3>Reuse a previous Brick</h3>
  {state.loading?<p role="status">Checking this wallet’s previous Bricks…</p>:matches.length?matches.map(({part,rows})=><div className="ms-reuse-match" key={part}>
   <strong>Exact file match · {labels[part]}</strong>
   <p>Reuse the previous Brick in this Building to skip another IPFS upload and NFT mint for these files. Its existing credits, permissions and payouts stay in place.</p>
   {rows.map(candidate=><div key={candidate.address}><code>{candidate.address}</code><button type="button" className="ms-outline" disabled={value[part]?.address===candidate.address} onClick={()=>onChange({...value,[part]:candidate})}>{value[part]?.address===candidate.address?'Previous Brick selected':'Use previous '+labels[part]+' Brick'}</button></div>)}
   {value[part]&&<button type="button" className="ms-outline" onClick={()=>{const next={...value};delete next[part];onChange(next);}}>Create a new {labels[part]} Brick instead</button>}
  </div>):<p>No exact file set matched a previous Brick. Album names and filenames alone never select an existing Brick.</p>}
  {state.error&&<p role="status">Previous Bricks could not be checked: {state.error}</p>}
  {state.limited&&<p>Only recent registrations were checked. Older Bricks can be linked using the reference tool.</p>}
  <button type="button" className="ms-outline" disabled={state.loading} onClick={()=>setRetry(n=>n+1)}>Check previous Bricks again</button>
 </section>;
}
