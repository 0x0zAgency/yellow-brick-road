import test from 'node:test';
import assert from 'node:assert/strict';
import {ALBUM_COVERS_KEY,normalizeAlbum,previewAlbum,rememberAlbumCover,loadAlbumCovers,matchingPlayerUploads,findAlbumCovers,verifyAlbumCover} from '../src/album-covers.js';
const addr=n=>'0x'+n.repeat(40),hash=n=>'0x'+n.repeat(64);
const scope={wallet:addr('1'),chainId:1337,factoryAddress:addr('2'),genesisHash:hash('3')},imageURI='ipfs://bafy'+'a'.repeat(55);
const record={...scope,brickAddress:addr('4'),ipId:hash('5')};
const upload={album:'Night  Road',authorization:{...scope,sources:{audio:{controller:scope.wallet,brickAddress:record.brickAddress}}}};
const packet={account:{address:scope.wallet}},mint={...scope,simulated:false,status:'confirmed',nftCover:{status:'verified',imageURI},receipts:[{sourceId:'master',status:'verified',contractAddress:record.brickAddress,id:record.ipId}]};
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
test('album detection uses preview embedded album tags, never filename, title or master',()=>{
 assert.equal(normalizeAlbum('  NIght \n Road  '),'night road');assert.equal(normalizeAlbum('Cafe\u0301'),normalizeAlbum('Café'));
 assert.equal(previewAlbum({master:{extracted:{fields:{release:'Night Road'}}}}),'');
 const preview={status:'ready',hash:'abc',extracted:{fields:{release:'Night Road'},fieldSources:{release:'embedded audio tags'}}};
 assert.equal(previewAlbum({preview}),'Night Road');
 for(const patch of [{status:'hashing'},{hash:null},{extracted:{fields:{title:'Night Road'},fieldSources:{title:'filename'}}}])assert.equal(previewAlbum({preview:{...preview,...patch}}),'');
});
test('only confirmed public covers are remembered, with no plaintext album or private payload',async()=>{
 const store=storage();await rememberAlbumCover(store,{album:'Night Road',packet:{...packet,key:'private'},mint});
 assert.equal(loadAlbumCovers(store).length,1);assert.doesNotMatch(store.getItem(ALBUM_COVERS_KEY),/Night Road|private|imageURI/);
 await rememberAlbumCover(store,{album:'night road',packet,mint});assert.equal(loadAlbumCovers(store).length,1);
 for(const change of [{simulated:true},{status:'pending'},{nftCover:{status:'pinned',imageURI}},{receipts:[{...mint.receipts[0],status:'pending'}]}]){
  const empty=storage();await rememberAlbumCover(empty,{album:'Night Road',packet,mint:{...mint,...change}});assert.deepEqual(loadAlbumCovers(empty),[]);
 }
});
test('Player matches require album, wallet, network, factory and chain history',()=>{
 assert.equal(matchingPlayerUploads([upload],{...scope,album:' night road '}).length,1);
 for(const patch of [{album:''},{album:'Other'},{wallet:addr('6')},{chainId:11155111},{factoryAddress:addr('6')},{genesisHash:hash('6')}])assert.deepEqual(matchingPlayerUploads([upload],{...scope,album:'Night Road',...patch}),[]);
 assert.deepEqual(matchingPlayerUploads([{album:'Night Road'}],{...scope,album:'Night Road'}),[]);
});
test('lookup combines saved receipts and existing Player uploads and verifies current NFT images',async()=>{
 const store=storage();await rememberAlbumCover(store,{album:'Night Road',packet,mint});
 const client={getBlock:async()=>({hash:scope.genesisHash}),readContract:async()=>record.ipId};let reads=0,checks=0;
 const deps={connect:async()=>({client,check:async()=>checks++}),playerUploads:async()=>[upload],readCover:async args=>{reads++;assert.equal(args.originator,scope.wallet);return imageURI;}};
 const result=await findAlbumCovers({...scope,album:'night road',storage:store},deps);
 assert.equal(result.covers.length,1);assert.equal(reads,1);assert.equal(checks,1);
 const offline=await findAlbumCovers({...scope,album:'Night Road',storage:store},{...deps,playerUploads:async()=>{throw Error('Offline');}});
 assert.equal(offline.covers.length,1);assert.equal(offline.playerUnavailable,true);
 const stale=await findAlbumCovers({...scope,album:'Night Road',storage:store},{...deps,readCover:async()=>{throw Error('Wrong holder');}});
 assert.deepEqual(stale.covers,[]);
});
test('changed cover, switched wallet, reset history and fallback images cannot be reused',async()=>{
 const client={getBlock:async()=>({hash:scope.genesisHash})};
 for(const patch of [{wallet:addr('8')},{chainId:1},{factoryAddress:addr('8')}])await assert.rejects(verifyAlbumCover(record,{...scope,...patch},{client}));
 await assert.rejects(verifyAlbumCover({...record,genesisHash:hash('9')},scope,{client}),/history/);
 for(const image of [null,'data:image/svg+xml;base64,abc','ipfs://bafy'+'b'.repeat(55)])await assert.rejects(verifyAlbumCover({...record,imageURI},scope,{client,readCover:async()=>image}),/changed|unavailable/);
 assert.equal(await verifyAlbumCover({...record,imageURI},scope,{client,readCover:async()=>imageURI}),imageURI);
});
test('canceled lookups and malformed stored indexes never yield a selection',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(findAlbumCovers({...scope,album:'Night Road',signal:controller.signal},{connect:async()=>({client:{getBlock:async()=>({hash:scope.genesisHash})},check:async()=>{}}),playerUploads:async()=>[]}),/canceled/);
 for(const raw of ['invalid','{}','[null]',JSON.stringify([{...record,albumKey:'not-a-hash'}])])assert.deepEqual(loadAlbumCovers({getItem:()=>raw}),[]);
});
