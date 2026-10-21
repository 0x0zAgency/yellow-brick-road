'use strict';
/** Programmatic Ganache avoids exposing mnemonic arguments in process listings. */
const path=require('node:path');
const {readSelection,prepareProfile}=require('./dev-ganache-profile.cjs');
function ganacheOptions(root,selection=readSelection(root)){
 const paths=prepareProfile(root,selection);
 return {
  chain:{chainId:1337,networkId:1337,hardfork:'shanghai'},
  wallet:selection.kind==='default'?{deterministic:true}:{mnemonic:selection.mnemonic},
  database:{dbPath:paths.database}
 };
}
async function startGanache({root=path.resolve(__dirname,'..'),port=8545,quiet=false}={}){
 const selection=readSelection(root);
 const options=ganacheOptions(root,selection);
 const ganache=require('ganache');
 const server=ganache.server({...options,logging:{quiet}});
 try{await server.listen(port,'127.0.0.1');}
 catch{try{await server.close();}catch{}throw Error('Cannot start the selected Ganache profile. Check port 8545 and the local database lock.');}
 const accounts=await server.provider.request({method:'eth_accounts',params:[]});
 if(accounts[0]?.toLowerCase()!==selection.account.toLowerCase()){
  await server.close();throw Error('Ganache account 0 does not match the selected wallet profile. Existing data was not removed.');
 }
 return {server,selection,port:server.address().port};
}
async function main(){
 let live,closing=false;
 const close=async()=>{
  if(closing)return;closing=true;
  try{if(live)await live.server.close();}catch{process.exitCode=1;}
 };
 process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
 try{
  live=await startGanache();
  if(closing){await live.server.close();return;}
  console.log('Ganache wallet profile: '+live.selection.id);
  // The dashboard captures and verifies this one line and redacts it from disk.
  // Standalone redirected output never exposes a mnemonic.
  if(process.stdout.isTTY||process.env.YBR_GANACHE_DASHBOARD==='1')
   console.log('Mnemonic: '+live.server.provider.getOptions().wallet.mnemonic);
  console.log('RPC Listening on 127.0.0.1:'+live.port);
 }catch{
  console.error('[YBR] Ganache could not start. Check the selected private wallet settings, database permissions and port 8545.');process.exitCode=1;
 }
}
if(require.main===module)void main();
module.exports={startGanache,ganacheOptions};
