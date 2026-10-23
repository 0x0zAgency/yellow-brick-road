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
class NetworkControl{
 constructor({root,onChange=()=>{},onApply=()=>{},getInterfaces=os.networkInterfaces}){
  this.root=root;this.onChange=onChange;this.onApply=onApply;this.getInterfaces=getInterfaces;this.connection=null;this.menu=null;
 }
 cycle(){const list=connections(this.getInterfaces),at=list.findIndex(x=>x.id===this.connection?.id);this.connection=list.length?list[(at+1)%list.length]:null;if(this.menu)this.menu.connection=this.connection;this.emit();return this.connection;}
 emit(){this.onChange(this.menu,this.connection);}
 open(){const selected=readNetwork(this.root);this.menu={network:selected.network,revision:selected.revision,current:selected.network,connection:this.connection,confirm:false,error:''};if(!this.connection)this.cycle();else this.emit();}
 handle(text,key={}){
  if(!this.menu)return false;
  if(key.name==='escape'||key.ctrl&&key.name==='c'){this.menu=null;this.emit();return true;}
  if(key.name==='i'){this.cycle();return true;}
  if(key.name==='g'||key.name==='s'){this.menu.network=key.name==='g'?'ganache':'sepolia';this.menu.confirm=false;this.menu.error='';}
  if(key.name==='return'){
   if(!this.menu.confirm)this.menu.confirm=true;
   else try{const result=saveNetwork(this.root,this.menu.network,this.menu.revision);this.menu=null;this.emit();this.onApply(result);}catch(e){this.menu.error=e.message;this.menu.confirm=false;}
  }
  this.emit();return true;
 }
}
function renderNetworkMenu(state,{columns=80,rows=24,color=false}={}){
 const w=Math.max(5,Math.min(144,columns-1)),h=Math.max(3,rows-1),m=state.networkMenu||{},target=TARGETS[m.network]||TARGETS.ganache;
 const fit=v=>clean(v).slice(0,w),gold=v=>color?'\x1b[38;5;220m'+v+'\x1b[0m':v;
 const link=m.connection;
 const lines=[gold(fit('YBR DEV CONTROL // NETWORKS')),fit('='.repeat(w)),
  fit('MINT TARGET: '+target.label+' / chain '+target.chainId),
  fit('[g] Local Ganache 1337   [s] Sepolia 11155111'),'',
  fit('Selection applies on the next launcher start and browser reload.'),
  fit('The local Player, Registry and demo music remain on Ganache.'),
  fit('Your browser wallet must still approve its own network switch.'),
  fit(m.network==='sepolia'?'Sepolia needs test ETH and an existing compatible factory.':'The running local factory is supplied automatically.'),'',
  gold(fit('MACHINE CONNECTION // [i] next assigned address')),
  fit(link?link.name+' / '+link.family+' / '+link.address:'No assigned interfaces detected.'),
  fit(link?.internal?'Loopback interface':'Assigned interface address; not a listening app endpoint.'),
  fit('Reference only. No Wi-Fi, VPN, routing or service binding changes.'),'',
  fit(m.confirm?'CONFIRM: finish pending mints and save recovery keys.':'[Enter] review target change   [Esc] cancel'),
  fit(m.confirm?'[Enter] save and stop owned services; then npm run dev.':''),
  fit(m.error||'Existing chains, pins, media and interaction data are retained.')];
 return [...lines.slice(0,h-1),gold(fit('[Esc] back  [i] next interface  [Enter] '+(m.confirm?'save + stop':'review')))];
}
module.exports={TARGETS,readNetwork,saveNetwork,startupNetworkEnv,connections,NetworkControl,renderNetworkMenu};
