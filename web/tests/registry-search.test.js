import test from 'node:test';
import assert from 'node:assert/strict';
import {SEARCH_DEFAULTS,matchesRegistrySearch,searchRegistryItems,publicWorkType,validateSearch,registrationKey,readShortlist,toggleShortlist,SHORTLIST_KEY,licenseScope} from '../src/registry-search.js';
const addr=n=>'0x'+n.toString(16).padStart(40,'0'),hash=n=>'0x'+n.toString(16).padStart(64,'0');
const network={genesisHash:hash(9)};
function brick(n,publicLabel=false){return {id:hash(n),source:publicLabel?'road':'road-registry',type:publicLabel?'AudioBrick':'RegisteredBrick',title:publicLabel?'Night train':'Registered Brick '+n,creator:'Public artist',description:'Ambient soundtrack',streamAllowed:publicLabel,registration:{chainId:1337,factoryAddress:addr(1),brickAddress:addr(n),ipId:hash(n),originator:addr(5),controller:addr(6),blockNumber:String(n),transactionHash:hash(n+100),contentHash:hash(n+200),metadataDigest:hash(n+300),metadataURI:'ipfs://secret-filename'}};}
const filter=patch=>({...SEARCH_DEFAULTS,...patch});
test('queries use public labels and chain identities, never private references or undisclosed descriptions',()=>{
 const publicRow=brick(10,true),privateRow=brick(11);
 for(const query of ['night TRAIN','public artist','ambient soundtrack',addr(10),hash(110),hash(310)])assert.equal(matchesRegistrySearch(publicRow,filter({query})),true);
 for(const query of ['secret-filename','public artist','ambient soundtrack'])assert.equal(matchesRegistrySearch(privateRow,filter({query})),false);
 assert.equal(publicWorkType({...privateRow,type:'AudioBrick'}),'undisclosed');
 assert.equal(matchesRegistrySearch(publicRow,filter({category:'music',preview:'available'})),true);
 assert.equal(matchesRegistrySearch(privateRow,filter({category:'music'})),false);
 assert.equal(matchesRegistrySearch(privateRow,filter({category:'undisclosed',preview:'unavailable'})),true);
});
test('wallet role, own works and inclusive block bounds compose without rounding large blocks',()=>{
 const row=brick(10);row.registration.blockNumber='90071992547409931234';
 assert.equal(matchesRegistrySearch(row,filter({wallet:addr(5).toUpperCase(),walletRole:'originator'})),true);
 assert.equal(matchesRegistrySearch(row,filter({wallet:addr(5),walletRole:'controller'})),false);
 assert.equal(matchesRegistrySearch(row,filter({mine:true}),{}),false);
 assert.equal(matchesRegistrySearch(row,filter({mine:true}),{wallet:addr(5)}),true);
 assert.equal(matchesRegistrySearch(row,filter({fromBlock:'90071992547409931234',toBlock:'90071992547409931234'})),true);
 assert.equal(matchesRegistrySearch(row,filter({toBlock:'90071992547409931233'})),false);
 for(const patch of [{wallet:'0x123'},{fromBlock:'-1'},{toBlock:'1.5'},{fromBlock:'12',toBlock:'10'}]){assert.ok(validateSearch(filter(patch)));assert.equal(matchesRegistrySearch(row,filter(patch)),false);}
});
test('a matching child retains the whole Building; sorting uses the matched work and never mutates inputs',()=>{
 const a=brick(10,true),b=brick(11),c=brick(12),bundle={kind:'building',rows:[a,b]},single={kind:'brick',rows:[c]};
 const items=[bundle,single];
 assert.deepEqual(searchRegistryItems(items,filter({query:'Night'})),[bundle]);
 assert.equal(bundle.rows.length,2);
 assert.deepEqual(searchRegistryItems(items,filter({sort:'newest'})),[single,bundle]);
 assert.deepEqual(searchRegistryItems(items,filter({sort:'oldest'})),[bundle,single]);
 assert.deepEqual(items,[bundle,single]);
});
test('shortlist persists only public identity keys and isolates factories, genesis histories and reminted identities',()=>{
 const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},row=brick(10),key=registrationKey(row,network);
 assert.deepEqual(toggleShortlist(storage,key),[key]);assert.deepEqual(readShortlist(storage),[key]);
 assert.equal(matchesRegistrySearch(row,filter({shortlisted:true}),{network,shortlist:readShortlist(storage)}),true);
 assert.equal(matchesRegistrySearch(row,filter({shortlisted:true}),{network:{genesisHash:hash(8)},shortlist:[key]}),false);
 const other=structuredClone(row);other.registration.transactionHash=hash(999);assert.notEqual(registrationKey(other,network),key);
 other.registration.factoryAddress=addr(8);assert.notEqual(registrationKey(other,network),key);
 assert.equal(memory.get(SHORTLIST_KEY).includes('Night'),false);assert.equal(memory.get(SHORTLIST_KEY).includes('metadata'),false);
 assert.deepEqual(toggleShortlist(storage,key),[]);
 memory.set(SHORTLIST_KEY,'["bad",null,{},"<script>"]');assert.deepEqual(readShortlist(storage),[]);
 memory.set(SHORTLIST_KEY,'broken JSON');assert.deepEqual(readShortlist(storage),[]);
 assert.throws(()=>toggleShortlist({getItem:()=>null,setItem:()=>{throw Error('quota');}},key),/quota/);
 assert.equal(licenseScope('publishing'),'2');assert.equal(licenseScope('ingestion'),'1');
});
