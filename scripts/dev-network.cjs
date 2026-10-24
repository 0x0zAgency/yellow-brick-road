'use strict';
/** Mint-target selection and assigned-interface reference. Never OS Wi-Fi control,
 * remote RPC deployment, a bind-address change or a replacement for wallet consent.
 */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto');
const TARGETS=Object.freeze({ganache:{label:'Local Ganache',chainId:1337},sepolia:{label:'Sepolia testnet',chainId:11155111}});
const clean=value=>String(value??'').replace(/[\x00-\x1f\x7f-\x9f]/g,'').replace(/[^\x20-\x7e]/g,'?').slice(0,180);
const fileFor=root=>path.join(root,'.road-local','dev-network.json');
function checkedDirectory(root,{create=false}={}){
 const dir=path.join(root,'.road-local');
 if(create)try{fs.mkdirSync(dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 try{const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||(process.getuid&&st.uid!==process.getuid()))throw Error('Unsafe local network settings directory.');}catch(e){if(e.code!=='ENOENT')throw e;}
 return dir;
}
function readNetwork(root){
 checkedDirectory(root);let fd;
 try{
  fd=fs.openSync(fileFor(root),fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));const st=fs.fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||st.size>1024||(process.getuid&&st.uid!==process.getuid())||(process.platform!=='win32'&&(st.mode&0o077)))throw Error('Network settings must be an owner-only regular file.');
  let value;try{value=JSON.parse(fs.readFileSync(fd,'utf8'));}catch{throw Error('Invalid saved network settings.');}
  if(value.version!==1||!Object.hasOwn(TARGETS,value.network)||!/^[a-f0-9]{24}$/.test(value.revision))throw Error('Unsupported saved network settings.');
  return {version:1,network:value.network,revision:value.revision};
 }catch(e){if(e.code==='ENOENT')return {version:1,network:'ganache',revision:''};throw e;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
function saveNetwork(root,network,expectedRevision){
 if(!Object.hasOwn(TARGETS,network))throw Error('Choose Local Ganache or Sepolia testnet.');
 checkedDirectory(root,{create:true});const current=readNetwork(root);
 if(expectedRevision!==undefined&&current.revision!==expectedRevision)throw Error('Network settings changed elsewhere. Reopen the menu.');
 const value={version:1,network,revision:crypto.randomBytes(12).toString('hex')};
 const file=fileFor(root),temp=file+'.'+value.revision+'.tmp';let fd;
 try{fd=fs.openSync(temp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600);fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,file);}
 finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
 return value;
}
function startupNetworkEnv(root){const selected=readNetwork(root);return selected.revision?{VITE_ROAD_DEFAULT_NETWORK:selected.network,VITE_ROAD_NETWORK_SELECTION:selected.revision}:{};}
function connections(getInterfaces=os.networkInterfaces){
 let all;try{all=getInterfaces();}catch{return [];}
 const found=new Map();
 for(const [name,list] of Object.entries(all||{}))for(const item of Array.isArray(list)?list:[]){
  const family=net.isIP(item.address||'');if(!family||['0.0.0.0','::'].includes(item.address))continue;
  const key=name+'|'+family+'|'+item.address;
  found.set(key,{id:key,name:clean(name),address:clean(item.address),family:'IPv'+family,internal:item.internal===true});
 }
 return [...found.values()].sort((a,b)=>Number(b.internal)-Number(a.internal)||a.name.localeCompare(b.name)||a.family.localeCompare(b.family)||a.address.localeCompare(b.address));
}
/** Asynchronous preparation must finish before a selection can be saved. */
class NetworkControl{
 constructor({root,onChange=()=>{},onApply=async()=>{},onActivated=()=>{},onReview=async network=>{if(network==='sepolia')throw Error('Sepolia activation is not configured. No network was changed.');return {kind:'local',lines:['Local Ganache / chain 1337','No remote funds are used.']};},onSecret=()=>{},getInterfaces=os.networkInterfaces}){
  Object.assign(this,{root,onChange,onApply,onActivated,onReview,onSecret,getInterfaces});
  this.connection=null;this.menu=null;this.plan=null;this.options={};this.generation=0;this.buffer='';this.pasting=false;
 }
 cycle(){const list=connections(this.getInterfaces),at=list.findIndex(x=>x.id===this.connection?.id);this.connection=list.length?list[(at+1)%list.length]:null;if(this.menu)this.menu.connection=this.connection;this.emit();return this.connection;}
 emit(){this.onChange(this.menu,this.connection);}
 open(){const selected=readNetwork(this.root);this.options={};this.plan=null;this.buffer='';this.generation++;this.menu={network:selected.network,revision:selected.revision,current:selected.network,connection:this.connection,mode:'select',error:''};if(!this.connection)this.cycle();else this.emit();}
 async review(){
  const id=++this.generation,network=this.menu.network;this.plan=null;this.menu.mode='preparing';this.menu.error='';this.emit();
  try{const plan=await this.onReview(network,{...this.options});if(!this.menu||id!==this.generation)return;this.plan=plan;this.menu.mode='review';this.menu.lines=plan.lines;this.menu.deploy=plan.kind==='deploy';}
  catch(error){if(this.menu&&id===this.generation){this.menu.mode='select';this.menu.error=error.message;}}
  this.emit();
 }
 async apply(approval=''){
  if(!this.plan||!this.menu)return;
  const selected={network:this.menu.network,revision:this.menu.revision},plan=this.plan;
  this.menu.mode='applying';this.menu.error='';this.emit();
  try{
   if(readNetwork(this.root).revision!==selected.revision)throw Error('Network settings changed elsewhere. Reopen the menu.');
   await this.onApply(plan,approval,selected);
   const saved=saveNetwork(this.root,selected.network,selected.revision);
   this.plan=null;this.options={};this.buffer='';this.menu=null;this.emit();this.onActivated(saved);
  }catch(error){if(this.menu){this.menu.mode='select';this.menu.error=error.message;this.plan=null;this.buffer='';this.emit();}}
 }
 handle(text,key={}){
  if(!this.menu)return false;
  if(key.sequence==='\x1b[200~'){this.pasting=true;return true;}
  if(key.sequence==='\x1b[201~'){this.pasting=false;return true;}
  if(this.pasting&&this.menu.mode==='approval')return true;
  if(this.pasting&&['return','enter'].includes(key.name))return true;
  if(this.menu.mode==='applying')return true; // A broadcast cannot be undone by Escape.
  if(key.name==='escape'||key.ctrl&&key.name==='c'){this.generation++;this.options={};this.plan=null;this.buffer='';this.menu=null;this.emit();return true;}
  if(this.menu.mode==='input'||this.menu.mode==='approval'){
   if(key.name==='return'){
    if(this.menu.mode==='approval'){
     if(this.buffer!=='DEPLOY SEPOLIA'){this.menu.error='Type DEPLOY SEPOLIA exactly, or Escape to cancel.';this.buffer='';}
     else {this.buffer='';void this.apply('DEPLOY SEPOLIA');return true;}
    }else{
     const field=this.menu.field,value=this.buffer.trim();
     try{
      if(field==='privateKey'&&!/^0x[0-9a-f]{64}$/i.test(value))throw Error('Enter a 0x-prefixed private key from a separate Sepolia test wallet.');
      if(field==='rpcUrl')require('./dev-network-profile.cjs').checkedRpc(value);
      if(field==='factoryAddress'&&value&&!/^0x[0-9a-f]{40}$/i.test(value))throw Error('Enter a factory address, or leave it blank for a new deployment.');
      if(field==='deploymentBlock'&&!/^\d{1,12}$/.test(value))throw Error('Enter a nonnegative deployment block number.');
      if(field==='maxEth')require('./deployment-budget.cjs').parseEther(value);
      this.options[field]=value;if(field==='privateKey'||field==='rpcUrl')this.onSecret(value);
      this.buffer='';this.menu.mode='select';this.menu.field=null;this.menu.error='';this.plan=null;
     }catch(error){this.menu.error=error.message;this.buffer='';}
    }
   }else if(key.name==='backspace')this.buffer=this.buffer.slice(0,-1);
   else if(!key.ctrl&&!key.meta&&typeof text==='string'&&!/[\x00-\x1f\x7f]/.test(text)&&this.buffer.length+text.length<=2048)this.buffer+=text;
   this.menu.characters=this.buffer.length;this.emit();return true;
  }
  if(key.name==='i'){this.cycle();return true;}
  if(this.menu.mode==='preparing')return true;
  if(key.name==='g'||key.name==='s'){this.menu.network=key.name==='g'?'ganache':'sepolia';this.menu.mode='select';this.menu.error='';this.plan=null;}
  const fields={u:'rpcUrl',f:'factoryAddress',k:'privateKey',b:'deploymentBlock',c:'maxEth'};
  if(this.menu.network==='sepolia'&&fields[key.name]){this.plan=null;this.buffer='';this.menu.mode='input';this.menu.field=fields[key.name];this.menu.characters=0;this.menu.error='';}
  if(key.name==='r')void this.review();
  if(key.name==='return'){
   if(this.menu.mode!=='review')void this.review();
   else if(this.plan?.kind==='deploy'){this.menu.mode='approval';this.buffer='';this.menu.characters=0;}
   else void this.apply();
  }
  this.emit();return true;
 }
}
function renderNetworkMenu(state,{columns=80,rows=24,color=false}={}){
 const w=Math.max(5,Math.min(144,columns-1)),h=Math.max(3,rows-1),m=state.networkMenu||{},target=TARGETS[m.network]||TARGETS.ganache;
 const fit=v=>clean(v).slice(0,w),gold=v=>color?'\x1b[38;5;220m'+v+'\x1b[0m':v;
 const lines=[gold(fit('YBR DEV CONTROL // ACTIVE NETWORK')),fit('='.repeat(w)),
  fit('PROPOSED: '+target.label+' / chain '+target.chainId),
  fit('Current selection: '+(m.current||'ganache')+' / unchanged until approval')];
 if(m.mode==='input'){
  const names={rpcUrl:'Sepolia RPC URL (HTTPS, kept private)',factoryAddress:'Existing factory address (blank = new)',privateKey:'Separate Sepolia TEST private key (hidden; not saved)',deploymentBlock:'Factory deployment block (0 = recent bounded scan)',maxEth:'Maximum deployment budget in Sepolia ETH'};
  lines.push('',fit(names[m.field]),fit('Input hidden: '+(m.characters||0)+' characters'),fit('[Enter] accept field   [Esc] cancel entire switch'),fit('Never enter a production wallet or a Ganache demo seed.'));
 }else if(m.mode==='preparing'||m.mode==='applying')lines.push('',fit(m.mode==='preparing'?'Verifying RPC / factory and estimating cost...':'Applying approved plan. A submitted transaction cannot be undone.'),fit('No silent Ganache fallback; existing databases and pins are retained.'));
 else if(m.mode==='review'||m.mode==='approval'){
  lines.push('',...(m.lines||[]).map(fit),'',gold(fit(m.mode==='approval'?'Type DEPLOY SEPOLIA, then Enter ('+(m.characters||0)+' characters)':m.deploy?'[Enter] review spending approval   [r] refresh quote':'[Enter] activate verified network / restart required')));
 }else lines.push('',fit('[g] Local Ganache 1337   [s] Sepolia 11155111'),fit('Switches Mint Studio, Player, Registry, Buildings and analytics.'),fit('[u] RPC URL  [f] existing factory  [b] deployment block'),fit('[k] test signer (hidden)  [c] ETH ceiling (default 0.05)'),fit('[Enter] verify and estimate; no transaction yet.'),fit('Existing deployments are verified and reused without gas.'));
 if(m.connection)lines.push('',fit('[i] '+m.connection.name+' / '+m.connection.family+' / '+m.connection.address));
 if(m.error)lines.push('',fit(m.error));
 // Keep errors and approval controls visible on small terminals.
 const footer=gold(fit(m.mode==='applying'?'Deployment state is journaled locally; do not submit again.':'[Esc] cancel  [i] interfaces  [Enter] '+(m.mode==='approval'?'approve':'continue')));
 const body=lines.slice(0,Math.max(0,h-2));if(m.error)body.push(fit(m.error));
 return [...body,footer].slice(0,h);
}
module.exports={TARGETS,readNetwork,saveNetwork,startupNetworkEnv,connections,NetworkControl,renderNetworkMenu};
