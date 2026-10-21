'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ethers}=require('ethers');
const {DEFAULT,DEFAULT_ACCOUNT,describeMnemonic,generateSelection,readSelection,saveSelection,selectionFile,profilePaths,prepareProfile}=require('./dev-ganache-profile.cjs');
const {startGanache,ganacheOptions}=require('./dev-ganache.cjs');
const {readFactoryAddress}=require('../apps/ybr-player/road-music');
// Public BIP-39 development vectors only. Never use these with real assets.
const TEST_A='test test test test test test test test test test test junk';
const TEST_B='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ORIGINAL='myth like bonus scare over problem client lizard pioneer submit female collect';
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-profile-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('real BIP-39 validation normalizes spacing and checksum-checks without echoing input',()=>{
 const a=describeMnemonic(TEST_A);assert.equal(a.account,ethers.Wallet.fromMnemonic(TEST_A).address);
 assert.equal(describeMnemonic('  '+TEST_A.toUpperCase().replaceAll(' ','\n ')+' ').id,a.id);
 for(const value of ['',TEST_A.replace('junk','test'),'twelve invalid words',TEST_A+'\x1b[31m'])assert.throws(()=>describeMnemonic(value));
 assert.equal(describeMnemonic(ORIGINAL).id,'default');
 const generated=generateSelection();assert.equal(generated.mnemonic.split(' ').length,24);assert.equal(ethers.utils.isValidMnemonic(generated.mnemonic),true);
});
test('profile changes keep independent DB/factory paths and restore the default paths',t=>{
 const root=temp(t),defaultPaths=prepareProfile(root);
 fs.writeFileSync(path.join(defaultPaths.database,'KEEP'),'original chain');
 fs.writeFileSync(defaultPaths.factory,'original factory');
 const a=describeMnemonic(TEST_A);saveSelection(root,a);const next=prepareProfile(root);
 assert.notEqual(next.database,defaultPaths.database);assert.notEqual(next.factory,defaultPaths.factory);
 assert.equal(readSelection(root).id,a.id);
 saveSelection(root,DEFAULT,{expectedId:a.id});assert.equal(prepareProfile(root).database,defaultPaths.database);
 assert.equal(fs.readFileSync(defaultPaths.factory,'utf8'),'original factory');assert.equal(fs.readFileSync(path.join(defaultPaths.database,'KEEP'),'utf8'),'original chain');
 saveSelection(root,a);assert.equal(prepareProfile(root).database,next.database);
});
test('selection files are owner-only and changes preserve unrelated local data',t=>{
 const root=temp(t);prepareProfile(root);const other=path.join(root,'.road-local','player-access.json');fs.writeFileSync(other,'unchanged');
 const a=describeMnemonic(TEST_A);saveSelection(root,a);
 if(process.platform!=='win32'){
  assert.equal(fs.statSync(selectionFile(root)).mode&0o777,0o600);assert.equal(fs.statSync(path.dirname(selectionFile(root))).mode&0o777,0o700);
 }
 assert.equal(fs.readFileSync(other,'utf8'),'unchanged');assert.deepEqual(readSelection(root),a);
 assert.throws(()=>saveSelection(root,DEFAULT,{expectedId:'wrong'}),/changed elsewhere/);assert.deepEqual(readSelection(root),a);
});
test('malformed, permissive and linked settings are refused, never silently replaced',t=>{
 const root=temp(t);prepareProfile(root);const file=selectionFile(root);
 fs.writeFileSync(file,'not json',{mode:0o600});assert.throws(()=>readSelection(root),/Invalid/);
 fs.unlinkSync(file);saveSelection(root,describeMnemonic(TEST_A));
 if(process.platform!=='win32'){
  fs.chmodSync(file,0o644);assert.throws(()=>readSelection(root),/private/);fs.chmodSync(file,0o600);
  const outside=path.join(root,'outside.json');fs.writeFileSync(outside,'keep');fs.unlinkSync(file);fs.symlinkSync(outside,file);
  assert.throws(()=>saveSelection(root,DEFAULT));assert.equal(fs.readFileSync(outside,'utf8'),'keep');
 }
});
test('linked profile databases are refused before writing through the link',{skip:process.platform==='win32'},t=>{
 const root=temp(t),outside=temp(t),a=describeMnemonic(TEST_A);saveSelection(root,a);
 const base=path.join(root,'.road-local','ganache-profiles');fs.symlinkSync(outside,base,'dir');
 assert.throws(()=>prepareProfile(root),/regular directory/);assert.deepEqual(fs.readdirSync(outside),[]);
});
test('Player selects the matching profile factory without falling back to another profile',t=>{
 const root=temp(t),original=prepareProfile(root),address0='0x'+'2'.repeat(40),addressA='0x'+'3'.repeat(40);
 fs.writeFileSync(original.factory,JSON.stringify({chainId:1337,factoryAddress:address0}));
 assert.equal(readFactoryAddress(root,{}),address0);
 saveSelection(root,describeMnemonic(TEST_A));const custom=prepareProfile(root);
 assert.equal(readFactoryAddress(root,{}),null);
 fs.writeFileSync(custom.factory,JSON.stringify({chainId:1337,factoryAddress:addressA}));assert.equal(readFactoryAddress(root,{}),addressA);
 saveSelection(root,DEFAULT);assert.equal(readFactoryAddress(root,{}),address0);
});
test('Ganache options use programmatic mnemonic selection, preserving the default CLI settings',t=>{
 const root=temp(t),defaults=ganacheOptions(root);
 assert.equal(defaults.database.dbPath,path.join(root,'.road-local','ganache'));
 assert.deepEqual(defaults.chain,{chainId:1337,networkId:1337,hardfork:'shanghai'});assert.deepEqual(defaults.wallet,{deterministic:true});
 const selected=describeMnemonic(TEST_A);saveSelection(root,selected);const options=ganacheOptions(root);
 assert.deepEqual(options.wallet,{mnemonic:TEST_A});assert.notEqual(options.database.dbPath,defaults.database.dbPath);
 const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json')));assert.equal(pkg.scripts.ganache,'node scripts/dev-ganache.cjs');
});
test('real Ganache profile round trip preserves original history, code, balance and nonce',{timeout:60000},async t=>{
 const root=temp(t);let live;
 t.after(async()=>{if(live)await live.server.close();});
 const rpc=(method,params=[])=>live.server.provider.request({method,params});
 const start=async()=>{live=await startGanache({root,port:0,quiet:true});};
 const stop=async()=>{await live.server.close();live=null;};
 await start();const [from,to]=await rpc('eth_accounts');assert.equal(from,DEFAULT_ACCOUNT.toLowerCase());
 await rpc('eth_sendTransaction',[{from,to,value:'0x123',gas:'0x5208'}]);
 const hash=await rpc('eth_sendTransaction',[{from,data:'0x6001600c60003960016000f300',gas:'0x186a0'}]);
 const receipt=await rpc('eth_getTransactionReceipt',[hash]);
 const before={head:await rpc('eth_getBlockByNumber',['latest',false]),nonce:await rpc('eth_getTransactionCount',[from,'latest']),balance:await rpc('eth_getBalance',[from,'latest'])};
 assert.equal(await rpc('eth_getCode',[receipt.contractAddress,'latest']),'0x00');
 await stop();saveSelection(root,describeMnemonic(TEST_A));await start();
 assert.notEqual((await rpc('eth_accounts'))[0],from);assert.equal(await rpc('eth_getCode',[receipt.contractAddress,'latest']),'0x');
 const aHead=await rpc('eth_getBlockByNumber',['latest',false]);const aFrom=(await rpc('eth_accounts'))[0];
 assert.equal(BigInt(await rpc('eth_getBalance',[aFrom,'latest'])),1000n*10n**18n);
 await stop();saveSelection(root,describeMnemonic(TEST_B));await start();assert.notEqual((await rpc('eth_accounts'))[0],aFrom);
 await stop();saveSelection(root,DEFAULT);await start();
 assert.equal((await rpc('eth_getBlockByNumber',['latest',false])).hash,before.head.hash);
 assert.equal(await rpc('eth_getTransactionCount',[from,'latest']),before.nonce);
 assert.equal(await rpc('eth_getBalance',[from,'latest']),before.balance);
 assert.equal(await rpc('eth_getCode',[receipt.contractAddress,'latest']),'0x00');
 assert.equal((await rpc('eth_getTransactionReceipt',[hash])).blockHash,receipt.blockHash);
 await stop();saveSelection(root,describeMnemonic(TEST_A));await start();assert.equal((await rpc('eth_getBlockByNumber',['latest',false])).hash,aHead.hash);
 await stop();
});
