import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import {createWalletClient,createPublicClient,custom} from 'viem';
import {sepolia} from 'viem/chains';
import {makeRegistrationPacket} from '../src/mint-model.js';
import {DEFAULT_CONTENT_POLICY} from '../src/content-policy.js';
import {mintOnChain,preflightPolicyMint} from '../src/chain-mint.js';
import {readBrickLicensingContact,updateBrickLicensingContact} from '../src/licensing-contact-chain.js';

test('licensor contact lives on real Bricks: locked updates, independent parts, clearing and wallet-free reads',{timeout:60000},async()=>{
 const provider=ganache.provider({logging:{quiet:true},chain:{chainId:11155111},wallet:{deterministic:true}});
 try{
  const [account]=await provider.request({method:'eth_accounts',params:[]});
  const wallet=createWalletClient({account,chain:sepolia,transport:custom(provider)}),client=createPublicClient({chain:sepolia,transport:custom(provider)});
  const artifact=JSON.parse(fs.readFileSync(new URL('../../artifacts/contracts/YellowBrickFactory.sol/YellowBrickFactory.json',import.meta.url)));
  const gas=await client.estimateGas({account,data:artifact.bytecode});
  const factoryAddress=(await client.waitForTransactionReceipt({hash:await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode,gas:gas+gas/5n})})).contractAddress;
  const packet=makeRegistrationPacket({metadata:{title:'Contact integration',artist:'Creator'},assets:{master:{name:'master.wav',hash:'ab'.repeat(32),size:1,type:'audio/wav'}},identity:{mode:'external',connected:true,address:account},royalties:{creatorBps:10000},training:'separate-license',composition:true,licensing:{email:'Licensing+Requests@EXAMPLE.COM'},contentPolicy:{...DEFAULT_CONTENT_POLICY,locked:true}});
  const options={packet,provider,chainId:11155111,network:'sepolia',factoryAddress};await preflightPolicyMint(options);
  const result=await mintOnChain(options);assert.equal(result.status,'confirmed');assert.equal(result.receipts.length,2);assert.ok(result.receipts.every(r=>r.licensingContact.email==='Licensing+Requests@example.com'));
  const contactOptions={provider,chainId:11155111,factoryAddress,brickAddress:result.receipts[0].contractAddress,walletAddress:account};
  const review=await readBrickLicensingContact(contactOptions);
  const changed=await updateBrickLicensingContact({...contactOptions,review,email:'approvals@example.com'});assert.equal(changed.contact.email,'approvals@example.com');assert.equal(changed.contact.version,'2');
  await assert.rejects(updateBrickLicensingContact({...contactOptions,review,email:'stale@example.com'}),/changed since review/);
  await assert.rejects(updateBrickLicensingContact({...contactOptions,review:{...changed.contact,brickAddress:result.receipts[1].contractAddress},email:'wrong-brick@example.com'}),/changed since review/);
  const blank=await updateBrickLicensingContact({...contactOptions,review:changed.contact,email:''});assert.equal(blank.contact.email,'');
  const noWallet=await readBrickLicensingContact({...contactOptions,provider:null,client});assert.equal(noWallet.email,'');
  const other=await readBrickLicensingContact({...contactOptions,brickAddress:result.receipts[1].contractAddress});assert.equal(other.email,'Licensing+Requests@example.com');
 }catch(error){
  // Do not dump full deployment bytecode for a failing JSON-RPC operation.
  throw Error([error.shortMessage||error.message,error.details].filter(Boolean).join('\n'));
 }finally{await provider.disconnect();}
});
