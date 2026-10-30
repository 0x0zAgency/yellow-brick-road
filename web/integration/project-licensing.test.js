import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,parseEventLogs} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {sepolia} from 'viem/chains';
import {createLicensingService} from '../scripts/licensing/service.js';
import {createLicensingClient} from '../src/licensing/client.js';
import {makeEnvelope,offerId,offerArgs,licensingAbi,textHash,zeroAddress,zeroHash,json} from '../src/licensing/protocol.js';

test('signed inbox → creator counter → direct Brick payment → collaborator withdrawals; persistence and automatic rules',{timeout:90000},async()=>{
 const provider=ganache.provider({logging:{quiet:true},chain:{chainId:11155111},wallet:{deterministic:true}}),root=await fs.mkdtemp(path.join(os.tmpdir(),'ybr-licensing-'));
 try{
  const accounts=Object.values(provider.getInitialAccounts()).map(value=>privateKeyToAccount(value.secretKey)),[owner,buyer,collaborator,stranger]=accounts;
  const publicClient=createPublicClient({chain:sepolia,transport:custom(provider)}),wallet=createWalletClient({account:owner,chain:sepolia,transport:custom(provider)});
  const artifact=JSON.parse(await fs.readFile(new URL('../../artifacts/contracts/YellowBrickFactory.sol/YellowBrickFactory.json',import.meta.url),'utf8'));
  const estimate=await publicClient.estimateGas({account:owner.address,data:artifact.bytecode});
  const factoryAddress=(await publicClient.waitForTransactionReceipt({hash:await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode,gas:estimate+estimate/5n})})).contractAddress;
  async function write(address,abi,functionName,args,account=owner,value=0n){const call={address,abi,functionName,args,account,value},gas=await publicClient.estimateContractGas(call);const hash=await createWalletClient({account,chain:sepolia,transport:custom(provider)}).writeContract({...call,gas:gas+gas/5n});return publicClient.waitForTransactionReceipt({hash});}
  const mint=await write(factoryAddress,artifact.abi,'deployBrick',[textHash('work'),'ipfs://work',textHash('mint')]);
  const brick=parseEventLogs({abi:artifact.abi,logs:mint.logs,eventName:'BrickDeployed'})[0].args.brick;
  const profile={chainId:11155111,factoryAddress,genesisHash:(await publicClient.getBlock({blockNumber:0n})).hash};
  let service=await createLicensingService({root,profile,client:publicClient});
  const origin='http://127.0.0.1:5173';
  const transport=async(url,options={})=>{try{const result=await service.dispatch({method:options.method||'GET',path:url.replace('/api/licensing',''),body:options.body?JSON.parse(options.body):{},origin,authorization:options.headers?.Authorization?.replace('Bearer ',''),csrfToken:options.headers?.['X-YBR-CSRF']});return {ok:true,json:async()=>JSON.parse(json(result))};}catch(error){return {ok:false,json:async()=>({error:error.message})};}};
  async function browser(account){const bridge={request:async({method,params=[]})=>{
   if(['eth_accounts','eth_requestAccounts'].includes(method))return [account.address];
   if(method==='personal_sign')return account.signMessage({message:{raw:params[0]}});
   if(method==='eth_signTypedData_v4')return account.signTypedData(typeof params[1]==='string'?JSON.parse(params[1]):params[1]);
   return provider.request({method,params});
  }};const browser=createLicensingClient({provider:bridge,fetcher:transport,client:publicClient});await browser.initialize();await browser.connect();await browser.login();return browser;}
  const creator=await browser(owner),licensee=await browser(buyer),outsider=await browser(stranger);
  await creator.transact(brick,'configureLicensePayout',[[owner.address,collaborator.address],[8000,2000],0n,0n]);
  let state=await creator.api('/state?brick='+brick);assert.equal(state.policies[1].enabled,false);assert.equal(state.epoch,'1');
  const config=await licensee.api('/config'),publicAddress=config.walletAddress;
  assert.ok(!json(config).includes('privateKey'));assert.ok(!json(config).includes('rpcUrl'));
  const now=Math.floor(Date.now()/1000);
  const envelope=makeEnvelope({profile:config,state,licensee:buyer.address,project:{title:'Ingest into publishing project',description:'A catalog entry in a film publishing project',uri:'project:film-one'},terms:'One licensed unit permits one catalog ingestion. No private master delivery is implied.',unitPrice:100n,units:10,expiresAt:now+3600,deadline:now+1800,scope:1,nonce:textHash('offer1')});
  assert.equal(await publicClient.readContract({address:brick,abi:licensingAbi,functionName:'licenseOfferDigest',args:[offerArgs(envelope)]}),offerId(envelope));
  const signature=await licensee.sign(envelope);
  await assert.rejects(licensee.api('/offers',{method:'POST',body:{envelope:{...envelope,terms:'Tampered'},signature}}),/does not match/);
  await assert.rejects(outsider.api('/offers',{method:'POST',body:{envelope,signature}}),/Only the licensee/);
  const pending=await licensee.api('/offers',{method:'POST',body:{envelope,signature}});assert.equal(pending.ready,false);
  await assert.rejects(licensee.api('/offers',{method:'POST',body:{envelope,signature}}),/already exists/);
  assert.equal((await outsider.api('/offers?brick='+brick)).offers.length,0);assert.equal((await creator.api('/offers?brick='+brick)).offers.length,1);
  const counter=makeEnvelope({profile:config,state,licensee:buyer.address,project:envelope.project,terms:'One licensed unit permits one publishing project placement, with attribution to the creator.',unitPrice:200n,units:5,expiresAt:now+3600,deadline:now+1800,scope:2,nonce:textHash('counter')});
  const approved=await creator.api('/offers/'+pending.id+'/decision',{method:'POST',body:{action:'counter',envelope:counter,signature:await creator.sign(counter)}});
  const rows=(await licensee.api('/offers?brick='+brick)).offers;assert.equal(rows.find(r=>r.id===pending.id).status,'countered');assert.equal(rows.find(r=>r.id===approved.id).ready,true);
  await licensee.accept(approved);assert.equal(await publicClient.getBalance({address:brick}),1000n);assert.equal(await publicClient.getBalance({address:publicAddress}),0n);
  let funds=await creator.funds(brick,zeroAddress);assert.equal(funds.claimable,800n);assert.equal(funds.balance,1000n);
  await licensee.transact(brick,'recordLicensedUse',[approved.id,textHash('use'),2n,textHash('publication evidence')]);
  const licensed=(await licensee.api('/offers?brick='+brick)).offers.find(r=>r.id===approved.id);assert.equal(licensed.status,'licensed');assert.equal(licensed.grant.consumed,'2');
  await creator.transact(brick,'claimIPFunds',[zeroAddress]);assert.equal(await publicClient.getBalance({address:brick}),200n);
  await write(brick,licensingAbi,'claimIPFunds',[zeroAddress],collaborator);assert.equal(await publicClient.getBalance({address:brick}),0n);
  const autoTerms='One approved ingestion with attribution.',policy={enabled:true,asset:zeroAddress,termsHash:textHash(autoTerms),projectHash:zeroHash,minUnitPrice:10n,maxUnits:2n,maxDuration:7200n,revocable:false,epoch:1n,version:0n};
  await creator.transact(brick,'setAutoLicensePolicy',[1,policy,1n,0n]);await creator.api('/policy-document',{method:'POST',body:{brick,scope:1,terms:autoTerms}});
  state=await licensee.api('/state?brick='+brick);assert.equal(state.policyTerms[1],autoTerms);
  const auto=makeEnvelope({profile:config,state,licensee:buyer.address,project:envelope.project,terms:autoTerms,unitPrice:10n,units:2,expiresAt:now+3600,deadline:now+1800,scope:1,nonce:textHash('automatic')});
  const automatic=await licensee.api('/offers',{method:'POST',body:{envelope:auto,signature:await licensee.sign(auto)}});assert.equal(automatic.ready,true);
  await assert.rejects(creator.api('/offers/'+automatic.id+'/decision',{method:'POST',body:{action:'close'}}),/Cancel the authorized/);
  await licensee.accept(automatic);assert.equal(await publicClient.getBalance({address:brick}),20n);
  const manual={...envelope,offer:{...envelope.offer,nonce:textHash('manual')}};
  const newOffer=await licensee.api('/offers',{method:'POST',body:{envelope:manual,signature:await licensee.sign(manual)}});
  await creator.api('/offers/'+newOffer.id+'/decision',{method:'POST',body:{action:'approve',signature:await creator.sign(manual)}});
  await creator.transact(brick,'cancelLicenseOffer',[offerArgs(manual)]);await creator.api('/offers/'+newOffer.id+'/decision',{method:'POST',body:{action:'close'}});
  await assert.rejects(licensee.accept({...newOffer,controllerSignature:await creator.sign(manual)}));
  const csrf=config.csrf;
  await assert.rejects(service.dispatch({method:'POST',path:'/challenge',origin,body:{address:buyer.address}}),/Refresh/);
  const challenge=await service.dispatch({method:'POST',path:'/challenge',origin,csrfToken:csrf,body:{address:buyer.address}}),loginSignature=await buyer.signMessage({message:challenge.message});
  await service.dispatch({method:'POST',path:'/session',origin,csrfToken:csrf,body:{nonce:challenge.nonce,signature:loginSignature}});
  await assert.rejects(service.dispatch({method:'POST',path:'/session',origin,csrfToken:csrf,body:{nonce:challenge.nonce,signature:loginSignature}}),/expired/);
  service=await createLicensingService({root,profile,client:publicClient});assert.equal(service.profile.walletAddress,publicAddress);
  const restored=await browser(buyer);assert.equal((await restored.api('/offers?brick='+brick)).offers.length,4);
  await assert.rejects(licensee.api('/offers?brick='+brick),/Sign in/);
 }catch(error){throw Error([error.shortMessage||error.message,error.details].filter(Boolean).join('\n'));}
 finally{await provider.disconnect();await fs.rm(root,{recursive:true,force:true});}
});
