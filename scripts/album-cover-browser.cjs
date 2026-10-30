'use strict';
/** Real ID3 worker + Mint Studio UI; read-only fixture wallet and prior NFT. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const taggedMp3=require('./fixtures/tagged-mp3.cjs');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const root=path.resolve(__dirname,'..'),stem='album-cover-browser-'+process.pid;
const html=path.join(root,'web',stem+'.html'),jsx=path.join(root,'web','src',stem+'.jsx');
const addr=n=>'0x'+n.repeat(40),hash=n=>'0x'+n.repeat(64);
const wallet=addr('1'),factory=addr('2'),genesis=hash('3'),brick=addr('4'),ipId=hash('5'),collection=addr('6'),imageURI='ipfs://bafy'+'a'.repeat(55);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIUlEQVR4nGP8f9kpxjeSgYGBgYGBMVphNgMMMDEgARQOAMDRBDMbPbpyAAAAAElFTkSuQmCC','base64');
async function main(){
 if(!process.env.CI)throw Error('This mock-wallet browser harness is CI only.');
 fs.writeFileSync(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/src/'+stem+'.jsx"></script></body></html>',{flag:'wx'});
 fs.writeFileSync(jsx,`
import React from 'react';import {createRoot} from 'react-dom/client';
import MintStudioDemo from './MintStudioDemo.jsx';
import {parseAbi,decodeFunctionData,encodeFunctionResult} from 'viem';
const abi=parseAbi(['function ipId() view returns (bytes32)','function receiptToken() view returns (address)','function factory() view returns (address)','function ownerOf(uint256) view returns (address)','function brickForToken(uint256) view returns (address)','function tokenURI(uint256) view returns (string)']);
window.writes=0;window.ethereum={request:async({method,params=[]})=>{
 if(method==='eth_getCode')return '0x'; // No registry in this artwork-only fixture.
 if(method==='eth_chainId')return '0xaa36a7';if(method==='eth_accounts')return ['${wallet}'];
 if(method==='eth_getBlockByNumber')return {number:params[0]==='0x0'?'0x0':'0x1',hash:'${genesis}',parentHash:'${genesis}',timestamp:'0x1',transactions:[],gasLimit:'0x1c9c380',gasUsed:'0x0',baseFeePerGas:'0x1'};
 if(method==='eth_call'){
  const {functionName}=decodeFunctionData({abi,data:params[0].data});
  const values={ipId:'${ipId}',receiptToken:'${collection}',factory:'${factory}',ownerOf:'${wallet}',brickForToken:'${brick}',tokenURI:'data:application/json;base64,'+btoa(JSON.stringify({name:'Prior track',image:'${imageURI}',attributes:[{trait_type:'Brick Contract',value:'${brick}'},{trait_type:'Registration IP ID',value:'${ipId}'}]}))};
  return encodeFunctionResult({abi,functionName,result:values[functionName]});
 }
 window.writes++;throw Error('Unexpected wallet operation '+method);
}};
createRoot(document.getElementById('root')).render(<React.StrictMode><MintStudioDemo wallet="${wallet}" displayName="Synthetic Artist"/></React.StrictMode>);
`,{flag:'wx'});
 const browser=await chromium.launch({headless:true});let page;const errors=[],writes=[];
 try{
  page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
  await page.addInitScript(({factory})=>localStorage.setItem('road:mint:network:v1',JSON.stringify({version:1,data:{network:'sepolia',factories:{'sepolia:11155111':factory}}})),{factory});
  await page.route('**/api/player-publish/config',r=>r.fulfill({json:{token:'a'.repeat(64)}}));
  await page.route('**/api/player-publish/cover-studio',r=>r.fulfill({json:{uploads:[{album:'Night Road',authorization:{chainId:11155111,factoryAddress:factory,genesisHash:genesis,sources:{audio:{controller:wallet,brickAddress:brick}}}}]}}));
  await page.route('**/api/road-ipfs/nft-cover/*',r=>r.fulfill({contentType:'image/png',body:png}));
  await page.goto('http://127.0.0.1:5173/'+stem+'.html');await page.getByRole('button',{name:'Continue →',exact:true}).click();
  const master=page.getByLabel('Choose Master recording',{exact:true}),preview=page.getByLabel('Choose Audio preview',{exact:true});
  assert.match(await master.getAttribute('accept'),/\.wav/);assert.equal(await preview.getAttribute('accept'),'.mp3,audio/mpeg');
  const wav=path.join(root,'apps/ybr-player/media/golden-hour.wav');await master.setInputFiles(wav);await preview.setInputFiles(wav);
  await page.getByText('Audio Preview accepts MP3 files only. Upload WAV recordings as the Master recording.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Encrypt & Continue →',exact:true}).click();assert.equal(await page.getByLabel('Track title',{exact:true}).count(),0);
  const attach=album=>preview.setInputFiles({name:'second-track.mp3',mimeType:'audio/mpeg',buffer:taggedMp3({title:'Second track',album})});
  await attach(' night  ROAD ');
  await page.waitForFunction(()=>!document.body.innerText.includes('Hashing…'));
  await page.getByRole('button',{name:'Encrypt & Continue →',exact:true}).click();await page.getByLabel('Track title',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Track title',{exact:true}).inputValue(),'Second track');
  await page.getByRole('button',{name:'Continue →',exact:true}).click();
  const region=page.getByRole('region',{name:'Previous album artwork'});await region.getByRole('button',{name:'Use previous album artwork',exact:true}).click();
  await region.getByRole('button',{name:'Previous album artwork selected',exact:true}).waitFor();
  assert.equal(await page.getByText('NFT artwork is NOT selected.',{exact:false}).count(),0);
  await region.getByRole('button',{name:'Clear album artwork selection',exact:true}).click();
  await region.getByRole('button',{name:'Use previous album artwork',exact:true}).click();await region.getByRole('button',{name:'Previous album artwork selected',exact:true}).waitFor();
  const out=path.join(root,'.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'album-cover-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'album-cover-mobile.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
  await page.getByRole('button',{name:'← Back',exact:true}).click();await page.getByRole('button',{name:'← Back',exact:true}).click();
  await attach('Different album');await page.waitForFunction(()=>!document.body.innerText.includes('Hashing…'));
  await page.getByRole('button',{name:'Encrypt & Continue →',exact:true}).click();await page.getByLabel('Track title',{exact:true}).waitFor();await page.getByRole('button',{name:'Continue →',exact:true}).click();
  await region.getByText('No earlier NFT artwork found for this album on the selected wallet and network.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Previous album artwork selected',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.writes),0);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('PASS: WAV master, MP3-only preview, ID3 album match against prior uploads, verified image selection/clearing, replacement invalidation, mobile layout, no publication or wallet writes.');
 }catch(e){if(page)await page.screenshot({path:path.join(root,'.road-local/player-browser-results/album-cover-failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally{await browser.close();fs.rmSync(html,{force:true});fs.rmSync(jsx,{force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
