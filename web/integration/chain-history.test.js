import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {connectChain,mintOnChain,localConfig} from '../src/chain-mint.js';
import {makeRegistrationPacket} from '../src/mint-model.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(import.meta.url);
const options=time=>({logging:{quiet:true},chain:{chainId:1337,networkId:1337,time:new Date(time)},wallet:{deterministic:true}});

test('a recreated local chain can mint despite a previous generation numbered-block cache; a foreign chain is still refused', {timeout:60000},async t=>{
 let old=ganache.server(options('2020-01-01T00:00:00Z'));
 await old.listen(0,'127.0.0.1');
 const port=old.address().port;
 const cached=new Map();
 for(let i=0;i<7;i++){
  const b=await old.provider.request({method:'eth_getBlockByNumber',params:['latest',false]});cached.set(b.number,b);
  await old.provider.request({method:'evm_mine',params:[]});
 }
 await old.close();old=null;
 const server=ganache.server(options('2021-01-01T00:00:00Z'));
 await server.listen(port,'127.0.0.1');t.after(()=>server.close());
 const rpcUrl='http://127.0.0.1:'+port,chain=localConfig(rpcUrl,1337);
 const account=privateKeyToAccount(Object.values(server.provider.getInitialAccounts())[0].secretKey);
 const wallet=createWalletClient({account,chain,transport:http(rpcUrl)});
 const client=createPublicClient({chain,transport:http(rpcUrl)});
 const artifact=JSON.parse(fs.readFileSync(path.join(root,'artifacts/contracts/YellowBrickFactory.sol/YellowBrickFactory.json')));
 const deployment=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode});
 const factoryAddress=(await client.waitForTransactionReceipt({hash:deployment})).contractAddress;
 let sends=0,freshHeadReads=0;
 const provider={async request({method,params}){
  if(method==='eth_accounts')return [account.address];
  if(method==='eth_getBlockByNumber'){
   if(params[0]==='pending')freshHeadReads++;
   else if(cached.has(params[0]))return cached.get(params[0]);
  }
  if(method==='eth_sendTransaction'){
   sends++;const tx=params[0];
   return wallet.sendTransaction({to:tx.to,data:tx.data,gas:BigInt(tx.gas),value:0n});
  }
  return server.provider.request({method,params});
 }};
 const config={provider,rpcUrl,chainId:1337,account:account.address};
 // The old algorithm compares these two blocks and fails despite one live node.
 const actual=await client.getBlock();
 assert.notEqual((await provider.request({method:'eth_getBlockByNumber',params:['0x'+actual.number.toString(16),false]})).hash,actual.hash);
 await connectChain(config);
 const packet=makeRegistrationPacket({metadata:{artist:'History regression',title:'Original test work'},assets:{master:{name:'work.bin',hash:'ab'.repeat(32),size:4}},identity:{mode:'external',connected:true,address:account.address},royalties:{creatorBps:10000},training:'separate-license',composition:false,storage:'demo-encrypted-in-browser'});
 const result=await mintOnChain({...config,packet,factoryAddress});
 assert.equal(result.status,'confirmed');assert.ok(result.receipts.length>0);
 assert.ok(result.receipts.every(r=>r.status==='verified'));assert.ok(sends>0);assert.ok(freshHeadReads>0);
 const foreign=ganache.server(options('2022-01-01T00:00:00Z'));
 await foreign.listen(0,'127.0.0.1');t.after(()=>foreign.close());
 const before=sends;
 const wrongProvider={async request(args){
  if(args.method==='eth_accounts')return [account.address];
  if(args.method==='eth_sendTransaction'){sends++;throw Error('Must not sign on a mismatched chain');}
  return foreign.provider.request(args);
 }};
 await assert.rejects(mintOnChain({...config,provider:wrongProvider,packet,factoryAddress}),/different blockchain histories/);
 assert.equal(sends,before,'A real chain mismatch must fail before a wallet signature');
});

function startCli(args,cwd){
 return new Promise((resolve,reject)=>{
  const cli=path.join(path.dirname(require.resolve('ganache')),'cli.js');
  const child=spawn(process.execPath,[cli,...args],{cwd,stdio:['ignore','pipe','pipe']});
  let settled=false,tail='';
  const timer=setTimeout(()=>{child.kill('SIGTERM');if(!settled){settled=true;reject(Error('Disposable Ganache CLI startup timeout'));}},30000);
  const consume=chunk=>{
   tail=(tail+chunk.toString()).slice(-16384);
   const match=/RPC Listening on 127\.0\.0\.1:(\d+)/.exec(tail);
   if(match&&!settled){settled=true;clearTimeout(timer);resolve({child,url:'http://127.0.0.1:'+match[1]});}
  };
  child.stdout.on('data',consume);child.stderr.on('data',consume);
  child.once('error',()=>{clearTimeout(timer);if(!settled){settled=true;reject(Error('Disposable Ganache CLI spawn failed'));}});
  child.once('exit',code=>{clearTimeout(timer);if(!settled){settled=true;reject(Error('Disposable Ganache CLI exited '+code));}});
 });
}
async function stopCli(child){
 if(child.exitCode!==null||child.signalCode!==null)return;
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Disposable test Ganache did not stop'));},10000);
  child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');
 });
}
async function rpc(url,method,params=[]){
 const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(5000)});
 assert.equal(res.ok,true);const data=await res.json();assert.equal(data.error,undefined);return data.result;
}
test('the actual npm Ganache command retains block hashes, nonce, balance and deployed code after restart', {timeout:60000},async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-chain-persistence-'));
 fs.mkdirSync(path.join(tmp,'.road-local'),{mode:0o700});
 const script=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).scripts.ganache;
 const [executable,...args]=script.split(/\s+/);
 assert.equal(executable,'ganache');
 assert.equal(args[args.indexOf('--database.dbPath')+1],'.road-local/ganache');
 assert.equal(args[args.indexOf('--chain.networkId')+1],'1337');
 args[args.indexOf('--server.port')+1]='0'; // Everything except the test port is the real launch command.
 let running;
 try{
  running=await startCli(args,tmp);
  const [from,to]=await rpc(running.url,'eth_accounts');
  await rpc(running.url,'eth_sendTransaction',[{from,to,value:'0x1',gas:'0x5208'}]);
  const tx=await rpc(running.url,'eth_sendTransaction',[{from,data:'0x6001600c60003960016000f300',gas:'0x186a0'}]);
  const receipt=await rpc(running.url,'eth_getTransactionReceipt',[tx]);assert.ok(receipt.contractAddress);
  const before={genesis:await rpc(running.url,'eth_getBlockByNumber',['0x0',false]),
   latest:await rpc(running.url,'eth_getBlockByNumber',['latest',false]),
   nonce:await rpc(running.url,'eth_getTransactionCount',[from,'latest']),
   balance:await rpc(running.url,'eth_getBalance',[from,'latest']),
   code:await rpc(running.url,'eth_getCode',[receipt.contractAddress,'latest'])};
  assert.equal(before.code,'0x00');
  await stopCli(running.child);running=null;
  running=await startCli(args,tmp);
  assert.equal(await rpc(running.url,'eth_chainId'),'0x539');
  assert.equal(await rpc(running.url,'net_version'),'1337');
  assert.equal((await rpc(running.url,'eth_getBlockByNumber',['0x0',false])).hash,before.genesis.hash);
  assert.equal((await rpc(running.url,'eth_getBlockByNumber',['latest',false])).hash,before.latest.hash);
  assert.equal(await rpc(running.url,'eth_getTransactionCount',[from,'latest']),before.nonce);
  assert.equal(await rpc(running.url,'eth_getBalance',[from,'latest']),before.balance);
  assert.equal(await rpc(running.url,'eth_getCode',[receipt.contractAddress,'latest']),before.code);
  assert.equal((await rpc(running.url,'eth_getTransactionReceipt',[tx])).blockHash,receipt.blockHash);
 }finally{if(running)await stopCli(running.child);fs.rmSync(tmp,{recursive:true,force:true});}
});
