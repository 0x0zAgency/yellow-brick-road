'use strict';
/** Actual creator components, launcher identity and read-only mock wallet.
 * Separate Vite process; no public RPC, signing, funds or creator files.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const ROOT=path.resolve(__dirname,'..'),base='http://127.0.0.1:5175',factory='0x'+'a'.repeat(40),genesis='0x'+'b'.repeat(64);
const stem='active-network-browser-'+process.pid,html=path.join(ROOT,'web',stem+'.html'),jsx=path.join(ROOT,'web/src',stem+'.jsx');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 if(!process.env.CI)throw Error('This isolated mock-wallet test is CI-only.');
 fs.writeFileSync(html,'<!doctype html><html><body><div id="root"></div><script type="module" src="/src/'+stem+'.jsx"></script></body></html>',{flag:'wx'});
 fs.writeFileSync(jsx,`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import MintStudioDemo from './MintStudioDemo.jsx';import WalletBricks from './WalletBricks.jsx';import LiveRegistry from './LiveRegistry.jsx';
window.walletWrites=0;window.walletChain='0x539';window.ethereum={request:async({method})=>{if(method==='eth_chainId')return window.walletChain;if(method==='eth_accounts')return ['0x'+'c'.repeat(40)];window.walletWrites++;throw Error('No signing is permitted in this fixture');},on:(event,handler)=>{if(event==='chainChanged')window.walletChainChanged=handler;},removeListener:()=>{}};
function Test(){const [view,setView]=useState('mint');return <><nav><button onClick={()=>setView('mint')}>Fixture Mint</button><button onClick={()=>setView('wallet')}>Fixture Wallet</button><button onClick={()=>setView('registry')}>Fixture Registry</button></nav>{view==='mint'?<MintStudioDemo wallet={'0x'+'c'.repeat(40)}/>:view==='wallet'?<WalletBricks wallet={'0x'+'c'.repeat(40)}/>:<LiveRegistry/>}</>};
createRoot(document.getElementById('root')).render(<Test/>);
`,{flag:'wx'});
 const child=spawn(process.execPath,[path.join(ROOT,'web/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5175','--strictPort'],{cwd:path.join(ROOT,'web'),env:{...process.env,VITE_ROAD_ACTIVE_NETWORK:'sepolia',VITE_ROAD_ACTIVE_CHAIN_ID:'11155111',VITE_ROAD_ACTIVE_FACTORY:factory,VITE_ROAD_ACTIVE_GENESIS_HASH:genesis,VITE_ROAD_ACTIVE_DEPLOYMENT_BLOCK:'7'},stdio:['ignore','pipe','pipe']});
 let log='',browser;for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{log=(log+chunk).slice(-10000);});
 try{
  let ready=false;for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error(log);try{if((await fetch(base)).ok){ready=true;break;}}catch{}await wait(250);}assert.ok(ready,log);
  browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('road:mint:network:v1',JSON.stringify({version:1,data:{network:'ganache',ganacheChainId:'1337',rpcUrl:'http://127.0.0.1:8545',useStartupFactory:false,factories:{'sepolia:11155111':'0x'+'d'.repeat(40)}}}));});
  await page.route('**/road/api/registry',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({format:'ybr-chain-registry/1',network:{ready:true,chainId:11155111,name:'Sepolia',factoryAddress:factory,genesisHash:genesis,rpcUrl:'/road/rpc',deploymentBlock:7},bricks:[],head:{number:'9',hash:'0x'+'e'.repeat(64)},fromBlock:'7',limited:false,matchingEvents:0,limitReached:false})}));
  await page.goto(base+'/'+stem+'.html');await page.getByRole('button',{name:'Continue →',exact:true}).click();
  await page.getByLabel('Choose Master recording',{exact:true}).setInputFiles({name:'network-fixture.txt',mimeType:'text/plain',buffer:Buffer.from('Independent original network UI fixture.')});
  await page.waitForFunction(()=>!document.body.innerText.includes('Hashing…'));await page.getByRole('button',{name:'Encrypt & Continue →',exact:true}).click();
  await page.getByLabel('Track title',{exact:true}).fill('Selected network');await page.getByLabel('Recording artist / claimant',{exact:true}).fill('Network tester');await page.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).fill('Network tester');await page.getByRole('button',{name:'Continue →',exact:true}).click();
  const network=page.getByRole('combobox',{name:'Active Dev Control network'}),address=page.getByLabel('Sepolia factory address',{exact:true});
  assert.equal(await network.inputValue(),'sepolia');assert.equal(await network.isDisabled(),true);assert.equal(await address.inputValue(),factory);assert.equal(await address.evaluate(el=>el.readOnly),true);
  await page.evaluate(()=>window.walletChainChanged('0x539'));assert.equal(await network.inputValue(),'sepolia','Wallet events must not silently change application networks');assert.equal(await page.getByLabel('Local RPC URL',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Fixture Wallet'}).click();const walletFactory=page.getByLabel('YellowBrickFactory address',{exact:true});assert.equal(await walletFactory.inputValue(),factory);assert.equal(await walletFactory.evaluate(el=>el.readOnly),true);
  await page.getByRole('button',{name:'Find my on-chain Bricks',exact:true}).click();await page.getByRole('alert').filter({hasText:'Switch the browser wallet to the active Dev Control network'}).waitFor();
  await page.getByRole('button',{name:'Fixture Registry'}).click();await page.getByText(/Sepolia.*11155111/).first().waitFor();assert.equal(await page.getByText(/Ganache · chain 1337/).count(),0);
  assert.equal(await page.evaluate(()=>window.walletWrites),0);assert.deepEqual(errors,[]);
  const out=path.join(ROOT,'.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'active-sepolia-registry.png'),fullPage:true});
  console.log('ACTIVE NETWORK UI PASS: actual Mint Studio/My Bricks/Registry, stale browser defaults and Ganache wallet events cannot override selected Sepolia identity; wallet mismatch is refused without signing. RPC payload is an explicit fixture.');
 }finally{if(browser)await browser.close();if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await Promise.race([stopped,wait(5000)]);}fs.rmSync(html,{force:true});fs.rmSync(jsx,{force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
