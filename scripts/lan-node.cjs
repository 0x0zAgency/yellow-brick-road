'use strict';
/** YBR node prototype: DNS-SD discovery, public identity, and real Kubo peering.
 * No RPC, files, signing, credentials, or remote management HTTP routes.
 */
const os=require('node:os'),net=require('node:net'),http=require('node:http');
const {EventEmitter}=require('node:events');
const {stripVTControlCharacters}=require('node:util');
const PATH='/ybr/node/v1',TYPE='ybr',MAX_PEERS=64;
const clean=v=>stripVTControlCharacters(String(v??'')).replace(/[^\x20-\x7e]/g,'').slice(0,60);
const peerId=v=>typeof v==='string'&&/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|12D3KooW[1-9A-HJ-NP-Za-km-z]{44})$/.test(v);
const port=v=>Number.isInteger(Number(v))&&Number(v)>=1024&&Number(v)<=65535;
const ipNumber=v=>v.split('.').reduce((n,b)=>(n*256+Number(b))>>>0,0);
const PRIVATE=[['10.0.0.0',8],['172.16.0.0',12],['192.168.0.0',16],['169.254.0.0',16]];
const inSubnet=(a,b,bits)=>bits>=0&&bits<=32&&(ipNumber(a)>>>(32-bits||0))===(ipNumber(b)>>>(32-bits||0));
function privateIPv4(address){return net.isIP(address)===4&&PRIVATE.some(([base,bits])=>inSubnet(address,base,bits));}
function interfaces(get=os.networkInterfaces){
 return Object.values(get()).flat().filter(v=>v&&!v.internal&&privateIPv4(v.address)&&net.isIP(v.netmask)===4)
  .map(v=>({address:v.address,netmask:v.netmask}));
}
function onLan(address,list){
 if(!privateIPv4(address))return false;
 return list.some(v=>((ipNumber(address)&ipNumber(v.netmask))>>>0)===((ipNumber(v.address)&ipNumber(v.netmask))>>>0));
}
function endpoint(value,list){
 const m=/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(String(value));
 if(!m||!onLan(m[1],list)||!port(m[2]||8792))throw Error('Enter a private IPv4 address on this LAN, optionally :port (default 8792).');
 return {address:m[1],port:Number(m[2]||8792)};
}
function publicProfile(p){
 if(!['ganache','sepolia'].includes(p?.network)||p.chainId!==(p.network==='ganache'?1337:11155111)||!/^0x[0-9a-f]{40}$/i.test(p.factoryAddress||'')||!/^0x[0-9a-f]{64}$/i.test(p.genesisHash||''))throw Error('The active deployment is not ready for LAN discovery.');
 return {network:p.network,chainId:p.chainId,factoryAddress:p.factoryAddress.toLowerCase(),genesisHash:p.genesisHash.toLowerCase()};
}
function manifest(value){
 if(value?.protocol!=='ybr-node'||value.version!==1||!peerId(value.peerId)||!port(value.swarmPort))throw Error('This endpoint is not a compatible YBR node.');
 return {protocol:'ybr-node',version:1,name:clean(value.name)||'YBR node',peerId:value.peerId,swarmPort:Number(value.swarmPort),profile:publicProfile(value.profile)};
}
async function readJson(response,limit=16384){
 if(!response.ok){await response.body?.cancel();throw Error('Node request failed (HTTP '+response.status+').');}
 let size=0;const chunks=[];
 for await(const part of response.body){size+=part.length;if(size>limit)throw Error('Node response is too large.');chunks.push(part);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Node returned invalid JSON.');}
}
function peerList(value){
 // Kubo encodes an empty Go peer slice as null, not necessarily [].
 if(value?.Peers===null)return [];
 if(!Array.isArray(value?.Peers))throw Error('Cannot read Kubo peers.');
 return value.Peers;
}
function kuboClient(value='http://127.0.0.1:5001',fetchImpl=fetch){
 const url=new URL(value);
 if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('LAN control requires a loopback Kubo admin RPC.');
 return async(command,args=[])=>{
  if(!['id','swarm/peers','swarm/connect','swarm/disconnect','swarm/filters','swarm/filters/rm'].includes(command))throw Error('Unsupported node operation.');
  const target=new URL('/api/v0/'+command,url);for(const arg of args)target.searchParams.append('arg',arg);
  return readJson(await fetchImpl(target,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000)}),1024*1024);
 };
}
class LanNode extends EventEmitter{
 constructor({profile,peer,env=process.env,getInterfaces=os.networkInterfaces,fetchImpl=fetch,kubo,bonjourFactory}={}){
  super();this.env=env;this.getInterfaces=getInterfaces;this.fetch=fetchImpl;this.kubo=kubo||kuboClient(env.YBR_KUBO_RPC,fetchImpl);
  this.bonjourFactory=bonjourFactory||((options,onError)=>new(require('bonjour-service').Bonjour)(options,onError));
  this.info=manifest({protocol:'ybr-node',version:1,peerId:peer,name:env.YBR_NODE_NAME||'YBR '+String(peer).slice(-8),swarmPort:env.YBR_LAN_SWARM_PORT||4001,profile});
  this.port=Number(env.YBR_LAN_PORT||8792);if(!port(this.port))throw Error('YBR_LAN_PORT must be between 1024 and 65535.');
  this.enabled=false;this.busy=false;this.peers=new Map();this.notice='LAN mode is off.';this.generation=0;
 }
 snapshot(){return {enabled:this.enabled,busy:this.busy,notice:this.notice,local:this.info,port:this.port,addresses:interfaces(this.getInterfaces).map(v=>v.address),peers:[...this.peers.values()].map(v=>({...v}))};}
 emitState(){this.emit('change',this.snapshot());}
 async localIdentity(){if((await this.kubo('id')).ID!==this.info.peerId)throw Error('Local Kubo identity changed. Restart the launcher before connecting.');}
 async enable(){
  if(this.enabled||this.busy)return;this.busy=true;this.emitState();const generation=++this.generation;
  const active=()=>{if(generation!==this.generation)throw Error('LAN mode stopped.');};
  try{
   const list=interfaces(this.getInterfaces);if(!list.length)throw Error('No private IPv4 LAN interface found. Connect to Wi-Fi or Ethernet.');
   await this.localIdentity();active();
   // Server-profile filters prevent both dialing AND accepting LAN peers. Only
   // remove the standard ranges covering a local interface; keep custom filters,
   // NoAnnounce, UPnP, admin binds, and all unrelated Kubo settings unchanged.
   const filters=(await this.kubo('swarm/filters')).Strings;
   active();if(!Array.isArray(filters))throw Error('Cannot read Kubo address filters.');
   const server=this.server=http.createServer((req,res)=>this.serve(req,res));
   server.requestTimeout=3000;server.headersTimeout=3000;server.keepAliveTimeout=1000;server.maxConnections=32;
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(this.port,'0.0.0.0',()=>{server.off('error',reject);resolve();});});
   active();server.on('error',()=>{this.notice='LAN listener failed. Disable and re-enable LAN mode.';this.emitState();});
   for(const [base,bits] of PRIVATE){
    const filter='/ip4/'+base+'/ipcidr/'+bits;
    if(filters.includes(filter)&&list.some(v=>inSubnet(v.address,base,bits))){await this.kubo('swarm/filters/rm',[filter]);active();}
   }
   this.enabled=true;
   this.notice='LAN mode on. Kubo LAN permissions are saved; [Enter] reviews a node.';
   try{
    this.bonjour=this.bonjourFactory({},()=>{this.notice='Multicast unavailable. Use [a] to enter a LAN IP address.';this.emitState();});
    this.advertisement=this.bonjour.publish({name:'YBR-'+this.info.peerId.slice(-16)+'-'+this.port,host:'ybr-'+this.info.peerId.slice(-16).toLowerCase()+'.local',type:TYPE,protocol:'tcp',port:this.port,disableIPv6:true,txt:{v:'1',peer:this.info.peerId,name:this.info.name}});
    this.advertisement.on('error',()=>{this.notice='Could not announce this node. Manual IP connections remain available.';this.emitState();});
    this.browser=this.bonjour.find({type:TYPE,protocol:'tcp'});
    for(const event of ['up','srv-update','txt-update'])this.browser.on(event,s=>this.discovered(s));
    this.browser.on('down',s=>{for(const p of this.peers.values())if(p.fqdn===s.fqdn)p.available=false;this.emitState();});
   }catch{this.notice='Multicast unavailable. Use [a] to enter a LAN IP address.';}
   this.timer=setInterval(()=>void this.refresh(),5000);this.timer.unref();
  }catch(error){await this.disable();throw error;}
  finally{this.busy=false;this.emitState();}
 }
 serve(req,res){
  const address=String(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const host=String(req.headers.host||'');
  if(!this.enabled||!onLan(address,interfaces(this.getInterfaces))||req.headers.origin||!/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(host)){res.writeHead(403);res.end('{}');return;}
  if(req.method!=='GET'||req.url!==PATH){res.writeHead(404);res.end('{}');return;}
  res.end(JSON.stringify(this.info));
 }
 discovered(service){
  if(!this.enabled||String(service.txt?.v)!=='1'||!peerId(service.txt?.peer)||service.txt.peer===this.info.peerId||!port(service.port))return;
  const list=interfaces(this.getInterfaces);
  const addresses=[service.referer?.address,...(Array.isArray(service.addresses)?service.addresses:[])];
  const address=addresses.find(a=>onLan(a,list));if(!address)return;
  const key=address+':'+service.port,old=this.peers.get(key);
  if(!old&&this.peers.size>=MAX_PEERS)return;
  // Identity changes invalidate a previously reviewed peer instead of reconnecting.
  const same=old?.peerId===service.txt.peer;
  this.peers.set(key,{...(same?old:{}),key,address,port:Number(service.port),peerId:service.txt.peer,name:clean(service.txt.name)||'YBR node',fqdn:clean(service.fqdn),available:true,seen:Date.now(),status:same?old.status:'Discovered'});this.emitState();
 }
 async review(key){
  if(!this.enabled)throw Error('Enable LAN mode first.');
  const target=endpoint(key,interfaces(this.getInterfaces));key=target.address+':'+target.port;
  const old=this.peers.get(key),generation=this.generation;
  const response=await this.fetch('http://'+target.address+':'+target.port+PATH,{redirect:'error',signal:AbortSignal.timeout(3000)});
  const remote=manifest(await readJson(response));
  if(!this.enabled||generation!==this.generation)throw Error('LAN mode stopped.');
  if(remote.peerId===this.info.peerId)throw Error('This is your own IPFS node.');
  if((old&&remote.peerId!==old.peerId)||(this.peers.has(key)&&this.peers.get(key).peerId!==remote.peerId))throw Error('Peer identity changed. Refresh discovery and review it again.');
  if(!old&&this.peers.size>=MAX_PEERS)throw Error('Node list is full. Disable LAN mode to clear it.');
  const entry={...old,...target,...remote,key,available:true,seen:Date.now(),status:old?.status||'Discovered'};
  this.peers.set(key,entry);this.emitState();
  return {...entry,sameDeployment:JSON.stringify(remote.profile)===JSON.stringify(this.info.profile)};
 }
 async connect(reviewed){
  if(this.busy)throw Error('A node operation is already running.');this.busy=true;this.emitState();const generation=this.generation;
  try{
   const current=await this.review(reviewed.key);
   if(current.peerId!==reviewed.peerId||current.swarmPort!==reviewed.swarmPort||JSON.stringify(current.profile)!==JSON.stringify(reviewed.profile))throw Error('Node details changed. Review this node again.');
   await this.localIdentity();
   if(!this.enabled||generation!==this.generation)throw Error('LAN mode stopped.');
   await this.kubo('swarm/connect',['/ip4/'+current.address+'/tcp/'+current.swarmPort+'/p2p/'+current.peerId]);
   const peers=peerList(await this.kubo('swarm/peers'));
   if(!peers?.some(p=>p.Peer===current.peerId&&p.Addr?.startsWith('/ip4/'+current.address+'/')))throw Error('Kubo did not confirm the LAN peer connection. Check TCP '+current.swarmPort+' and the peer\'s LAN mode.');
   if(!this.enabled||generation!==this.generation)return;
   if(this.peers.get(current.key)?.peerId!==current.peerId)throw Error('Peer identity changed during connection. Review it again.');
   this.peers.get(current.key).status='Connected';this.notice='Connected to '+current.name+' through IPFS. Active deployment unchanged.';
  }catch(error){this.notice='Connection failed. Check both nodes have LAN mode enabled and TCP swarm ports allowed.';throw error;}
  finally{this.busy=false;this.emitState();}
 }
 async disconnect(key){
  if(this.busy)throw Error('A node operation is already running.');const p=this.peers.get(key);if(!p)throw Error('Choose a node first.');
  this.busy=true;this.emitState();
  try{
   await this.localIdentity();await this.kubo('swarm/disconnect',['/p2p/'+p.peerId]);
   if(peerList(await this.kubo('swarm/peers')).some(v=>v.Peer===p.peerId))throw Error('Peer is still connected or has reconnected. Refresh its status.');
   p.status='Disconnected';this.notice='Disconnected from '+p.name+'. IPFS may reconnect independently.';
  }
  finally{this.busy=false;this.emitState();}
 }
 async refresh(){
  if(!this.enabled||this.busy||this.refreshing)return;this.refreshing=true;const generation=this.generation;
  try{
   this.browser?.expire();this.browser?.update();
   for(const service of this.browser?.services||[])this.discovered(service);
   await this.localIdentity();
   const list=peerList(await this.kubo('swarm/peers'));
   if(generation!==this.generation)return;
   for(const p of this.peers.values()){
    if(list.some(v=>v.Peer===p.peerId&&v.Addr?.startsWith('/ip4/'+p.address+'/')))p.status='Connected';
    else if(p.status==='Connected')p.status='Connection lost';
    if(Date.now()-p.seen>150000)p.available=false;
   }
  }catch{if(generation===this.generation){this.notice='Local Kubo unavailable or changed. Connection status is unknown.';for(const p of this.peers.values())if(p.status==='Connected')p.status='Unknown';}}
  finally{this.refreshing=false;this.emitState();}
 }
 async disable(){
  this.enabled=false;this.generation++;clearInterval(this.timer);
  this.browser?.stop();this.browser=null;
  if(this.bonjour){const instance=this.bonjour;this.bonjour=null;await new Promise(resolve=>{const timer=setTimeout(resolve,300);instance.unpublishAll(()=>{clearTimeout(timer);resolve();});});instance.destroy();}
  if(this.server){const server=this.server;this.server=null;server.closeAllConnections();await new Promise(resolve=>server.close(()=>resolve()));}
  this.peers.clear();this.notice='LAN discovery off. Existing IPFS connections and LAN permissions remain.';this.emitState();
 }
}
module.exports={LanNode,interfaces,onLan,privateIPv4,endpoint,manifest,publicProfile,kuboClient,readJson,PATH,TYPE};
