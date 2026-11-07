import StatusArea from './StatusArea.jsx';
import {ACTIVE_NETWORK,activeRpcUrl} from './active-network.js';
import {useBuildingRollup,ReleaseBuildingCard,ImportBuildingPacket} from './ReleaseBuildingCard.jsx';
import WalletBrickCard from './WalletBrickCard.jsx';
import BrickEditor from './BrickEditor.jsx';
import {CollectionPager} from './BrickPresentation.jsx';
import {useEffect,useMemo,useRef,useState} from 'react';
import {BrickOwnerApprovals} from './BrickLinkApprovals.jsx';
import {createPublicClient,http,custom,defineChain,isAddress} from 'viem';
import {MINT_NETWORKS} from './road-chain.js';
import {discoverWalletBricks,factoryStorageKey} from './brick-viewer-model.js';
import './wallet-bricks.css';

const short=address=>address?address.slice(0,9)+'…'+address.slice(-7):'';
const networkFor=id=>id>0?(Object.values(MINT_NETWORKS).find(chain=>chain.id===id)||defineChain({id,name:'Connected EVM network '+id,nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[]}}})):null;
const envFactory=id=>id===1337?import.meta.env.VITE_ROAD_GANACHE_FACTORY||'':id===11155111?import.meta.env.VITE_ROAD_SEPOLIA_FACTORY||'':'';

export default function WalletBricks({wallet,onConnect}){
 const [chainId,setChainId]=useState(ACTIVE_NETWORK?.chainId||null),[factory,setFactory]=useState(ACTIVE_NETWORK?.factoryAddress||''),[startBlock,setStartBlock]=useState('');
 const [networkReady,setNetworkReady]=useState(false),[networkRevision,setNetworkRevision]=useState(0);
 const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[progress,setProgress]=useState(null),[error,setError]=useState('');
 const [recoveryAddress,setRecoveryAddress]=useState(null);
 const [page,setPage]=useState(0);
 const [editing,setEditing]=useState(null);
 const client=useMemo(()=>chainId&&window.ethereum?.request?createPublicClient({chain:networkFor(chainId),transport:ACTIVE_NETWORK?http(activeRpcUrl(),{retryCount:0,timeout:15000}):custom(window.ethereum,{retryCount:0})}):null,[chainId,wallet]);
 const requestId=useRef(0),scanController=useRef(null);
 const network=networkFor(chainId);
 useEffect(()=>{
  const provider=window.ethereum;
  if(!provider?.request){setChainId(null);setNetworkReady(true);return;}
  let alive=true,changedSinceRead=false;
  const update=id=>{if(alive){try{setChainId(ACTIVE_NETWORK?.chainId||Number(BigInt(id)))}catch{setChainId(null)}setNetworkReady(true);}};
  const changed=id=>{if(alive){changedSinceRead=true;update(id);setNetworkRevision(value=>value+1);}};
  provider.request({method:'eth_chainId'}).then(id=>{if(!changedSinceRead)update(id);}).catch(()=>{if(alive&&!changedSinceRead){setChainId(null);setNetworkReady(true);}});
  provider.on?.('chainChanged',changed);
  return()=>{alive=false;provider.removeListener?.('chainChanged',changed)};
 },[]);
 const reset=()=>{requestId.current++;scanController.current?.abort();setPage(0);setResult(null);setProgress(null);setError('');setBusy(false);setRecoveryAddress(null);setEditing(null);};
 const run=async({factoryAddress=factory,fromBlock=startBlock}={})=>{
  if(!wallet||!network){setError('Connect your wallet and select the chain where your factory was deployed.');return;}
  if(!isAddress(factoryAddress)){setError('Enter a valid deployed YellowBrickFactory contract address in Advanced search.');return;}
  const provider=window.ethereum;
  if(!provider?.request){setError('An EIP-1193 browser wallet is required.');return;}
  const id=++requestId.current;
  scanController.current?.abort();const controller=new AbortController();scanController.current=controller;
  setBusy(true);setError('');setProgress(null);setRecoveryAddress(null);setEditing(null);
  try{
   const actual=Number(BigInt(await provider.request({method:'eth_chainId'})));
   controller.signal.throwIfAborted();
   if(actual!==chainId)throw Error('Switch the browser wallet to the active Dev Control network, then retry.');
   const accounts=await provider.request({method:'eth_accounts'});
   controller.signal.throwIfAborted();
   if(!Array.isArray(accounts)||!accounts.some(a=>a.toLowerCase()===wallet.toLowerCase()))throw Error('Connected wallet account changed. Reconnect to refresh.');
   const client=createPublicClient({chain:network,transport:ACTIVE_NETWORK?http(activeRpcUrl(),{retryCount:0,timeout:15000}):custom(provider,{retryCount:0})});
   if(ACTIVE_NETWORK&&(await client.getBlock({blockNumber:0n})).hash.toLowerCase()!==ACTIVE_NETWORK.genesisHash.toLowerCase())throw Error('The active RPC history changed. Restart Dev Control before scanning.');
   const data=await discoverWalletBricks({client,factoryAddress,wallet,startBlock:fromBlock,signal:controller.signal,
    onProgress:p=>{if(id===requestId.current)setProgress({from:p.from.toString(),to:p.to.toString(),found:p.found})}});
   if(id!==requestId.current)return;
   setResult(data);
   try{localStorage.setItem(factoryStorageKey(chainId),factoryAddress)}catch{}
  }catch(e){if(id===requestId.current){setResult(null);setError(e.shortMessage||e.message||'Unable to scan wallet Bricks.');}}
  finally{if(id===requestId.current)setBusy(false)}
 };
 // A visit or wallet/network change uses current defaults once. Editing advanced
 // fields stays explicit so typing a factory address does not start RPC scans.
 useEffect(()=>{
  reset();setStartBlock('');
  let saved='';try{if(chainId)saved=localStorage.getItem(factoryStorageKey(chainId))||'';}catch{}
  const nextFactory=chainId?(ACTIVE_NETWORK?.factoryAddress||saved||envFactory(chainId)):'';
  setFactory(nextFactory);
  if(wallet&&networkReady&&chainId){
   if(isAddress(nextFactory))void run({factoryAddress:nextFactory,fromBlock:''});
   else setError('Choose a factory address in Advanced search to load your Bricks.');
  }
  return()=>{requestId.current++;scanController.current?.abort();};
 },[wallet,chainId,networkReady,networkRevision]);
 const {items}=useBuildingRollup({rows:result?.bricks||[],client,chainId,factoryAddress:result?.verifiedFactory,wallet});
 const pages=Math.max(1,Math.ceil(items.length/12)),currentPage=Math.min(page,pages-1);
 const renderPart=brick=><WalletBrickCard key={chainId+':'+result.verifiedFactory+':'+brick.address} brick={brick} chainId={chainId} wallet={wallet} client={client} factoryAddress={result.verifiedFactory} recovering={recoveryAddress===brick.address} onRecover={()=>setRecoveryAddress(brick.address)} onCloseRecovery={()=>setRecoveryAddress(null)} onEdit={()=>{setRecoveryAddress(null);setEditing(brick);}}/>;
 const saved=current=>{
  const update=row=>row.address.toLowerCase()===current.brickAddress.toLowerCase()?{...row,...current,creatorIsController:current.controller.toLowerCase()===wallet.toLowerCase()}:row;
  setResult(old=>old?{...old,bricks:old.bricks.map(update)}:old);setEditing(old=>old?update(old):old);
 };
 if(editing&&result)return <BrickEditor key={wallet+':'+chainId+':'+result.verifiedFactory+':'+editing.address} brick={editing} wallet={wallet} chainId={chainId} factoryAddress={result.verifiedFactory} client={client} onSaved={saved} onClose={()=>setEditing(null)}/>;
 return <section className="wb br-collection">
  <div className="wb-intro"><span className="br-kicker">YOUR WALLET / YOUR WORK</span><h2>My Bricks</h2><p>Your registered works load automatically. Open Edit Brick to update a work.</p></div>
  {!wallet?<div className="wb-empty"><h3>Connect your wallet</h3><p>Connect the creator wallet to discover its registrations. No transaction or signature is required to view them.</p><button className="gold-btn" onClick={onConnect}>Connect wallet</button></div>:<>
   <div className="wb-controls">
    <div className="wb-identity"><span>Connected creator</span><strong title={wallet}>{short(wallet)}</strong><button type="button" className="outline-btn" disabled={busy||!networkReady||!network||!isAddress(factory)} onClick={()=>void run()}>Refresh Bricks</button></div>

     <details className="br-surface wb-advanced"><summary><span>Advanced search</span></summary><div className="br-surface-body"><p className="wb-note">Network: {network?network.name+' ('+network.id+')':'Unavailable'}</p><label>YellowBrickFactory address<input aria-label="YellowBrickFactory address" readOnly={!!ACTIVE_NETWORK} spellCheck="false" placeholder="0x..." value={factory} onChange={e=>{reset();setFactory(e.target.value.trim())}}/></label>
     <label>Scan from block (optional)<input aria-label="Start block" inputMode="numeric" placeholder={chainId===1337?'0 (Ganache genesis)':'Recent 100,000 blocks'} value={startBlock} onChange={e=>{reset();setStartBlock(e.target.value.trim())}}/></label>
     <p className="wb-note">The factory address identifies which registrations to search. On larger chains, an empty start block scans only the latest 100,000 blocks. Enter its deployment block for older mints (up to 100,000 blocks per scan). No wallet approval is requested.</p><button type="button" className="gold-btn" disabled={busy||!networkReady||!network||!isAddress(factory)} onClick={()=>void run()}>Search Bricks</button></div></details>
   </div>
   <StatusArea size="normal" busy={!networkReady||busy} label={!networkReady?'Detecting wallet network…':'Reading factory events'+(progress?' · blocks '+progress.from+'–'+progress.to+' · '+progress.found+' match(es) found':' and checking the deployed contract…')} error={error||(!network&&networkReady?'Select the network where the factory was deployed in your browser wallet to view registrations.':'')} message={result?'Bricks up to date':''} name="My Bricks status"/>
   {result&&<div className="wb-results">
    <div className="wb-results-header"><h3>{result.bricks.length} verified Brick{result.bricks.length===1?'':'s'} created</h3><span>Scanned blocks {result.fromBlock}–{result.toBlock}</span></div>
    {result.limited&&<p className="wb-warning">This scan covers only recent blocks, not the complete chain history. Enter a deployment/start block to search historical registrations, or use an indexer for full history.</p>}
    {result.limitReached&&<p className="wb-warning">Only the newest 200 matching Bricks are displayed. Use a narrower block range or a dedicated indexer for more.</p>}
    {result.bricks.length===0&&<div className="wb-empty"><h3>No registrations in this range</h3><p>No Bricks minted from this wallet were found through the selected factory in the blocks searched. Simulated mints, other factories, and other networks are not included.</p></div>}
    <ImportBuildingPacket rows={result.bricks} client={client} chainId={chainId} factoryAddress={result.verifiedFactory}/>
    <p className="br-heading-count">{items.length} Buildings or standalone Bricks · parts stay together</p>
    <div className="br-grid">{items.slice(currentPage*12,currentPage*12+12).map(item=>item.kind==='building'?<ReleaseBuildingCard key={item.id} group={item} client={client} chainId={chainId} factoryAddress={result.verifiedFactory} renderPart={renderPart}/>:renderPart(item.row))}</div>
    <CollectionPager page={currentPage} pages={pages} total={items.length} onPage={setPage}/>
   </div>}
  </>}
  <BrickOwnerApprovals wallet={wallet} onConnect={onConnect}/>
  <p className="wb-disclaimer">This viewer shows contracts created by the connected wallet through one selected factory, not all Bricks the wallet might currently control. Blockchain registration is not proof of copyright or original authorship. File recovery is optional and requires your private recovery key; decryption stays in your browser.</p>
 </section>;
}
