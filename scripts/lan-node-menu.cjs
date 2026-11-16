'use strict';
const {stripVTControlCharacters}=require('node:util');
const clean=v=>stripVTControlCharacters(String(v??'')).replace(/[^\x20-\x7e]/g,'');
class LanNodeMenu{
 constructor({node,onChange=()=>{},size=()=>({columns:80,rows:24})}){this.node=node;this.onChange=onChange;this.size=size;this.state={mode:'list',selected:0,error:'',input:'',node:node.snapshot()};this.listener=s=>{this.state.node=s;this.publish();};node.on('change',this.listener);this.publish();}
 publish(){if(!this.closed)this.onChange({...this.state});}
 close(){this.closed=true;this.node.off('change',this.listener);this.onChange(null);}
 async run(action){
  this.state.mode='busy';this.state.error='';this.publish();
  try{const review=await action();if(!this.closed){this.state.review=review;this.state.mode=review?'review':'list';}}
  catch(error){if(!this.closed){this.state.error=clean(error.message);this.state.mode='list';}}
  this.publish();
 }
 handle(text,key={}){
  if(key.sequence==='\x1b[200~'){this.pasting=true;return;}
  if(key.sequence==='\x1b[201~'){this.pasting=false;return;}
  if(this.pasting&&this.state.mode!=='input')return;
  if(key.name==='escape'||key.ctrl&&key.name==='c'){
   if(this.state.mode==='busy')return;
   if(this.state.mode==='list')this.close();else{this.state.mode='list';this.state.review=null;this.state.input='';this.publish();}return;
  }
  if(this.state.mode==='busy')return;
  if(key.name==='return'&&['enable','review'].includes(this.state.mode)&&(this.size().columns<80||this.size().rows<20)){
   this.state.error='Resize to at least 80x20 to review node identity and LAN permissions.';this.publish();return;
  }
  if(this.state.mode==='input'){
   if(key.name==='return'&&!this.pasting)void this.run(()=>this.node.review(this.state.input.trim()));
   else if(key.name==='backspace')this.state.input=this.state.input.slice(0,-1);
   else if(!key.ctrl&&!key.meta&&/^[\d.:]+$/.test(text||'')&&this.state.input.length+(text?.length||0)<=32)this.state.input+=text;
   this.publish();return;
  }
  if(this.state.mode==='enable'){
   if(key.name==='return')void this.run(()=>this.node.enable());return;
  }
  if(this.state.mode==='review'){
   if(key.name==='return')void this.run(()=>this.node.connect(this.state.review));return;
  }
  const peers=this.state.node.peers;this.state.selected=Math.min(this.state.selected,Math.max(0,peers.length-1));
  if(key.name==='e'){
   if(this.state.node.enabled)void this.run(()=>this.node.disable());else this.state.mode='enable';
  }else if(this.state.node.enabled){
   if(key.name==='a'){this.state.mode='input';this.state.input='';this.state.error='';}
   if(key.name==='up')this.state.selected=Math.max(0,this.state.selected-1);
   if(key.name==='down')this.state.selected=Math.min(Math.max(0,peers.length-1),this.state.selected+1);
   if(key.name==='r')void this.run(()=>this.node.refresh());
   const selected=peers[this.state.selected];
   if(key.name==='return'&&selected)void this.run(()=>this.node.review(selected.key));
   if(key.name==='x'&&selected)void this.run(()=>this.node.disconnect(selected.key));
  }
  this.publish();
 }
}
function renderLanMenu(state,{columns=80,rows=24,color=false}={}){
 const m=state.lanMenu,n=m.node,w=Math.max(5,Math.min(144,columns-1)),h=Math.max(3,rows-1);
 const fit=v=>clean(v).slice(0,w),gold=v=>color?'\x1b[38;5;220m'+fit(v)+'\x1b[0m':fit(v);
 const lines=[gold('YBR // LAN NODES'),fit('='.repeat(w))];let footer='[e] enable LAN   [Esc] back';
 if(m.mode==='enable'){
  lines.push('Enable this YBR node on the local network?','',
   'Announces its name, IPFS identity and public deployment.',
   'Enables Kubo private-IP ranges used by this computer (saved).',
   'IPFS can accept LAN peers; private recovery files stay local.',
   'App, wallet and admin RPC ports stay on localhost.');footer='[Enter] enable LAN   [Esc] cancel';
 }else if(m.mode==='input'){
  lines.push('Connect by private LAN IPv4 address','',m.input||'192.168.1.20:8792','',
   'Use the address shown in LAN Nodes on the other computer.');footer='[Enter] inspect node   [Esc] cancel';
 }else if(m.mode==='review'){
  const p=m.review;
  lines.push(p.name+'  /  '+p.key,'','IPFS peer: '+p.peerId,
   'Network: '+p.profile.network+' / chain '+p.profile.chainId,
   'Factory: '+p.profile.factoryAddress,
   'Genesis: '+p.profile.genesisHash,'',
   p.sameDeployment?'Reports the same deployment as this YBR.':'Reports a different deployment. This connects IPFS only.',
   'Connect IPFS over TCP '+p.swarmPort+'; your active chain stays selected.',
   'Discovery is untrusted. Compare the peer ID with the other terminal.');footer='[Enter] connect IPFS   [Esc] cancel';
 }else{
  lines.push('This node: '+n.local.name,'Peer: '+n.local.peerId,
   n.enabled?'LAN: '+n.addresses.map(a=>a+':'+n.port).join('  '):'LAN mode is off. Enable it on both computers.','');
  if(m.mode==='busy')lines.push('Working...');
  else if(n.enabled){
   if(!n.peers.length)lines.push('Looking for nearby YBR nodes...','No results? Use [a] to enter the other node\'s LAN IP.');
   const room=Math.max(1,h-12),at=Math.min(m.selected,Math.max(0,n.peers.length-1)),start=Math.max(0,at-room+1);
   for(let i=start;i<Math.min(n.peers.length,start+room);i++){
    const p=n.peers[i];lines.push((i===at?'> ':'  ')+p.name+' / '+p.key+' / '+p.status+(p.available?'':' / stale'));
   }
   footer='[Up/Down] select [Enter] review [a] IP [r] scan [x] drop [e] off [Esc] back';
  }
 }
 // Fixed bottom status area: incoming discovery never moves the controls.
 const status=m.error||n.notice,body=lines.map(fit).slice(0,Math.max(0,h-3));
 while(body.length<h-3)body.push('');
 return [...body,fit(status),'',gold(m.mode==='busy'?'Completing node operation...':footer)].slice(0,h);
}
module.exports={LanNodeMenu,renderLanMenu};
