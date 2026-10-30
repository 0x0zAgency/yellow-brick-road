import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {makeEnvelope,normalizeEnvelope,offerId,textHash,typedOffer,zeroAddress} from '../src/licensing/protocol.js';
import {openStore} from '../scripts/licensing/store.js';
const address=n=>'0x'+n.toString(16).padStart(40,'0');
const profile={chainId:1337,factoryAddress:address(1),genesisHash:textHash('genesis'),walletAddress:address(2)},state={brick:address(3),controller:address(4),epoch:'0',salt:textHash('salt')};
const make=()=>makeEnvelope({profile,state,licensee:address(5),project:{title:'Project',description:'Description'},terms:'Exact license terms',unitPrice:10,units:2,expiresAt:100000,deadline:99999,scope:1,nonce:textHash('nonce')});
test('offer identity binds terms, project, scope, deployment, network, salt and recipient',()=>{
 const e=make(),id=offerId(e);assert.equal(typedOffer(e).message.receiver,state.brick);
 for(const field of ['terms','project'])assert.throws(()=>normalizeEnvelope({...e,[field]:field==='terms'?'tampered':{...e.project,title:'Other'}}),/does not match/);
 assert.throws(()=>normalizeEnvelope({...e,offer:{...e.offer,receiver:profile.walletAddress}}),/Brick itself/);
 for(const key of ['controller','licensee','asset','deployment'])assert.notEqual(offerId({...e,offer:{...e.offer,[key]:address(9)}}),id);
 assert.notEqual(offerId({...e,salt:textHash('fork')}),id);assert.notEqual(offerId({...e,chainId:11155111}),id);
 assert.throws(()=>normalizeEnvelope({...e,offer:{...e.offer,units:'-1'}}),/Invalid/);assert.throws(()=>normalizeEnvelope({...e,offer:{...e.offer,unitPrice:2n**128n}}),/Invalid/);
 assert.throws(()=>normalizeEnvelope({...e,offer:{...e.offer,licensee:zeroAddress}}),/Invalid/);
});
test('deployment wallets persist privately, isolate network history and serialize ledger writes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ybr-offers-store-'));
 try{
  const store=await openStore(root,profile),wallet=store.walletAddress;
  await Promise.all(Array.from({length:10},(_,i)=>store.mutate(data=>{data.offers.push({id:i});})));
  const reopened=await openStore(root,profile);assert.equal(reopened.walletAddress,wallet);assert.equal(reopened.snapshot().offers.length,10);assert.deepEqual(reopened.snapshot().offers.map(r=>r.id),Array.from({length:10},(_,i)=>i));
  const other=await openStore(root,{...profile,genesisHash:textHash('new-history')});assert.notEqual(other.walletAddress,wallet);assert.equal(other.snapshot().offers.length,0);
  const dirs=await fs.readdir(path.join(root,'.road-local','licensing'));
  for(const dir of dirs){const stat=await fs.stat(path.join(root,'.road-local','licensing',dir,'wallet.json'));assert.equal(stat.mode&0o777,0o600);}
  const clone=store.snapshot();clone.offers.push({id:50});assert.equal(store.snapshot().offers.length,10);
  await assert.rejects(store.mutate(()=>{throw Error('rollback');}),/rollback/);assert.equal((await openStore(root,profile)).snapshot().offers.length,10);
  await assert.rejects(store.mutate(data=>{data.policies.oversized='x'.repeat(32*1024*1024);}),/32 MiB storage limit/);assert.equal((await openStore(root,profile)).snapshot().offers.length,10);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('storage refuses symlink directories instead of reading another deployment wallet',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ybr-offers-symlink-')),outside=await fs.mkdtemp(path.join(os.tmpdir(),'ybr-outside-'));
 try{await fs.symlink(outside,path.join(root,'.road-local'));await assert.rejects(openStore(root,profile),/private directory/);}finally{await fs.rm(root,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});}
});
