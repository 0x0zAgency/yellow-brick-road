'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {readRecord,writeRecord}=require('./dev-network-profile.cjs');
const {preservePreviousDeployment}=require('./dev-sepolia.cjs');
const profile={version:1,network:'sepolia',chainId:11155111,rpcUrl:'https://private.example/v3/test',genesisHash:'0x'+'a'.repeat(64),factoryAddress:'0x'+'b'.repeat(40),deploymentBlock:1,deployer:null,transactionHash:null};
test('replacement requires the reviewed profile and preserves its private reference',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-factory-history-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 preservePreviousDeployment(root,null);assert.equal(fs.existsSync(path.join(root,'.road-local')),false);
 writeRecord(root,'sepolia',profile);assert.throws(()=>preservePreviousDeployment(root,null),/changed after review/);
 preservePreviousDeployment(root,profile);
 const name='sepolia-history-'+profile.factoryAddress.slice(2)+'-'+profile.genesisHash.slice(2);
 const saved=readRecord(root,name);assert.equal(saved.factoryAddress,profile.factoryAddress);assert.equal(saved.rpcUrl,profile.rpcUrl);
 assert.equal(readRecord(root,'sepolia').factoryAddress,profile.factoryAddress,'Archiving cannot activate a replacement');
 writeRecord(root,'sepolia',{...profile,deploymentBlock:2});assert.throws(()=>preservePreviousDeployment(root,profile),/changed after review/);
 assert.throws(()=>readRecord(root,'sepolia-history-../../private'),/Unsupported/);
});
