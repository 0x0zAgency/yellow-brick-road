'use strict';
/** Actual React views with deterministic read-only RPC fixtures. Real-chain smoke is separate. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const ROOT=path.resolve(__dirname,'..'),stem='compact-bricks-'+process.pid;
const html=path.join(ROOT,'web',stem+'.html'),jsx=path.join(ROOT,'web/src',stem+'.jsx');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIUlEQVR4nGP8f9kpxjeSgYGBgYGBMVphNgMMMDEgARQOAMDRBDMbPbpyAAAAAElFTkSuQmCC','base64');
async function main(){
 if(!process.env.CI)throw Error('Run view-fixture regression only in disposable CI.');
 for(let i=0;i<60;i++){if(await fetch('http://127.0.0.1:5173').then(r=>r.ok).catch(()=>false))break;await new Promise(r=>setTimeout(r,250));}
 fs.writeFileSync(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Compact creator views</title></head><body><div id="compact-root"></div><script type="module" src="/src/'+stem+'.jsx"></script></body></html>',{flag:'wx'});
 fs.writeFileSync(jsx,`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';import './mint-studio.css';import './mint-demo.css';
import MintResults from './MintResults.jsx';
import WalletBricks from './WalletBricks.jsx';
import LiveRegistry from './LiveRegistry.jsx';
import {presentationAbi} from './brick-presentation.js';
import {factoryAbi} from './chain-mint.js';
import {BRICK_READ_ABI} from './brick-viewer-model.js';
import {buildingFromPacket,saveBuildingRecord} from './release-buildings.js';
import {BUILDING_EVENT} from './ReleaseBuildingCard.jsx';
import {decodeFunctionData,encodeFunctionResult,encodeEventTopics,encodeAbiParameters,sha256,stringToHex} from 'viem';
const address=n=>'0x'+n.toString(16).padStart(40,'0'),hash=n=>'0x'+n.toString(16).padStart(64,'0');
const owner=address(1),factory=address(2),collection=address(3),implementation=address(4),headHash=hash(500);
const cid='bafy'+'a'.repeat(55),image='ipfs://'+cid;
const records=Array.from({length:13},(_,i)=>({address:address(100+i),originator:owner,controller:owner,ipId:hash(1000+i),contentHash:hash(2000+i),metadataDigest:hash(3000+i),metadataVersion:'1',metadataURI:'ipfs://bafy'+'b'.repeat(55),nftContractAddress:collection,tokenId:String(1000+i),transactionHash:hash(4000+i),blockNumber:'9',creatorIsController:true}));
const abi=[...presentationAbi,...factoryAbi,...BRICK_READ_ABI];
const block={number:'0x9',hash:headHash,parentHash:hash(499),nonce:'0x0000000000000000',sha3Uncles:hash(0),logsBloom:'0x'+'00'.repeat(256),transactionsRoot:hash(1),stateRoot:hash(2),receiptsRoot:hash(3),miner:owner,difficulty:'0x0',totalDifficulty:'0x0',extraData:'0x',size:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',timestamp:'0x1',transactions:[],uncles:[]};
window.uiWalletWrites=0;
window.uiRpc=async({method,params=[]})=>{
 if(method==='eth_chainId')return '0x539';
 if(method==='eth_accounts')return [owner];
 if(method==='eth_blockNumber')return '0x9';
 if(method==='eth_getCode')return '0x6000';
 if(method==='eth_getBlockByNumber')return block;
 if(method==='eth_getLogs')return records.map((r,i)=>({address:factory,blockNumber:'0x9',blockHash:headHash,transactionHash:r.transactionHash,transactionIndex:'0x0',logIndex:'0x'+i.toString(16),removed:false,topics:encodeEventTopics({abi:factoryAbi,eventName:'BrickDeployed',args:{ipId:r.ipId,brick:r.address,originator:owner}}),data:encodeAbiParameters([{type:'bytes32'}],[r.contentHash])}));
 if(method==='eth_call'){
  const {functionName,args=[]}=decodeFunctionData({abi,data:params[0].data});
  const r=records.find(r=>r.address.toLowerCase()===params[0].to.toLowerCase())||records.find(r=>BigInt(r.tokenId)===args[0])||records[0];
  const uri='data:application/json;base64,'+btoa(JSON.stringify({name:'Yellow Brick Registration',image,attributes:[{trait_type:'Brick Contract',value:r.address},{trait_type:'Registration IP ID',value:r.ipId}]}));
  const values={implementation,receiptToken:collection,factory,brickForToken:r.address,ownerOf:owner,tokenURI:uri,isBrick:true,ipId:r.ipId,originator:owner,controller:owner,contentHash:r.contentHash,metadataDigest:r.metadataDigest,metadataVersion:1n,metadataURI:r.metadataURI};
  if(!(functionName in values))throw Error('Read not provided by fixture: '+functionName);
  return encodeFunctionResult({abi,functionName,result:values[functionName]});
 }
 window.uiWalletWrites++;throw Error('Unexpected or non-read-only wallet method: '+method);
};
window.ethereum={request:window.uiRpc,on:()=>{},removeListener:()=>{}};
localStorage.setItem('road:factory:1337',factory);
const registry={format:'ybr-chain-registry/1',network:{ready:true,chainId:1337,factoryAddress:factory,rpcUrl:'http://127.0.0.1:8545'},head:{number:'9',hash:headHash},fromBlock:'0',matchingEvents:13,limited:false,limitReached:false,bricks:records.map((r,i)=>({id:r.ipId,type:'RegisteredBrick',source:'road-registry',title:'Registered Brick '+String(i+1).padStart(2,'0'),creator:owner,description:'Private registered work.',streamAllowed:false,registration:{...r,chainId:1337,factoryAddress:factory,brickAddress:r.address}}))};
window.uiRegistry=registry;
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.uiCopied=value;}}});
const roles=['Sound recording','Composition','Cover artwork'],parts=['master','composition','artwork'];
const packet={createdAt:'2026-10-23T12:00:00.000Z',account:{address:owner},storage:{uploaded:false},bricks:records.slice(0,3).map((r,i)=>({localId:parts[i],role:roles[i],metadata:{relationships:i===0?[{type:'cover-art',target:'artwork'},{type:'embodies-composition',target:'composition'}]:[],title:i===0?'Midnight Transit':i===1?'Midnight Transit / composition':'Midnight Transit / cover',media:[]}}))};
const receipts=records.slice(0,3).map((r,i)=>({id:r.ipId,sourceId:parts[i],role:roles[i],title:packet.bricks[i].metadata.title,status:'verified',chainId:1337,contractAddress:r.address,nftContractAddress:collection,tokenId:r.tokenId,transactionHash:r.transactionHash,blockNumber:'9',gasUsed:'123456'}));
packet.building={type:'music-release',name:'Midnight Transit',members:parts.map(ref=>({ref,role:ref}))};
for(let i=0;i<receipts.length;i++){receipts[i].metadataJson=JSON.stringify(packet.bricks[i].metadata);receipts[i].metadataDigest=sha256(stringToHex(receipts[i].metadataJson));records[i].metadataDigest=receipts[i].metadataDigest;registry.bricks[i].registration.metadataDigest=receipts[i].metadataDigest;}
const mint={genesisHash:headHash,simulated:false,status:'confirmed',network:'Ganache',chainId:1337,factoryAddress:factory,receipts,nftCover:{status:'verified',imageURI:image}};
window.uiBuildingPacket={...packet,onChainMint:mint};
window.uiRememberBuilding=async()=>{saveBuildingRecord(localStorage,await buildingFromPacket(packet,mint));window.dispatchEvent(new Event(BUILDING_EVENT));};
const bytes=Uint8Array.from(atob('${png.toString('base64')}'),c=>c.charCodeAt(0));
function App(){const [view,setView]=useState('mint'),[partial,setPartial]=useState(false);window.uiShow=setView;window.uiPartial=setPartial;
 return <main style={{maxWidth:1120,margin:'0 auto',padding:'24px',minHeight:'100vh'}}>
  <div className="br-kicker" style={{marginBottom:16}}>YELLOW BRICK ROAD / CREATOR WORKSPACE</div>
  {view==='mint'?<div className="ms-wrap"><MintResults packet={packet} mint={partial?{...mint,status:'incomplete',receipts:[receipts[0],{...receipts[1],status:'pending'}]}:mint} vault={null} preparedCover={{bytes}} delivery={{status:'not-requested'}} onExportPacket={()=>{window.uiExported=true;}} onExportRecovery={()=>{}} onReset={()=>{}} onDownload={()=>{}}/></div>:view==='wallet'?<WalletBricks wallet={owner} onConnect={()=>{}}/>:<LiveRegistry wallet={owner} onMint={()=>{}} onWallet={()=>setView('wallet')}/>}
 </main>;
}
createRoot(document.getElementById('compact-root')).render(<App/>);
`,{flag:'wx'});
 const browser=await chromium.launch({headless:true});let page;let offline=false;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1050}});page=await context.newPage();const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await page.route('**/api/road-ipfs/nft-cover/*',route=>route.fulfill({contentType:'image/png',body:png}));
  await page.route('http://127.0.0.1:8545/**',async route=>{
   const payload=route.request().postDataJSON();
   const one=async item=>({jsonrpc:'2.0',id:item.id,result:await page.evaluate(item=>window.uiRpc(item),item)});
   const result=Array.isArray(payload)?await Promise.all(payload.map(one)):await one(payload);
   await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(result)});
  });
  await page.route('**/road/api/registry',async route=>route.fulfill({status:offline?503:200,contentType:'application/json',body:JSON.stringify(offline?{error:'Fixture node offline'}:await page.evaluate(()=>window.uiRegistry))}));
  await page.goto('http://127.0.0.1:5173/'+stem+'.html');
  await page.getByRole('button',{name:'Customize NFT appearance',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.br-hero img')?.naturalWidth>0);
  assert.equal(await page.locator('.br-grid--receipts .br-record').count(),3);
  assert.equal(await page.locator('.br-grid--receipts details[open]').count(),0);
  assert.equal(await page.locator('.br-release-rollup').getAttribute('open'),null,'The whole Building starts rolled up');
  const position=await page.locator('#mint-nft-customization').boundingBox(),first=await page.locator('.br-release-rollup').boundingBox();
  assert.ok(position.y<first.y&&position.y<650,'NFT controls precede receipt details without a long scroll');
  await page.locator('.br-release-rollup > summary').click();
  await page.getByRole('button',{name:'Copy all mint details for Sound recording'}).click();
  assert.match(await page.evaluate(()=>window.uiCopied),/NFT contract address \(wallet import\): 0x0000000000000000000000000000000000000003/);
  await page.locator('.br-grid--receipts details > summary').first().click();
  await page.getByRole('button',{name:'Copy NFT token ID',exact:true}).first().click();assert.equal(await page.evaluate(()=>window.uiCopied),'1000');
  await page.locator('.br-grid--receipts details > summary').first().click();
  const out=path.join(ROOT,'.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});
  await page.locator('.br-release-rollup > summary').click();
  await page.screenshot({path:path.join(out,'mint-results-compact.png'),fullPage:true});
  await page.getByRole('button',{name:'Customize NFT appearance',exact:true}).click();
  assert.equal(await page.getByRole('region',{name:'NFT cover artwork'}).isVisible(),true);
  await page.locator('#mint-nft-customization > summary').click();
  await page.evaluate(()=>window.uiPartial(true));
  await page.getByRole('alert').filter({hasText:'Incomplete registration'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Customize NFT appearance',exact:true}).count(),0);
  assert.equal(await page.getByText('pending',{exact:true}).isVisible(),true);
  await page.evaluate(()=>{window.uiPartial(false);});
  // Clear only the disposable fixture index before standalone pagination tests.
  await page.waitForTimeout(100);
  await page.evaluate(()=>{localStorage.removeItem('road:release-buildings:v1');window.dispatchEvent(new Event('ybr:release-buildings-changed'));});
  for(const view of ['wallet','registry']){
   await page.evaluate(view=>window.uiShow(view),view);
   if(view==='wallet')await page.getByRole('button',{name:'Find my on-chain Bricks'}).click();
   await page.waitForFunction(()=>document.querySelectorAll('.br-grid > .br-record').length===12);
   await page.waitForFunction(()=>document.querySelector('.br-record img')?.naturalWidth>0);
   assert.equal(await page.locator('.br-grid > .br-record details[open]').count(),0);
   if(view==='wallet'){
    await page.getByRole('button',{name:'Customize NFT',exact:false}).first().click();
    assert.equal(await page.getByRole('region',{name:'NFT cover artwork'}).first().isVisible(),true);
    await page.locator('.wb-nft-cover > summary').first().click();
   }
   await page.getByRole('button',{name:'Next page',exact:true}).click();
   await page.waitForFunction(()=>document.querySelectorAll('.br-grid > .br-record').length===1);
   await page.getByRole('button',{name:'Previous page',exact:true}).click();
   await page.waitForFunction(()=>document.querySelectorAll('.br-grid > .br-record').length===12);
   await page.screenshot({path:path.join(out,view+'-compact.png'),fullPage:true});
   const detail=view==='wallet'?'On-chain details & wallet import':'On-chain details & commitments';
   await page.getByText(detail,{exact:true}).first().click();
   assert.equal(await page.locator('.br-record .road-copy-value').first().isVisible(),true);
   await page.getByText(detail,{exact:true}).first().click();
   if(view==='registry'){
    await page.getByLabel('Search on-chain registrations').fill('Registered Brick 13');
    await page.waitForFunction(()=>document.querySelectorAll('.br-grid > .br-record').length===1);
    await page.getByLabel('Search on-chain registrations').fill('');
    offline=true;await page.getByRole('button',{name:'Refresh registry',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'unavailable, not empty'}).waitFor();assert.equal(await page.locator('.br-grid > .br-record').count(),0);
    offline=false;await page.getByRole('button',{name:'Refresh registry',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.br-grid > .br-record').length===12);
   }
  }
  // Actual local packet import, no network publication or signature.
  const packetBytes=await page.evaluate(()=>JSON.stringify(window.uiBuildingPacket));
  await page.getByLabel('Import release grouping packet',{exact:true}).setInputFiles({name:'test-release.json',mimeType:'application/json',buffer:Buffer.from(packetBytes)});
  await page.waitForFunction(()=>document.querySelectorAll('.br-grid > .br-building').length===1);
  assert.equal(await page.locator('.br-grid > .br-record').count(),10,'Three member Bricks become one Building plus ten standalone entries');
  assert.equal(await page.locator('.br-building-parts[open]').count(),0);
  await page.getByText('Explore release parts',{exact:true}).click();
  assert.equal(await page.locator('.br-building-children .br-record').count(),3);
  await page.getByLabel('Search on-chain registrations').fill('Registered Brick 02');
  await page.waitForFunction(()=>document.querySelectorAll('.br-grid > .br-record').length===0);
  assert.equal(await page.locator('.br-building-children .br-record').count(),3,'A child match keeps its whole parent');
  await page.getByLabel('Search on-chain registrations').fill('');
  await page.getByText('Explore release parts',{exact:true}).click();
  await page.screenshot({path:path.join(out,'registry-buildings.png'),fullPage:true});
  await page.evaluate(()=>window.uiShow('wallet'));
  await page.getByRole('button',{name:'Find my on-chain Bricks'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.br-grid > .br-building').length===1);
  assert.equal(await page.locator('.br-grid > .br-record').count(),10);
  await page.getByText('Explore release parts',{exact:true}).click();
  assert.equal(await page.locator('.br-building-children .br-record').count(),3);
  await page.screenshot({path:path.join(out,'wallet-building-expanded.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  for(const view of ['mint','wallet','registry']){
   await page.evaluate(view=>window.uiShow(view),view);
   if(view==='wallet')await page.getByRole('button',{name:'Find my on-chain Bricks'}).click();
   await (view==='mint'?page.locator('.br-release-rollup'):page.locator('.br-building')).first().waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,view+' mobile should not overflow horizontally');
   await page.screenshot({path:path.join(out,view+'-compact-mobile.png'),fullPage:true});
  }
  assert.equal(await page.evaluate(()=>window.uiWalletWrites),0,'Rendering and expanding never requests signing');
  assert.ok(!requests.some(r=>r.url.includes('/api/road-ipfs/content/')),'No encrypted originals or metadata are fetched for thumbnails');
  assert.ok(!requests.some(r=>r.url.includes('/api/road-ipfs/nft-cover')&&r.method==='POST'),'Rendering never publishes artwork');
  assert.deepEqual(errors,[]);
  console.log('BUILDING ROLLUPS / COMPACT VIEWS PASS: real React views, NFT controls before receipts, collapsed details with complete copy values, lazy thumbnail identity reads, 12-card pagination, search/offline behavior, mobile bounds and no signing or private fetches. RPC and image responses are explicit fixtures.');
 }catch(error){
  if(page){const out=path.join(ROOT,'.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'compact-views-failure.png'),fullPage:true}).catch(()=>{});}
  throw error;
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{for(const file of [html,jsx])fs.rmSync(file,{force:true});});
