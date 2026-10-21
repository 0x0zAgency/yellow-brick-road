'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createServer}=require('node:http');
const {once}=require('node:events');
const path=require('node:path');
const {IPFS_HEALTH,probeIpfs,ensureIpfs}=require('./dev-ipfs.cjs');

const READY={online:true,ready:true,peerId:'local-test-peer'};
const OFF={online:false,ready:false};
const WAIT={online:true,ready:false};
const health={ok:true,provider:'ybr-local-kubo',peerId:'local-test-peer'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
function harness(states){
 const calls=[];
 const child=Object.assign(new EventEmitter(),{exitCode:null,signalCode:null});
 let index=0;
 const options={
  env:{},log:()=>{},command:()=> 'npm',isStopping:()=>false,
  probe:async()=>{calls.push('probe');return states[Math.min(index++,states.length-1)];},
  spawnOwned:(...args)=>{calls.push(['spawn',...args]);return child;},
  run:async(...args)=>{calls.push(['run',...args]);},
  waitUntil:async(label,check)=>{
   for(let i=0;i<4;i++){
    const value=await check();
    if(value)return value;
   }
   throw Error('Timed out waiting for '+label+' to become ready.');
  }
 };
 return {options,calls,child};
}

test('IPFS health probes only the narrow loopback bridge endpoint',async()=>{
 const result=await probeIpfs({fetchImpl:async(url,options)=>{
  assert.equal(url,IPFS_HEALTH);
  assert.equal(options.cache,'no-store');
  assert.equal(options.redirect,'error');
  assert.ok(options.signal instanceof AbortSignal);
  return reply(health);
 }});
 assert.deepEqual(result,READY);
});
test('IPFS health distinguishes an offline bridge from an offline Kubo node',async()=>{
 assert.deepEqual(await probeIpfs({fetchImpl:async()=>{throw Error('ECONNREFUSED');}}),OFF);
 assert.deepEqual(await probeIpfs({fetchImpl:async()=>reply({ok:false,error:'Kubo node unavailable: fetch failed'},503)}),WAIT);
});
test('IPFS health rejects a non-YBR service, invalid peer, or forbidden origin',async()=>{
 for(const response of [
  reply({...health,provider:'another-service'}),
  reply({...health,peerId:''}),
  reply({...health,peerId:'   '}),
  reply({ok:true}),
  reply({error:'Forbidden'},403),
  reply({ok:false,error:'Some other service is unavailable'},503),
  new Response('<html>Not a bridge</html>')
 ]){
  await assert.rejects(probeIpfs({fetchImpl:async()=>response}),error=>error.fatal===true&&/Port 8791/.test(error.message));
 }
});
test('IPFS health reads readiness over real local HTTP',async()=>{
 let available=false;
 const server=createServer((req,res)=>{
  assert.equal(req.url,'/api/road-ipfs/health');
  res.writeHead(available?200:503,{'Content-Type':'application/json'});
  res.end(JSON.stringify(available?health:{ok:false,error:'Kubo node unavailable: starting'}));
 });
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 try{
  const fetchImpl=(_url,options)=>fetch('http://127.0.0.1:'+server.address().port+'/api/road-ipfs/health',options);
  assert.deepEqual(await probeIpfs({fetchImpl}),WAIT);
  available=true;
  assert.deepEqual(await probeIpfs({fetchImpl}),READY);
 }finally{
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
 }
});
test('IPFS startup reuses a healthy bridge and node without requiring Docker',async()=>{
 const h=harness([READY]);
 assert.deepEqual(await ensureIpfs(h.options),READY);
 assert.deepEqual(h.calls,['probe']);
});
test('IPFS startup launches only a missing bridge when Kubo is already ready',async()=>{
 const h=harness([OFF,READY]);
 await ensureIpfs(h.options);
 const spawns=h.calls.filter(Array.isArray);
 assert.equal(spawns.length,1);
 assert.deepEqual(spawns[0],['spawn','YBR IPFS bridge',process.execPath,[path.join(__dirname,'..','web','scripts','ipfs-bridge.mjs')]]);
});
test('IPFS startup starts Kubo behind an existing bridge and waits for readiness',async()=>{
 const h=harness([WAIT,WAIT,READY]);
 assert.deepEqual(await ensureIpfs(h.options),READY);
 assert.deepEqual(h.calls.filter(Array.isArray),[['run','YBR IPFS node','npm',['run','ipfs:up']]]);
});
test('IPFS startup starts both missing services in order without deleting volumes',async()=>{
 const h=harness([OFF,OFF,WAIT,WAIT,READY]);
 await ensureIpfs(h.options);
 const actions=h.calls.filter(Array.isArray);
 assert.equal(actions[0][0],'spawn');
 assert.deepEqual(actions[1],['run','YBR IPFS node','npm',['run','ipfs:up']]);
 assert.equal(actions.length,2);
 assert.doesNotMatch(JSON.stringify(actions),/ipfs:down|--volumes|prune/);
});
test('IPFS startup explains how to recover when Docker cannot start',async()=>{
 const h=harness([WAIT]);
 h.options.run=async()=>{throw Error('docker: command not found');};
 await assert.rejects(ensureIpfs(h.options),/Install Docker with Compose and start Docker Desktop/);
});
test('IPFS startup fails rather than reporting ready after a Kubo timeout',async()=>{
 const h=harness([WAIT]);
 await assert.rejects(ensureIpfs(h.options),/Timed out waiting for Kubo/);
});
test('IPFS startup fails fast when the bridge cannot spawn',async()=>{
 const h=harness([OFF]);
 h.options.spawnOwned=()=>{
  queueMicrotask(()=>h.child.emit('error',Error('spawn denied')));
  return h.child;
 };
 await assert.rejects(ensureIpfs(h.options),/IPFS bridge could not start: spawn denied/);
});
test('IPFS startup fails fast when a bridge process exits or loses a port race',async()=>{
 const h=harness([OFF,READY]);
 h.options.spawnOwned=()=>{h.child.exitCode=1;return h.child;};
 await assert.rejects(ensureIpfs(h.options),/IPFS bridge exited before readiness/);
});
test('IPFS startup stops after cancellation instead of launching another service',async()=>{
 const h=harness([OFF]);
 h.options.isStopping=()=>true;
 await assert.rejects(ensureIpfs(h.options),/IPFS startup cancelled/);
 assert.deepEqual(h.calls,[]);
});
test('IPFS startup does not replace an unavailable custom Kubo node',async()=>{
 const h=harness([WAIT]);
 h.options.env={YBR_KUBO_RPC:'http://127.0.0.1:5002'};
 await assert.rejects(ensureIpfs(h.options),/configured YBR_KUBO_RPC node is unavailable/);
 assert.deepEqual(h.calls,['probe']);
});
test('IPFS startup accepts a healthy existing bridge with a configured custom node',async()=>{
 const h=harness([READY]);
 h.options.env={YBR_KUBO_RPC:'http://127.0.0.1:5002'};
 assert.deepEqual(await ensureIpfs(h.options),READY);
 assert.deepEqual(h.calls,['probe']);
});
