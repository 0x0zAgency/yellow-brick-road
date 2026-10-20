import {useEffect,useRef,useState} from 'react';
import CopyField from './CopyField.jsx';
import {createPublicClient,custom,defineChain,isAddress} from 'viem';
import {MINT_NETWORKS} from './road-chain.js';
import {discoverWalletBricks,factoryStorageKey} from './brick-viewer-model.js';
import './wallet-bricks.css';

const short=address=>address?address.slice(0,9)+'…'+address.slice(-7):'';
const networkFor=id=>id>0?(Object.values(MINT_NETWORKS).find(chain=>chain.id===id)||defineChain({id,name:'Connected EVM network '+id,nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[]}}})):null;
const envFactory=id=>id===1337?import.meta.env.VITE_ROAD_GANACHE_FACTORY||'':id===11155111?import.meta.env.VITE_ROAD_SEPOLIA_FACTORY||'':'';

export default function WalletBricks({wallet,onConnect}){
 const [chainId,setChainId]=useState(null),[factory,setFactory]=useState(''),[startBlock,setStartBlock]=useState('');
 const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[progress,setProgress]=useState(null),[error,setError]=useState('');
 const requestId=useRef(0);
 const network=networkFor(chainId);
 useEffect(()=>{
  const provider=window.ethereum;
  if(!provider?.request){setChainId(null);return;}
  let alive=true;
  const update=id=>{if(alive){try{setChainId(Number(BigInt(id)))}catch{setChainId(null)}}};
  provider.request({method:'eth_chainId'}).then(update).catch(()=>{if(alive)setChainId(null)});
  provider.on?.('chainChanged',update);
  return()=>{alive=false;provider.removeListener?.('chainChanged',update)};
 },[]);
 useEffect(()=>{
  requestId.current++;
  setResult(null);setError('');setProgress(null);setBusy(false);
  if(!chainId){setFactory('');return;}
  let saved='';
  try{saved=localStorage.getItem(factoryStorageKey(chainId))||''}catch{}
  setFactory(saved||envFactory(chainId));
 },[wallet,chainId]);
 const reset=()=>{requestId.current++;setResult(null);setProgress(null);setError('');setBusy(false)};
 const run=async()=>{
  if(!wallet||!network){setError('Connect your wallet and select the chain where your factory was deployed.');return;}
  if(!isAddress(factory)){setError('Enter a valid deployed YellowBrickFactory contract address.');return;}
  const provider=window.ethereum;
  if(!provider?.request){setError('An EIP-1193 browser wallet is required.');return;}
  const id=++requestId.current;
  setBusy(true);setResult(null);setError('');setProgress(null);
  try{
   const actual=Number(BigInt(await provider.request({method:'eth_chainId'})));
   if(actual!==chainId)throw Error('Wallet network changed. Refresh the viewer.');
   const accounts=await provider.request({method:'eth_accounts'});
   if(!Array.isArray(accounts)||!accounts.some(a=>a.toLowerCase()===wallet.toLowerCase()))throw Error('Connected wallet account changed. Reconnect to refresh.');
   const client=createPublicClient({chain:network,transport:custom(provider)});
   const data=await discoverWalletBricks({client,factoryAddress:factory,wallet,startBlock,
    onProgress:p=>{if(id===requestId.current)setProgress({from:p.from.toString(),to:p.to.toString(),found:p.found})}});
   if(id!==requestId.current)return;
   setResult(data);
   try{localStorage.setItem(factoryStorageKey(chainId),factory)}catch{}
  }catch(e){if(id===requestId.current)setError(e.shortMessage||e.message||'Unable to scan wallet Bricks.')}
  finally{if(id===requestId.current)setBusy(false)}
 };
 return <section className="wb">
  <div className="wb-intro"><h2>Wallet Brick Viewer</h2><p>Read-only discovery of Bricks minted by the connected wallet. The Road checks on-chain factory events and Brick contracts, not local demo records.</p></div>
  {!wallet?<div className="wb-empty"><h3>Connect your wallet</h3><p>Connect the creator wallet to discover its registrations. No transaction or signature is required to view them.</p><button className="gold-btn" onClick={onConnect}>Connect wallet</button></div>:<>
   <div className="wb-controls">
    <div className="wb-identity"><span>Connected creator</span><strong title={wallet}>{short(wallet)}</strong><span>Network: {network?network.name+' ('+network.id+')':chainId?'Unsupported chain '+chainId:'Detecting…'}</span></div>
    {!network?<p role="alert" className="wb-error">Select the network where the factory was deployed in your browser wallet to view registrations.</p>:<>
     <label>YellowBrickFactory address<input aria-label="YellowBrickFactory address" spellCheck="false" placeholder="0x..." value={factory} onChange={e=>{reset();setFactory(e.target.value.trim())}}/></label>
     <label>Scan from block (optional)<input aria-label="Start block" inputMode="numeric" placeholder={chainId===1337?'0 (Ganache genesis)':'Recent 100,000 blocks'} value={startBlock} onChange={e=>{reset();setStartBlock(e.target.value.trim())}}/></label>
     <p className="wb-note">The factory address identifies which registrations to search. On larger chains, an empty start block scans only the latest 100,000 blocks. Enter its deployment block for older mints (up to 100,000 blocks per scan). No wallet approval is requested.</p>
     <button className="gold-btn" disabled={busy||!isAddress(factory)} onClick={()=>void run()}>{busy?'Scanning…':'Find my on-chain Bricks'}</button>
    </>}
   </div>
   {busy&&<div role="status" className="wb-message">Reading factory events{progress?' · blocks '+progress.from+'–'+progress.to+' · '+progress.found+' match(es) found':' and checking the deployed contract…'}</div>}
   {error&&<p role="alert" className="wb-error">{error}</p>}
   {result&&<div className="wb-results">
    <div className="wb-results-header"><h3>{result.bricks.length} verified Brick{result.bricks.length===1?'':'s'} created</h3><span>Scanned blocks {result.fromBlock}–{result.toBlock}</span></div>
    {result.limited&&<p className="wb-warning">This scan covers only recent blocks, not the complete chain history. Enter a deployment/start block to search historical registrations, or use an indexer for full history.</p>}
    {result.limitReached&&<p className="wb-warning">Only the newest 200 matching Bricks are displayed. Use a narrower block range or a dedicated indexer for more.</p>}
    {result.bricks.length===0&&<div className="wb-empty"><h3>No registrations in this range</h3><p>No Bricks minted from this wallet were found through the selected factory in the blocks searched. Simulated mints, other factories, and other networks are not included.</p></div>}
    <div className="wb-list">{result.bricks.map((brick,i)=><article className="wb-brick" key={brick.address}>
     <div className="wb-brick-top"><div><span className="wb-eyebrow">ON-CHAIN BRICK · {i+1}</span><h3>{short(brick.address)}</h3></div><span className={brick.creatorIsController?'wb-status':'wb-status transferred'}>{brick.creatorIsController?'Creator controls':'Controller changed'}</span></div>
     <dl>
      {brick.nftContractAddress&&brick.tokenId?<><div><dt>NFT contract address (wallet import)</dt><dd><CopyField label="NFT contract address" value={brick.nftContractAddress}/></dd></div><div><dt>Token ID (decimal, wallet import)</dt><dd><CopyField label="NFT token ID" value={brick.tokenId}/></dd></div></>:<div><dt>Legacy factory</dt><dd>No ERC-721 token ID. This registration cannot be imported as an NFT.</dd></div>}
      <div><dt>Brick contract</dt><dd><CopyField label="Brick contract address" value={brick.address}/></dd></div>
      <div><dt>IP identity</dt><dd><CopyField label="IP identity" value={brick.ipId}/></dd></div>
      <div><dt>Content commitment (bytes32)</dt><dd>{brick.contentHash}</dd></div>
      <div><dt>Metadata commitment</dt><dd><CopyField label="metadata commitment" value={brick.metadataDigest}/></dd></div>
      <div><dt>Metadata version</dt><dd>{brick.metadataVersion}</dd></div>
      <div><dt>Metadata reference</dt><dd>{brick.metadataURI}</dd></div>
      <div><dt>Current controller</dt><dd><CopyField label="current controller" value={brick.controller}/></dd></div>
      <div><dt>Block</dt><dd><CopyField label="block number" value={brick.blockNumber}/></dd></div>
     </dl>
     <div className="wb-brick-links">{chainId===11155111?<><a href={'https://sepolia.etherscan.io/address/'+brick.address} rel="noreferrer" target="_blank">View contract on Sepolia ↗</a><a href={'https://sepolia.etherscan.io/tx/'+brick.transactionHash} rel="noreferrer" target="_blank">View mint transaction ↗</a></>:<span>Ganache transaction: {short(brick.transactionHash)}</span>}</div>
    </article>)}</div>
   </div>}
  </>}
  <p className="wb-disclaimer">This viewer shows contracts created by the connected wallet through one selected factory, not all Bricks the wallet might currently control. Blockchain registration is not proof of copyright or original authorship. Private files and full metadata are never downloaded by this viewer.</p>
 </section>;
}
