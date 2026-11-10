import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,Plus,Pause} from 'lucide-react';
import MintStudio from './MintStudioDemo.jsx';
import BricksInProgress from './BricksInProgress.jsx';
import {saveMintDraft,loadMintDraft,hasDraftWork,applyReferenceUpdates,mergeDraftReferences} from './mint-drafts.js';
import {localReferences,subscribeReferences} from './request-inbox.js';
import {walletClientForLinks} from './BrickLinkApprovals.jsx';
import {ACTIVE_NETWORK} from './active-network.js';
import './mint-drafts.css';
const same=(a,b)=>!!a&&!!b&&String(a).toLowerCase()===String(b).toLowerCase();
export default function MintWorkspace({wallet,command,onConnect,...props}){
 const [draft,setDraft]=useState(null),[fresh,setFresh]=useState(true),[instance,setInstance]=useState(0),[view,setView]=useState('editor'),[saving,setSaving]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false),[hasWork,setHasWork]=useState(false);
 const current=useRef(null),draftId=useRef(null),timer=useRef(null),queue=useRef(Promise.resolve()),saved=useRef(null),alive=useRef(true),operation=useRef(0),lastCommand=useRef(null);
 const persist=useCallback(snapshot=>{
  if(!wallet||!snapshot||!hasDraftWork(snapshot.state))return Promise.resolve();
  if(!same(snapshot.state.wallet,wallet))return Promise.reject(Error('Wallet changed. Reopen the saved Brick.'));
  const id=draftId.current||=wallet.toLowerCase()+':'+crypto.randomUUID();
  if(alive.current)setSaving('Saving on this device…');
  const job=queue.current.catch(()=>{}).then(()=>saveMintDraft({id,wallet,...snapshot}));queue.current=job;
  return job.then(record=>{if(alive.current&&current.current===snapshot){saved.current=snapshot;setSaving('Saved on this device');setError('');}return record;}).catch(e=>{if(alive.current){setSaving('Not saved');setError(e.message);}throw e;});
 },[wallet]);
 const changed=useCallback(snapshot=>{
  const previous=current.current;
  if(previous&&previous.busy===snapshot.busy&&previous.files.nftCover===snapshot.files.nftCover&&JSON.stringify(previous.state)===JSON.stringify(snapshot.state))return;
  current.current=snapshot;setHasWork(hasDraftWork(snapshot.state));clearTimeout(timer.current);
  if(!wallet||snapshot.busy)return;
  if(hasDraftWork(snapshot.state)){setSaving('Saving on this device…');timer.current=setTimeout(()=>{void persist(snapshot).catch(()=>{});},450);}
 },[wallet,persist]);
 const flush=useCallback(async()=>{clearTimeout(timer.current);if(current.current?.busy)throw Error('Wait for the current operation to finish before leaving this Brick.');if(current.current!==saved.current)await persist(current.current);await queue.current;},[persist]);
 useEffect(()=>{
  alive.current=true;
  const unload=e=>{if(current.current?.busy||wallet&&hasDraftWork(current.current?.state||{})&&current.current!==saved.current){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',unload);
  return()=>{alive.current=false;operation.current++;clearTimeout(timer.current);window.removeEventListener('beforeunload',unload);if(current.current&&!current.current.busy&&current.current!==saved.current)void persist(current.current).catch(()=>{});};
 },[wallet,persist]);
 useEffect(()=>subscribeReferences(()=>{
  const snapshot=current.current;if(!wallet||!snapshot?.state.genesisHash)return;
  void mergeDraftReferences({wallet,chainId:Number(snapshot.state.chainId),genesisHash:snapshot.state.genesisHash,records:localReferences()}).catch(e=>{if(alive.current)setError(e.message);});
 }),[wallet]);
 async function navigate(task){
  const id=++operation.current;setWorking(true);setError('');
  try{await flush();if(id!==operation.current)return;await task(()=>id===operation.current&&alive.current);}
  catch(e){if(id===operation.current)setError(e.shortMessage||e.message);}
  finally{if(id===operation.current)setWorking(false);}
 }
 const showList=()=>navigate(async()=>setView('list'));
 const start=()=>navigate(async()=>{draftId.current=null;current.current=null;saved.current=null;setDraft(null);setFresh(true);setInstance(n=>n+1);setSaving('');setHasWork(false);setView('editor');});
 const resume=id=>navigate(async active=>{
  const record=await loadMintDraft(wallet,id);if(!active())return;
  const state=record.state;
  if(!same(state.wallet,wallet))throw Error('Connect the wallet that saved this Brick.');
  if(ACTIVE_NETWORK&&(Number(state.chainId)!==ACTIVE_NETWORK.chainId||!same(state.factoryAddress,ACTIVE_NETWORK.factoryAddress)))throw Error('This draft belongs to another deployment. Select its original network and factory in Dev Control.');
  const {reader}=walletClientForLinks(window.ethereum,Number(state.chainId));
  if(Number(await window.ethereum.request({method:'eth_chainId'}))!==Number(state.chainId))throw Error('Switch your wallet to network '+state.chainId+' to resume this Brick.');
  const genesis=await reader.getBlock({blockNumber:0n});
  if(state.genesisHash&&!same(state.genesisHash,genesis.hash))throw Error('The chain history changed. This draft is saved, but its approvals belong to the previous chain.');
  if(!active())return;
  let restored=applyReferenceUpdates(state,localReferences());
  // A draft without a recorded history can retain its files, but cannot reuse old permissions.
  if(!state.genesisHash)restored={...restored,reusedBricks:{},linkedBricks:(restored.linkedBricks||[]).map(link=>({...link,request:null,response:null,requestStatus:null,sent:false}))};
  draftId.current=id;current.current=null;saved.current=null;setDraft({...record,state:{...restored,genesisHash:genesis.hash}});setFresh(false);setInstance(n=>n+1);setSaving('Saved on this device');setView('editor');
 });
 useEffect(()=>{if(!command||lastCommand.current===command.key)return;lastCommand.current=command.key;if(command.id)void resume(command.id);else if(command.newMint)void start();},[command]);
 const beforeMint=async packet=>{if(!wallet)return;clearTimeout(timer.current);const snapshot={...current.current,state:{...current.current.state,packet,submissionPending:true}};await persist(snapshot);};
 return <div className="mint-workspace">
  <div className="mint-workbench-toolbar"><button type="button" className="mint-workbench-link" disabled={working} onClick={()=>void showList()}><ArrowLeft size={17}/> Bricks in progress</button><div className="mint-workbench-save" role="status">{saving}</div>{view==='editor'&&<button type="button" className="mint-pause-button" disabled={working||!wallet||!hasWork} onClick={()=>void showList()}><Pause size={17}/> Save &amp; pause</button>}{view==='editor'&&<button type="button" className="mint-start-button compact" disabled={working} onClick={()=>void start()}><Plus size={19}/> Start a new mint</button>}</div>
  {error&&<p className="ms-error" role="alert">{error}</p>}
  {view==='list'?<BricksInProgress wallet={wallet} onConnect={onConnect} onNew={()=>void start()} onResume={id=>void resume(id)}/>:<MintStudio key={instance} {...props} wallet={wallet} onConnect={onConnect} draft={draft} fresh={fresh} onDraftChange={changed} onBeforeMint={beforeMint} onPause={()=>void showList()} onNewMint={()=>void start()}/>}
 </div>;
}
