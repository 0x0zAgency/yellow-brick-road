'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {LanNode,interfaces,onLan,endpoint,manifest,kuboClient,readJson,PATH}=require('./lan-node.cjs');
const {LanNodeMenu,renderLanMenu}=require('./lan-node-menu.cjs');
const a='Qm'+'a'.repeat(44),b='Qm'+'b'.repeat(44),c='Qm'+'c'.repeat(44);
const profile={network:'ganache',chainId:1337,factoryAddress:'0x'+'1'.repeat(40),genesisHash:'0x'+'2'.repeat(64)};
const ifaces=()=>({en0:[{address:'192.168.4.10',netmask:'255.255.255.0',internal:false}],lo:[{address:'127.0.0.1',netmask:'255.0.0.0',internal:true}]});
const remote={protocol:'ybr-node',version:1,name:'Music Studio',peerId:b,swarmPort:4001,profile};
const flush=()=>new Promise(r=>setImmediate(r));
async function freePort(){const s=require('node:net').createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
function harness(options={}){
 const calls=[],connected=[];let identity=a;
 const node=new LanNode({profile,peer:a,env:{},getInterfaces:ifaces,fetchImpl:async(url,opts)=>{calls.push([url,opts]);return Response.json(remote);},
  kubo:async(command,args)=>{calls.push([command,args]);if(command==='id')return {ID:identity};if(command==='swarm/peers')return {Peers:connected};if(command==='swarm/connect')connected.push({Peer:b,Addr:'/ip4/192.168.4.20/tcp/4001'});if(command==='swarm/disconnect')connected.splice(0);return {Strings:[]};},...options});
 node.enabled=true;return {node,calls,connected,setIdentity:id=>{identity=id;}};
}
test('LAN address selection excludes public, off-subnet, loopback, hostnames and URL injection',()=>{
 const list=interfaces(ifaces);assert.equal(list.length,1);
 assert.deepEqual(endpoint('192.168.4.20',list),{address:'192.168.4.20',port:8792});
 for(const value of ['127.0.0.1','8.8.8.8','169.254.169.254','10.0.0.4','192.168.5.20','http://192.168.4.20','host.local','192.168.4.20:80','192.168.4.20:65536','192.168.4.20/path','192.168.4.20@evil'])assert.throws(()=>endpoint(value,list),/IPv4/);
 assert.equal(onLan('192.168.4.20',list),true);
});
test('manifest exposes an exact public allowlist and sanitizes terminal escape sequences',()=>{
 const value=manifest({...remote,name:'Studio\x1b[2J\nName',privateKey:'secret',rpcUrl:'secret',profile:{...profile,mnemonic:'secret',rpcUrl:'secret'}});
 assert.equal(value.name,'StudioName');assert.doesNotMatch(JSON.stringify(value),/secret|rpcUrl|mnemonic|privateKey/);
 for(const patch of [{version:2},{peerId:'../../../etc'},{swarmPort:80},{profile:{...profile,genesisHash:'bad'}}])assert.throws(()=>manifest({...remote,...patch}));
});
test('discovery is bounded, suppresses self and unsupported peers, and performs no network mutation',()=>{
 const {node,calls}=harness();
 const service={txt:{v:'1',peer:b,name:'Studio'},port:8792,addresses:['192.168.4.20'],fqdn:'studio._ybr._tcp.local'};
 node.discovered(service);node.discovered(service);assert.equal(node.peers.size,1);assert.equal(calls.length,0);
 for(const patch of [{txt:{v:'2',peer:b}},{txt:{v:'1',peer:a}},{addresses:['8.8.8.8']},{port:80}])node.discovered({...service,...patch});assert.equal(node.peers.size,1);
 for(let i=21;i<150;i++)node.discovered({...service,addresses:['192.168.4.'+i]});assert.equal(node.peers.size,64);
});
test('manual review canonicalizes endpoints and connect confirms actual LAN Kubo peer',async()=>{
 const {node,calls}=harness();const review=await node.review('192.168.4.20');assert.equal(review.key,'192.168.4.20:8792');assert.equal(review.sameDeployment,true);
 assert.equal(calls[0][0],'http://192.168.4.20:8792'+PATH);assert.equal(calls[0][1].redirect,'error');
 assert.equal(calls.some(c=>c[0]==='swarm/connect'),false);
 await node.connect(review);assert.equal(node.peers.get(review.key).status,'Connected');
 assert.deepEqual(calls.find(c=>c[0]==='swarm/connect')[1],['/ip4/192.168.4.20/tcp/4001/p2p/'+b]);
 await node.disconnect(review.key);assert.equal(node.peers.get(review.key).status,'Disconnected');
 assert.deepEqual(calls.find(c=>c[0]==='swarm/disconnect')[1],['/p2p/'+b]);
});
test('different deployments remain visible and never change local chain selection',async()=>{
 const {node}=harness({fetchImpl:async()=>Response.json({...remote,profile:{...profile,genesisHash:'0x'+'3'.repeat(64)}})});
 const review=await node.review('192.168.4.20');assert.equal(review.sameDeployment,false);await node.connect(review);assert.deepEqual(node.info.profile,profile);
});
test('identity/deployment/port changes between review and connect stop before dialing',async()=>{
 for(const patch of [{peerId:c},{profile:{...profile,factoryAddress:'0x'+'4'.repeat(40)}},{swarmPort:4101}]){
  const {node,calls}=harness();const review=await node.review('192.168.4.20');node.fetch=async()=>Response.json({...remote,...patch});
  await assert.rejects(node.connect(review),/changed/);assert.equal(calls.some(c=>c[0]==='swarm/connect'),false);
 }
 const {node,calls,setIdentity}=harness();const review=await node.review('192.168.4.20');setIdentity(c);
 await assert.rejects(node.connect(review),/identity changed/);assert.equal(calls.some(c=>c[0]==='swarm/connect'),false);
});
test('HTTP success alone cannot become Connected; peer loss and Kubo failure update status',async()=>{
 const {node,connected}=harness();const r=await node.review('192.168.4.20');await node.connect(r);
 connected.splice(0);await node.refresh();assert.equal(node.peers.get(r.key).status,'Connection lost');
 node.kubo=async cmd=>cmd==='id'?{ID:a}:{Peers:[],Strings:['connect success']};await assert.rejects(node.connect(r),/did not confirm/);
 node.peers.get(r.key).status='Connected';node.kubo=async()=>{throw Error('offline');};await node.refresh();assert.equal(node.peers.get(r.key).status,'Unknown');
});
test('Kubo null peer lists mean no connections, while malformed replies remain unknown',async()=>{
 const {node}=harness();const r=await node.review('192.168.4.20');await node.connect(r);
 node.kubo=async cmd=>cmd==='id'?{ID:a}:{Peers:null};await node.refresh();assert.equal(node.peers.get(r.key).status,'Connection lost');
 node.peers.get(r.key).status='Connected';node.kubo=async cmd=>cmd==='id'?{ID:a}:{};await node.refresh();assert.equal(node.peers.get(r.key).status,'Unknown');
});
test('expired reviews and asynchronous operations cannot reconnect after LAN mode stops',async()=>{
 const {node,calls}=harness();const r=await node.review('192.168.4.20');let done;
 node.fetch=()=>new Promise(resolve=>{done=resolve;});const pending=node.connect(r);await flush();await node.disable();done(Response.json(remote));
 await assert.rejects(pending,/stopped/);assert.equal(calls.some(c=>c[0]==='swarm/connect'),false);
});
test('Kubo client only calls local allowlisted commands and refuses redirects',async()=>{
 for(const url of ['http://192.168.4.20:5001','http://user:secret@127.0.0.1:5001','http://127.0.0.1:5001/path','http://127.0.0.1:5001/?x=1'])assert.throws(()=>kuboClient(url),/loopback/);
 const calls=[],kubo=kuboClient(undefined,async(url,opts)=>{calls.push([url,opts]);return Response.json({ID:a});});
 await kubo('id');assert.equal(calls[0][0].href,'http://127.0.0.1:5001/api/v0/id');assert.equal(calls[0][1].redirect,'error');await assert.rejects(kubo('config'),/Unsupported/);
 await assert.rejects(readJson(new Response('x'.repeat(20000))),/too large/);await assert.rejects(readJson(new Response('{}',{status:302})),/HTTP 302/);
});
test('LAN HTTP handler serves public identity only to same-subnet clients with literal hosts',()=>{
 const {node}=harness();
 function request(patch={}){let result={};node.serve({socket:{remoteAddress:'192.168.4.20'},headers:{host:'192.168.4.10:8792'},method:'GET',url:PATH,...patch},{setHeader:(k,v)=>{result[k]=v;},writeHead:code=>{result.status=code;},end:body=>{result.body=body;}});return result;}
 assert.deepEqual(JSON.parse(request().body),node.info);assert.equal(request()['Access-Control-Allow-Origin'],undefined);
 for(const patch of [{method:'POST'},{url:'/api/v0/id'},{url:'/ybr/node/v1?url=evil'}])assert.equal(request(patch).status,404);
 for(const patch of [{headers:{host:'evil.example:8792'}},{headers:{host:'192.168.4.10:8792',origin:'http://evil.example'}},{socket:{remoteAddress:'8.8.8.8'}},{socket:{remoteAddress:'127.0.0.1'}}])assert.equal(request(patch).status,403);
});
test('menu requires explicit enable/review/connect and Escape removes listeners',async()=>{
 class Fake extends EventEmitter{snapshot(){return {enabled:false,peers:[],local:{name:'YBR',peerId:a},addresses:[],notice:''};}async enable(){this.enabled=true;}}
 const node=new Fake();let state;const menu=new LanNodeMenu({node,onChange:s=>{state=s;}});
 menu.handle('e',{name:'e'});assert.equal(state.mode,'enable');assert.equal(node.enabled,undefined);menu.handle('',{name:'escape'});assert.equal(state.mode,'list');
 menu.handle('e',{name:'e'});menu.handle('',{name:'return'});await flush();assert.equal(node.enabled,true);
 menu.handle('',{name:'escape'});assert.equal(node.listenerCount('change'),0);assert.equal(state,null);
});
test('LAN menus remain bounded with a stable footer, hostile labels, and many discovered peers',()=>{
 const {node}=harness();for(let i=0;i<30;i++)node.peers.set(String(i),{name:'Studio\x1b[2J'+i,key:'192.168.4.'+i,status:'Discovered',available:true});
 for(const columns of [30,60,80,120])for(const rows of [12,24,40])for(const mode of ['list','enable','review','input','busy']){
  const lines=renderLanMenu({lanMenu:{mode,node:node.snapshot(),review:{...remote,key:'192.168.4.20:8792'},selected:29}},{columns,rows});
  assert.equal(lines.length,rows-1);assert.ok(lines.every(l=>l.length<columns));assert.doesNotMatch(lines.join('\n'),/\x1b/);
  if(columns>=80&&mode==='review')assert.match(lines.at(-1),/connect IPFS/);
 }
});
test('enabling LAN publishes DNS-SD and removes only standard filters for a local interface',async t=>{
 const calls=[],browser=new EventEmitter();browser.stop=()=>calls.push('stop');browser.update=()=>{};browser.expire=()=>{};
 let advertised;const {node}=harness({env:{YBR_LAN_PORT:String(await freePort())},kubo:async(cmd,args)=>{
  calls.push([cmd,args]);if(cmd==='id')return {ID:a};return {Strings:['/ip4/192.168.0.0/ipcidr/16','/ip4/10.0.0.0/ipcidr/8','/ip4/192.168.4.50/ipcidr/32']};
 },bonjourFactory:()=>({publish:options=>{advertised=options;return new EventEmitter();},find:()=>browser,unpublishAll:cb=>cb(),destroy:()=>calls.push('destroy')})});
 node.enabled=false;t.after(()=>node.disable());await node.enable();assert.equal(node.enabled,true);
 assert.equal(advertised.type,'ybr');assert.equal(advertised.protocol,'tcp');assert.deepEqual(advertised.txt,{v:'1',peer:a,name:'YBR '+a.slice(-8)});
 assert.deepEqual(calls.filter(c=>c[0]==='swarm/filters/rm'),[['swarm/filters/rm',['/ip4/192.168.0.0/ipcidr/16']]]);
 await node.disable();assert.equal(node.server,null);assert.equal(node.peers.size,0);assert.ok(calls.includes('destroy'));
 assert.equal(calls.some(c=>['shutdown','swarm/disconnect','config'].includes(c[0])),false);
});
test('multicast failure keeps manual discovery available and listener shutdown is complete',async t=>{
 const {node}=harness({env:{YBR_LAN_PORT:String(await freePort())},bonjourFactory:()=>{throw Error('multicast unavailable');}});node.enabled=false;t.after(()=>node.disable());
 await node.enable();assert.equal(node.enabled,true);assert.match(node.notice,/Multicast unavailable/);const server=node.server;await node.disable();assert.equal(server.listening,false);
});
test('shutdown during enable cannot publish or change filters afterwards',async()=>{
 let resolve;const {node,calls}=harness();node.enabled=false;node.localIdentity=()=>new Promise(r=>{resolve=r;});
 const enabling=node.enable();await node.disable();resolve();await assert.rejects(enabling,/stopped/);assert.equal(node.enabled,false);assert.equal(calls.length,0);
});
test('small terminals cannot confirm an unreadable peer identity or enable prompt',async()=>{
 const {node}=harness();let enabled=0;node.enable=async()=>{enabled++;};node.enabled=false;
 const menu=new LanNodeMenu({node,size:()=>({columns:60,rows:14})});
 menu.handle('e',{name:'e'});menu.handle('',{name:'return'});await flush();assert.equal(enabled,0);assert.match(menu.state.error,/Resize/);menu.close();
});
