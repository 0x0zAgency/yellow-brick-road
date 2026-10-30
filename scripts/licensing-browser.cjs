'use strict';
/** UI regression with a read-only RPC fixture. Monetary behavior is tested on a real EVM separately. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const ROOT=path.resolve(__dirname,'..'),stem='licensing-view-'+process.pid,html=path.join(ROOT,'web',stem+'.html'),jsx=path.join(ROOT,'web/src',stem+'.jsx');
async function main(){
 if(!process.env.CI)throw Error('Run the licensing view fixture only in disposable CI.');
 fs.writeFileSync(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/src/'+stem+'.jsx"></script></body></html>',{flag:'wx'});
 fs.writeFileSync(jsx,`
import React from 'react';import {createRoot} from 'react-dom/client';
import './styles.css';import LicensingWorkspace from './licensing/LicensingWorkspace.jsx';
import {licensingAbi,makeEnvelope,offerId,zeroAddress,zeroHash,textHash} from './licensing/protocol.js';
import {decodeFunctionData,encodeFunctionResult} from 'viem';
const addr=n=>'0x'+n.toString(16).padStart(40,'0'),hash=n=>'0x'+n.toString(16).padStart(64,'0');
const owner=addr(1),buyer=addr(2),brick=addr(3),factory=addr(4),deployment=addr(5);
const block={number:'0x9',hash:hash(9),parentHash:hash(8),nonce:'0x0000000000000000',sha3Uncles:hash(0),logsBloom:'0x'+'00'.repeat(256),transactionsRoot:hash(1),stateRoot:hash(2),receiptsRoot:hash(3),miner:owner,difficulty:'0x0',totalDifficulty:'0x0',extraData:'0x',size:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',timestamp:'0x1',transactions:[],uncles:[]};
let account=buyer,handlers={};window.licTransactions=0;
const rpc=async({method,params=[]})=>{if(['eth_accounts','eth_requestAccounts'].includes(method))return [account];if(method==='eth_chainId')return '0x539';if(method==='eth_getBlockByNumber')return {...block,hash:params[0]==='0x0'?hash(1):hash(9)};if(method==='eth_getBalance')return '0x3e8';if(method==='personal_sign')return '0x1234';if(method==='eth_call'){const {functionName}=decodeFunctionData({abi:licensingAbi,data:params[0].data});return encodeFunctionResult({abi:licensingAbi,functionName,result:functionName==='totalLicenseClaimable'?1000n:account===owner?800n:0n});}window.licTransactions++;throw Error('Unexpected wallet write '+method);};
window.ethereum={request:rpc,on:(event,fn)=>{handlers[event]=fn;},removeListener:()=>{}};
window.licOwner=()=>{account=owner;handlers.accountsChanged?.([owner]);};
const profile={chainId:1337,factoryAddress:factory,genesisHash:hash(1),walletAddress:deployment,csrf:'fixture'};
const policy={enabled:false,asset:zeroAddress,termsHash:zeroHash,projectHash:zeroHash,minUnitPrice:'0',maxUnits:'0',maxDuration:'0',revocable:false,epoch:'0',version:'0'};
const state={brick,controller:owner,epoch:'0',salt:hash(2),payoutVersion:'1',shares:[{recipient:owner,bps:8000},{recipient:addr(6),bps:2000}],policies:{1:policy,2:policy},policyTerms:{},email:'licensing@example.com'};
const envelope=makeEnvelope({profile,state,licensee:buyer,project:{title:'Film publishing project',description:'A licensed music placement'},terms:'One placement with attribution. <script>window.injected=true</script>',unitPrice:'10000000000000000',units:10,expiresAt:Math.floor(Date.now()/1000)+86400,deadline:Math.floor(Date.now()/1000)+3600,scope:2,nonce:hash(8)});
const record={id:offerId(envelope),envelope,controllerSignature:'0x1234',status:'approved',ready:true,grant:{units:'10',consumed:'0'}};
const original=window.fetch.bind(window);window.fetch=async(url,options={})=>{
 if(String(url).endsWith('/road/rpc')){const body=JSON.parse(options.body);return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result:await rpc(body)}),{headers:{'Content-Type':'application/json'}});}
 if(String(url).startsWith('/api/licensing/')){const route=String(url).slice('/api/licensing'.length).split('?')[0];const data=({'/config':profile,'/state':state,'/offers':{offers:[record]},'/challenge':{nonce:'test',message:'Sign in to test inbox'},'/session':{token:'fixture',address:account},'/asset':{address:zeroAddress,symbol:'ETH',decimals:18}})[route];if(!data)throw Error('Unexpected API '+route);return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});}
 return original(url,options);
};
createRoot(document.getElementById('root')).render(<main style={{maxWidth:1150,margin:'auto',padding:20}}><LicensingWorkspace initialBrick={brick}/></main>);
`,{flag:'wx'});
 let browser;try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.YBR_LICENSING_TEST_ORIGIN||'http://127.0.0.1:5173')+'/'+stem+'.html');await page.getByRole('button',{name:'Connect licensing wallet'}).click();await page.getByRole('button',{name:'Sign in to offer inbox'}).click();
  await page.getByRole('heading',{name:'Film publishing project'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Approve terms',exact:true}).count(),0);
  assert.match(await page.locator('.lic-offer').innerText(),/0\.01 ETH × 10 licensed units = 0\.1 ETH prepaid/);
  await page.getByRole('button',{name:'Review & accept license'}).click();await page.getByRole('dialog',{name:'Review license payment'}).waitFor();
  assert.match(await page.getByRole('dialog').innerText(),/0\.1 ETH/);assert.match(await page.getByRole('dialog').innerText(),/Funds will remain/);assert.equal(await page.evaluate(()=>window.injected),undefined);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Acceptance & collaborators',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Save future payout shares'}).isDisabled(),true);
  await page.evaluate(()=>window.licOwner());await page.getByRole('button',{name:'Connect licensing wallet'}).click();await page.getByRole('button',{name:'Sign in to offer inbox'}).click();
  await page.getByRole('button',{name:'Creator inbox',exact:true}).click();await page.getByRole('button',{name:'Approve terms',exact:true}).waitFor();
  await page.getByRole('button',{name:'Counter-offer',exact:true}).click();await page.getByRole('heading',{name:'Counter-offer',exact:true}).waitFor();assert.equal(await page.getByLabel('Project title',{exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Acceptance & collaborators',exact:true}).click();assert.equal(await page.getByLabel('Accept offers that meet this rule').isChecked(),false);assert.equal(await page.getByRole('button',{name:'Save future payout shares'}).isDisabled(),false);
  await page.getByRole('button',{name:'IP funds',exact:true}).click();assert.match(await page.locator('.lic-balances').innerText(),/Your available share/);assert.equal(await page.getByRole('button',{name:'Withdraw my share'}).isDisabled(),false);
  const dir=path.join(ROOT,'.road-local/player-browser-results');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'licensing-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(dir,'licensing-mobile.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile page must not overflow');assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.licTransactions),0);
  console.log('Licensing UI: role controls, counter-offer, payment review, disabled defaults and mobile layout passed.');
 }finally{await browser?.close();fs.rmSync(html,{force:true});fs.rmSync(jsx,{force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
