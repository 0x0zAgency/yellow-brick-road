import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {verifyTypedData} from 'viem';
import {webcrypto} from 'node:crypto';
import {buildLinkResponse,newLinkRequest,normalizeLinkRequest,typedLinkData,verifyLinkResponse,preflightLinkedBricks,linkRequestDigest,checkLinkedBrick} from '../src/brick-authorization.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const owner=privateKeyToAccount('0x'+'11'.repeat(32));
const requester=privateKeyToAccount('0x'+'22'.repeat(32));
const brick='0x'+'33'.repeat(20),factory='0x'+'44'.repeat(20);
const ipId='0x'+'55'.repeat(32),hash='ab'.repeat(32);
const make=()=>newLinkRequest({chainId:1337,requester:requester.address,sourceCommitment:'0x'+hash,
 targetBrick:brick,targetIpId:ipId,factory,relation:'cover-art',scope:'Cover use for this release only',
 deadline:Math.floor(Date.now()/1000)+3600});
const client=(controller=owner.address,chainId=1337)=>({
 getChainId:async()=>chainId,
 getBytecode:async()=> '0x6000',
 readContract:async({functionName})=>functionName==='isBrick'?true:functionName==='controller'?controller:ipId,
 verifyTypedData
});
test('builds one-time, narrowly scoped EIP-712 request without transmitting private assets',()=>{
 const req=make();
 assert.equal(req.standard,'road-link-approval-v1');
 assert.equal(req.targetBrick,brick);
 assert.equal(req.relation,'cover-art');
 assert.equal(req.sourceCommitment,'0x'+hash);
 assert.equal(typedLinkData(req).domain.chainId,1337);
 assert.equal(typedLinkData(req).domain.verifyingContract,brick);
 assert.notEqual(make().nonce,req.nonce);
 assert.ok(!JSON.stringify(req).includes('privateKey'));
 assert.throws(()=>normalizeLinkRequest({...req,targetBrick:'wrong'}),/targetBrick/);
});
test('separately signed controller response verifies against current owner and EVM chain',async()=>{
 const req=make();
 const signature=await owner.signTypedData(typedLinkData(req));
 const resp=buildLinkResponse(req,signature,owner.address);
 const out=await verifyLinkResponse(client(),req,resp);
 assert.equal(out.controller,owner.address);
 assert.equal(out.status,'verified-current-controller');
 assert.equal(resp.requestDigest,linkRequestDigest(req));
 await assert.rejects(verifyLinkResponse(client(requester.address),req,resp),/controller has changed/);
 await assert.rejects(verifyLinkResponse(client(owner.address,11155111),req,resp),/Switch wallet/);
});
test('rejects forged changes, wrong signer and expired signatures',async()=>{
 const req=make();
 const fake=buildLinkResponse(req,await requester.signTypedData(typedLinkData(req)),owner.address);
 await assert.rejects(verifyLinkResponse(client(),req,fake),/does not validate/);
 const proper=buildLinkResponse(req,await owner.signTypedData(typedLinkData(req)),owner.address);
 await assert.rejects(verifyLinkResponse(client(),{...req,scope:'All royalties worldwide'},proper),/different request/);
 await assert.rejects(checkLinkedBrick(client(),{...req,deadline:Math.floor(Date.now()/1000)-1}),/expired/);
});
test('preflight blocks unsigned references and source changes before any mint',async()=>{
 const req=make(),resp=buildLinkResponse(req,await owner.signTypedData(typedLinkData(req)),owner.address);
 const link={id:'cover',targetBrick:brick,factory,relation:'cover-art',scope:req.scope,request:req,response:resp};
 const options={client:client(),account:requester.address,chainId:1337,sourceHash:hash};
 const valid=await preflightLinkedBricks({...options,links:[link]});
 assert.equal(valid.length,1);
 await assert.rejects(preflightLinkedBricks({...options,links:[{...link,response:null}]}),/approval missing/);
 await assert.rejects(preflightLinkedBricks({...options,sourceHash:'cd'.repeat(32),links:[link]}),/Source file changed/);
 await assert.rejects(preflightLinkedBricks({...options,links:[{...link,scope:'New scope'}]}),/changed after/);
});
