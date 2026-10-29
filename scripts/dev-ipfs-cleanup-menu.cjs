'use strict';
const {stripVTControlCharacters}=require('node:util');
const {bytes}=require('./dev-ipfs-cleanup.cjs');
const clean=value=>stripVTControlCharacters(String(value??'')).replace(/[^\x20-\x7e]/g,'?');
function wrap(value,width){
 let text=clean(value);const lines=[];
 while(text.length>width){const space=text.lastIndexOf(' ',width),end=space>width/2?space:width;lines.push(text.slice(0,end));text=text.slice(end).trimStart();}
 return [...lines,text];
}
function reviewLines(menu){
 const p=menu.plan,all=p.mode==='all';
 return [all?'ALL LOCAL FILES / irreversible':'UNPINNED CACHE ONLY',
  'Kubo: '+p.rpc,'Peer: '+p.peerId,
  'Pinned roots: '+p.pins.length+' | Desktop top-level entries: '+p.files.length,
  'Repository: '+bytes(p.repoBytes)+' | Blocks: '+p.objects,'',
  ...(all?['Removes ALL pins + IPFS Desktop files, then collects unpinned blocks.',
   'Includes other apps and every wallet/network profile on this node.',
   'NFT images and encrypted recovery may stop working. Cannot undo.']:
   ['Collects unpinned blocks. Pins and IPFS Desktop files are retained.']),
  'Pause uploads/Desktop edits. Close artwork views before continuing.',
  'Keeps chain, wallet keys, originals, Player copies and Playable Covers.',
  'Other peers/remote pins remain. Report is metadata, not a backup.','',
  'Type: '+p.confirmation,'> '+(menu.confirmation||'')];
}
function reviewFits(menu,{columns=80,rows=24}={}){
 // Reserve title, error space and footer. Never allow a cropped target/warning.
 return columns>=80&&rows>=24&&reviewLines(menu).flatMap(line=>wrap(line,Math.min(144,columns-1))).length+5<=rows-1;
}
class IpfsCleanupMenu{
 constructor({cleaner,onChange=()=>{},onComplete=()=>{},size=()=>({columns:80,rows:24})}){
  Object.assign(this,{cleaner,onChange,onComplete,size});this.active=true;this.pasting=false;this.state={stage:'menu'};
 }
 publish(){if(this.active)this.onChange({...this.state});}
 cancel(){if(this.state.stage==='applying')return;this.active=false;this.onChange(null);}
 scan(mode){
  this.state={stage:'scanning',mode};this.publish();
  this.pending=Promise.resolve().then(()=>this.cleaner.scan(mode)).then(plan=>{
   if(!this.active)return;this.state={stage:'review',plan,confirmation:''};this.publish();
  }).catch(error=>{if(!this.active)return;this.state={stage:'error',error:error.message};this.publish();});
 }
 handle(text,key={}){
  if(!this.active)return;
  if(key.sequence==='\x1b[200~'){this.pasting=true;return;}
  if(key.sequence==='\x1b[201~'){this.pasting=false;return;}
  if(this.state.stage==='applying')return;
  if(key.name==='escape'||key.ctrl&&key.name==='c'){this.cancel();return;}
  if(this.pasting)return;
  if(this.state.stage==='menu'){
   if(key.name==='a')this.scan('all');if(key.name==='c')this.scan('cache');return;
  }
  if(this.state.stage!=='review')return;
  if(key.name==='backspace')this.state.confirmation=this.state.confirmation.slice(0,-1);
  else if(key.ctrl&&key.name==='u')this.state.confirmation='';
  else if(key.name==='return'||key.name==='enter'){
   if(!reviewFits(this.state,this.size())){this.state.error='Enlarge the terminal to show the complete review.';this.publish();return;}
   const {plan,confirmation}=this.state;
   if(confirmation!==plan.confirmation){this.state.error='Type the exact confirmation above, then press Enter.';this.publish();return;}
   this.state={stage:'applying',progress:{stage:'checking'}};this.publish();
   this.pending=Promise.resolve().then(()=>this.cleaner.apply(plan,confirmation,{onProgress:progress=>{this.state.progress=progress;this.publish();}}))
    .then(result=>{this.state={stage:'result',result};this.onComplete(result);this.publish();})
    .catch(error=>{this.state={stage:'error',error:error.message,result:error.result};if(error.result)this.onComplete(error.result);this.publish();});
   return;
  }else if(!key.ctrl&&!key.meta&&typeof text==='string'&&/^[a-zA-Z0-9 ]$/.test(text))this.state.confirmation=(this.state.confirmation+text).slice(0,40);
  this.publish();
 }
}
function renderIpfsCleanupMenu(state,{columns=80,rows=24,color=false}={}){
 const menu=state.cleanupMenu||{},width=Math.max(5,Math.min(144,columns-1)),height=Math.max(3,rows-1);
 const lines=['YBR // IPFS CLEANUP',''];
 if(menu.stage==='menu')lines.push('[a] Remove ALL local IPFS files','[c] Reclaim unpinned cache only','',
  'First: review the node, file counts and consequences.',
  'No data is changed until you type the confirmation.',
  'This controls the local Kubo node, including IPFS Desktop.',
  'Full cleanup includes pins and files from other apps.');
 else if(menu.stage==='scanning')lines.push('Reading local node identity, pins, Desktop files and storage...','Nothing is being deleted.');
 else if(menu.stage==='review'){
  if(reviewFits(menu,{columns,rows}))lines.push(...reviewLines(menu));
  else lines.push('CLEANUP BLOCKED: the full review must be visible.', 'Resize to at least 80x24; larger for long node identities.', 'No deletion can be approved in this view.');
 }else if(menu.stage==='applying'){
  const p=menu.progress||{};lines.push('Confirmed cleanup in progress. Keep this terminal open.','',
   p.stage==='files'?'Desktop entries removed: '+p.removedFiles+' / '+p.totalFiles:
   p.stage==='pins'?'Pins removed: '+p.unpinned+' / '+p.totalPins:
   p.stage==='gc'?'Collecting unpinned blocks: '+p.removedBlocks:'Rechecking the reviewed node before cleanup...');
 }
 if(menu.result){
  const r=menu.result;lines.push('Result: '+r.status,
   'Pins removed: '+r.unpinned+' | Desktop entries removed: '+r.removedFiles,
   'Blocks collected: '+r.removedBlocks,
   ...(r.reclaimedBytes===undefined?[]:['Reclaimed: '+bytes(r.reclaimedBytes)+' | Repository: '+bytes(r.afterBytes),
    'Remaining pins: '+r.remainingPins+' | Desktop entries: '+r.remainingFiles]),
   ...(r.reportFile?['','Report: '+r.reportFile]:[]),...(r.warning?[r.warning]:[]));
 }
 if(menu.error)lines.push('',menu.error);
 const footer=menu.stage==='applying'?'Cleanup is running. Quit/cancel keys are disabled.':'[Esc / Ctrl+C] Back to Dev Control';
 const result=lines.flatMap(line=>wrap(line,width)).slice(0,height-1);result.push(clean(footer).slice(0,width));
 if(color)result[0]='\x1b[38;5;220m'+result[0]+'\x1b[0m';return result;
}
module.exports={IpfsCleanupMenu,renderIpfsCleanupMenu,reviewFits};
