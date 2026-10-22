'use strict';
/** Actual Mint Studio UI; mock wallet for read-only setup, never a transaction. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const root=path.resolve(__dirname,'..'),stem='mint-setup-browser-'+process.pid;
const html=path.join(root,'web',stem+'.html'),jsx=path.join(root,'web','src',stem+'.jsx');
const current='0x'+'1'.repeat(40),old='0x'+'2'.repeat(40),next='0x'+'3'.repeat(40),manual='0x'+'4'.repeat(40),sepolia='0x'+'5'.repeat(40);
async function ready(){
 for(let attempt=0;attempt<60;attempt++){
  try{if((await fetch('http://127.0.0.1:5173')).ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 throw Error('Mint Studio did not become ready for setup testing.');
}
async function main(){
 if(!process.env.CI)throw Error('This read-only mock-wallet browser harness is CI only.');
 await ready();
 fs.writeFileSync(html,'<!doctype html><html><body><div id="setup-root"></div><script type="module" src="/src/'+stem+'.jsx"></script></body></html>',{flag:'wx'});
 fs.writeFileSync(jsx,`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import MintStudioDemo from './MintStudioDemo.jsx';
window.setupWalletWrites=0;
window.ethereum={request:async({method})=>{
 if(method==='eth_chainId')return '0x539';
 if(method==='eth_accounts')return ['0x'+'a'.repeat(40)];
 window.setupWalletWrites++;throw Error('Setup must not request signatures or transactions: '+method);
}};
function Test(){const [factory,setFactory]=useState('${current}');window.changeStartupFactory=setFactory;
 return <MintStudioDemo wallet={'0x'+'a'.repeat(40)} displayName="Setup test creator" ganacheFactory={factory}/>;}
createRoot(document.getElementById('setup-root')).render(<Test/>);
`,{flag:'wx'});
 const browser=await chromium.launch({headless:true});
 let page;const errors=[];
 try{
  page=await browser.newPage({viewport:{width:1440,height:1080}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({old,sepolia})=>{
   localStorage.setItem('road:mint:network:v1',JSON.stringify({version:1,data:{factories:{'ganache:1337:http://127.0.0.1:8545':old,'sepolia:11155111':sepolia}}}));
  },{old,sepolia});
  await page.goto('http://127.0.0.1:5173/'+stem+'.html');
  await page.getByRole('button',{name:'Continue →',exact:true}).click();
  const editor=page.getByRole('region',{name:'Pre-mint Player permissions and content lock'});
  assert.equal(await editor.count(),0,'Files contains no permission editor');
  for(const [label,file] of [['Choose Master recording','golden-hour.wav'],['Choose Audio preview','after-the-rain.wav']])
   await page.getByLabel(label,{exact:true}).setInputFiles(path.join(root,'apps/ybr-player/media',file));
  await page.waitForFunction(()=>!document.body.innerText.includes('Hashing…'));
  await page.getByRole('button',{name:'Encrypt & Continue →',exact:true}).click();
  await editor.waitFor();
  for(const name of ['Display cover artwork','Display lyrics'])assert.equal(await editor.getByRole('checkbox',{name,exact:false}).isDisabled(),true,'Unattached files have no grant');
  const delivery=editor.getByRole('checkbox',{name:'Deliver approved copies to YBR Player automatically after mint',exact:false});
  assert.equal(await delivery.isChecked(),false);
  const preview=editor.getByRole('checkbox',{name:'Play Audio Preview',exact:false});
  assert.equal(await preview.isChecked(),true);await preview.uncheck();
  assert.match(await editor.textContent(),/wallet-signed mint will record/);
  assert.equal(await delivery.isDisabled(),true);
  await page.getByLabel('Track title',{exact:true}).fill('Step 3 policy test');
  await page.getByLabel('Recording artist / claimant',{exact:true}).fill('Creator');
  // Preserve the existing collaborator-approval guard, then use a self-authored fixture.
  await page.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).fill('Writer');
  await page.getByRole('button',{name:'Continue →',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Another songwriter is credited.'}).waitFor();
  await page.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).fill('Creator');
  await page.getByRole('button',{name:'Continue →',exact:true}).click();
  const summary=page.getByRole('region',{name:'Player permissions summary'});await summary.waitFor();
  assert.equal(await summary.locator('input').count(),0);
  assert.equal(await summary.getByText('Not allowed',{exact:true}).count(),1);
  assert.equal(await summary.getByText('No file attached',{exact:true}).count(),2);
  const automatic=page.getByRole('checkbox',{name:'Use running Ganache factory (automatic)',exact:true});
  const factory=page.getByLabel('Ganache factory address',{exact:true});
  assert.equal(await automatic.isChecked(),true);assert.equal(await factory.inputValue(),current);
  assert.equal(await factory.evaluate(el=>el.readOnly),true);
  const settings=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('road:mint:network:v1')).data);
  assert.equal((await settings()).factories['ganache:1337:http://127.0.0.1:8545'],old,'Prior manual address is retained, not overwritten');
  // A changed effective factory invalidates an open confirmation before any signing.
  await page.getByRole('button',{name:'Review wallet mint →',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.evaluate(value=>window.changeStartupFactory(value),next);
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await factory.inputValue(),next);
  assert.equal(await page.evaluate(()=>window.setupWalletWrites),0);
  await automatic.uncheck();assert.equal(await factory.inputValue(),old);await factory.fill(manual);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('road:mint:network:v1')).data.useStartupFactory===false);
  await page.evaluate(value=>window.changeStartupFactory(value),current);
  assert.equal(await factory.inputValue(),manual,'Manual mode survives a changed startup factory');
  await automatic.check();assert.equal(await factory.inputValue(),current);
  await page.getByLabel('Local RPC URL',{exact:true}).fill('http://127.0.0.1:9545');
  assert.equal(await automatic.count(),0,'A different endpoint never inherits the launcher factory');
  assert.equal(await factory.inputValue(),'');await factory.fill(manual);
  await page.getByLabel('Local RPC URL',{exact:true}).fill('http://127.0.0.1:8545');assert.equal(await factory.inputValue(),current);
  await page.getByRole('combobox',{name:/^Mint network/}).selectOption('sepolia');
  assert.equal(await page.getByLabel('Sepolia factory address',{exact:true}).inputValue(),sepolia);
  assert.equal(await automatic.count(),0);
  await page.getByRole('combobox',{name:/^Mint network/}).selectOption('ganache');assert.equal(await factory.inputValue(),current);
  await page.getByRole('button',{name:'Edit permissions in Step 3',exact:true}).click();
  await editor.waitFor();assert.equal(await preview.isChecked(),false,'Step 3 permission choices survive encryption and final review');
  await preview.check();await delivery.check();
  await page.getByLabel('Album / release',{exact:true}).fill('Changed after consent');
  assert.equal(await delivery.isChecked(),false,'Changing shared metadata invalidates delivery consent');
  await delivery.check();
  await page.getByRole('button',{name:'Continue →',exact:true}).click();
  await summary.waitFor();assert.equal(await summary.getByText('Allowed',{exact:true}).count(),1);
  await summary.getByText('Approved for after mint',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.setupWalletWrites),0);
  assert.deepEqual(errors,[]);
  const out=path.join(root,'.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'step-three-permissions-auto-factory.png'),fullPage:true});
  console.log('MINT SETUP PASS: Step 3 file-scoped permissions, final summary/back navigation, automatic factory over stale settings, profile change cancels confirmation, manual override, custom RPC and Sepolia isolation. Read-only mock wallet.');
 }catch(error){
  const out=path.join(root,'.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});
  if(page){
   await page.screenshot({path:path.join(out,'mint-setup-failure.png'),fullPage:true}).catch(()=>{});
   console.error('Setup validation messages:',await page.locator('.ms-error').allTextContents().catch(()=>[]));
  }
  console.error('Setup browser errors:',errors);throw error;
 }finally{await browser.close();fs.rmSync(html,{force:true});fs.rmSync(jsx,{force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
