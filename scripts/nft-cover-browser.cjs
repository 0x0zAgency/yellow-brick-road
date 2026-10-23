'use strict';
/** Chromium component coverage with an explicit mock wallet; chain/Kubo smoke is separate. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('/tmp/ybr-browser/node_modules/playwright');
const root=path.resolve(__dirname,'..'),stem='nft-cover-browser-'+process.pid;
const html=path.join(root,'web',stem+'.html'),jsx=path.join(root,'web','src',stem+'.jsx');
const fixture=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAALnRFWHRwcml2YXRlAFBSSVZBVEUtU09VUkNFLU1FVEFEQVRBLURPLU5PVC1QVUJMSVNIKfyEdQAAACFJREFUeJxj/H/ZKcY3koGBgYGBgTFaYTYDDDAxIAEUDgDA0QQzGz26cgAAAABJRU5ErkJggg==','base64');
async function main(){
 if(!process.env.CI)throw Error('This mock-wallet browser harness is CI only.');
 const {validateNftCoverPng}=await import('../web/src/nft-cover-format.js');
 fs.writeFileSync(html,'<!doctype html><html><head><title>NFT cover test</title></head><body><div id="cover-root"></div><script type="module" src="/src/'+stem+'.jsx"></script></body></html>',{flag:'wx'});
 fs.writeFileSync(jsx,`
import React,{useState} from 'react';
import NftCoverReview from './NftCoverReview.jsx';
import {encryptDemoBatch} from './demo-vault.js';
import {createRoot} from 'react-dom/client';
import {decodeFunctionData,encodeFunctionResult,parseAbi} from 'viem';
import NftCoverPublisher from './NftCoverPublisher.jsx';
import {coverAbi} from './nft-cover-chain.js';
const account='0x'+'1'.repeat(40),collection='0x'+'2'.repeat(40),factory='0x'+'3'.repeat(40),brick='0x'+'4'.repeat(40);
const abi=[...coverAbi,...parseAbi(['function receiptToken() view returns (address)'])];
window.nftWalletSends=0;window.nftLegacy=false;
window.ethereum={request:async({method,params=[]})=>{
 if(method==='eth_chainId')return '0x539';
 if(method==='eth_accounts'||method==='eth_requestAccounts')return [account];
 if(method==='eth_estimateGas')return '0x186a0';
 if(method==='eth_call'){
  const {functionName}=decodeFunctionData({abi,data:params[0].data});
  if(functionName==='artworkVersion'&&window.nftLegacy)throw Error('Legacy collection');
  if(functionName==='setCovers')return '0x';
  const values={artworkVersion:1n,factory,receiptToken:collection,ownerOf:account,brickForToken:brick};
  if(!(functionName in values))throw Error('Unexpected contract function '+functionName);
  return encodeFunctionResult({abi,functionName,result:values[functionName]});
 }
 if(method==='eth_sendTransaction'||method==='wallet_sendTransaction'){window.nftWalletSends++;throw Object.assign(Error('User rejected the cover transaction.'),{code:4001});}
 throw Error('Unexpected wallet method '+method);
}};
const root=createRoot(document.getElementById('cover-root'));
window.renderCoverTest=mode=>{
 window.nftLegacy=mode==='legacy';
 const mint={simulated:mode==='simulated',status:'confirmed',chainId:1337,factoryAddress:factory,receipts:[{status:'verified',chainId:1337,nftContractAddress:collection,contractAddress:brick,tokenId:'17'}]};
 if(mode==='verified')mint.nftCover={status:'verified',imageURI:'ipfs://bafy'+'a'.repeat(55),transactionHash:'0x'+'9'.repeat(64)};
 if(mode==='pending')mint.nftCover={status:'needs-attention',transactionHash:'0x'+'9'.repeat(64)};
 root.render(<NftCoverPublisher key={mode} mint={mint} wallet={account}/>);
};
window.renderCoverTest('current');
window.renderCoverReviewTest=async()=>{
 const bytes=Uint8Array.from(atob('${fixture.toString('base64')}'),c=>c.charCodeAt(0));
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const vault=await encryptDemoBatch({items:[{id:'artwork',file:new File([bytes],'original.png',{type:'image/png'}),originalSha256:hash}]});
 const packet={bricks:[{metadata:{media:[{role:'artwork',name:'original.png',byteLength:bytes.length,integrity:{digest:'0x'+hash}}]}}]};
 function Review(){const [value,setValue]=useState(null);return <NftCoverReview getPacket={()=>packet} vault={vault} sourceDigest={'0x'+hash} value={value} onChange={next=>{window.reviewedNftConsent=next.consent;setValue(next);}}/>;}
 root.render(<Review/>);
};
`,{flag:'wx'});
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1120,height:1000}});
  let uploads=0;
  await page.route('**/api/road-ipfs/nft-cover',async route=>{
   uploads++;const bytes=route.request().postDataBuffer();validateNftCoverPng(bytes);
   assert.ok(!bytes.includes(Buffer.from('PRIVATE-SOURCE-METADATA-DO-NOT-PUBLISH')));
   assert.notDeepEqual(bytes,fixture);
   assert.equal(route.request().headers()['x-road-public-cover'],'publish-public-nft-cover-v1');
   await route.fulfill({contentType:'application/json',body:JSON.stringify({cid:'bafy'+'a'.repeat(55),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length,mime:'image/png',pinned:true,verified:true})});
  });
  await page.goto('http://127.0.0.1:5173/'+stem+'.html');
  const prepare=page.getByRole('button',{name:'Prepare NFT cover'});
  await prepare.waitFor();assert.equal(await prepare.isDisabled(),true);
  await page.locator('input[type=file]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:fixture});
  await prepare.click();await page.getByAltText('Public NFT display copy to publish').waitFor();
  assert.equal(uploads,0);assert.equal(await page.getByRole('button',{name:'Publish cover to NFTs'}).isDisabled(),true);
  await page.getByRole('checkbox').check();
  const out=path.join(root,'.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'nft-cover-review.png'),fullPage:true});
  await page.getByRole('button',{name:'Publish cover to NFTs'}).click();
  await page.getByRole('alert').filter({hasText:/rejected/i}).waitFor();
  assert.equal(uploads,1);assert.equal(await page.evaluate(()=>window.nftWalletSends),1);
  await page.evaluate(()=>window.renderCoverTest('pending'));
  await page.waitForFunction(()=>document.querySelector('input[type=file]')?.disabled===true);
  assert.equal(await page.getByRole('button',{name:'Prepare NFT cover'}).isDisabled(),true,'An unresolved transaction still blocks duplicate submission');
  await page.evaluate(()=>window.renderCoverTest('verified'));
  await page.waitForFunction(()=>document.querySelector('input[type=file]')?.disabled===false);
  await page.locator('input[type=file]').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:fixture});
  await page.getByRole('button',{name:'Prepare NFT cover'}).click();
  await page.getByAltText('Public NFT display copy to publish').waitFor();
  assert.equal(await page.getByRole('checkbox').isChecked(),false,'A replacement cover requires fresh public consent');
  assert.equal(uploads,1,'Choosing a new cover never uploads it');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Publish cover to NFTs'}).click();
  await page.getByRole('alert').filter({hasText:/rejected/i}).waitFor();
  assert.equal(uploads,2);assert.equal(await page.evaluate(()=>window.nftWalletSends),2);
  await page.evaluate(()=>window.renderCoverTest('legacy'));
  await page.locator('input[type=file]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:fixture});
  await page.getByRole('button',{name:'Prepare NFT cover'}).click();
  await page.getByRole('alert').filter({hasText:/fixed yellow-square/}).waitFor();assert.equal(uploads,2);
  await page.evaluate(()=>window.renderCoverTest('simulated'));
  await page.waitForFunction(()=>!document.querySelector('.nft-cover'));
  await page.evaluate(()=>window.renderCoverReviewTest());
  await page.getByRole('button',{name:'Preview cover for NFTs'}).click();
  await page.getByAltText('NFT cover to apply after minting').waitFor();
  assert.equal(uploads,2,'Review preparation must not publish a public image');
  assert.equal(await page.getByRole('checkbox').isChecked(),false);
  await page.getByRole('checkbox').check();assert.equal(await page.evaluate(()=>window.reviewedNftConsent),true);
  await page.screenshot({path:path.join(out,'nft-cover-premint-review.png'),fullPage:true});
  console.log('NFT COVER BROWSER PASS: decoded/rasterized PNG, metadata stripped, explicit consent, wallet cancellation, legacy refusal before upload, simulation exclusion. Mock wallet; not MetaMask.');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{for(const file of [html,jsx])fs.rmSync(file,{force:true});});
