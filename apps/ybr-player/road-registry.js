'use strict';
/** Registration discovery is NOT publication or a playback grant.
 * Read only factory events and contract state. Never dereference metadata URIs,
 * read source files, or request decryption keys to populate this index.
 */
const ADDRESS=/^0x[\da-f]{40}$/i;
const HASH=/^0x[\da-f]{64}$/i;
const ZERO='0x'+'0'.repeat(40);
const lower=value=>String(value).toLowerCase();
const validAddress=value=>ADDRESS.test(value||'')&&lower(value)!==ZERO;
const validHead=head=>head&&Number.isSafeInteger(head.number)&&head.number>=0&&HASH.test(head.hash||'');
const short=value=>value.slice(0,10)+'…'+value.slice(-6);
const MAX_BLOCKS=100000;
const MAX_EVENTS=1000;
const MAX_RESULTS=200;

async function discoverRegistry({status,readHead,readEvents,readBrick}){
 const empty={format:'ybr-chain-registry/1',network:status,bricks:[],matchingEvents:0,limitReached:false};
 if(!status?.ready)return empty;
 if(![1337,11155111].includes(status.chainId)||!validAddress(status.factoryAddress))throw Error('Invalid local registry network or factory.');
 const head=await readHead('latest');
 if(!validHead(head))throw Error('Registry could not verify the current chain head.');
 const first=Number.isSafeInteger(status.deploymentBlock)&&status.deploymentBlock>=0?status.deploymentBlock:0;
 const fromBlock=Math.max(first,head.number-MAX_BLOCKS+1);
 const events=[];
 // The local pilot deliberately bounds scan size. Disclose truncation, not an
 // empty/full-history claim when a chain or result set grows beyond the limit.
 for(let from=fromBlock;from<=head.number;from+=2000){
  const page=await readEvents(from,Math.min(from+1999,head.number));
  if(!Array.isArray(page)||events.length+page.length>MAX_EVENTS)throw Error('Registry scan exceeds 1,000 events; a paginated indexer is required.');
  events.push(...page);
 }
 const unique=new Map();
 const ids=new Map();
 for(const event of events){
  const a=event.args;
  if(event.removed||lower(event.address)!==lower(status.factoryAddress)||!validAddress(a?.brick)||!validAddress(a?.originator)||
   !HASH.test(a?.ipId||'')||!HASH.test(a?.contentHash||'')||!HASH.test(event.transactionHash||'')||
   !Number.isSafeInteger(event.blockNumber)||event.blockNumber<fromBlock||event.blockNumber>head.number)
   throw Error('Invalid factory registration event. Refresh the registry.');
  const address=lower(a.brick),id=lower(a.ipId);
  if(ids.has(id)&&ids.get(id)!==address)throw Error('Conflicting registered Brick identities.');
  if(unique.has(address)&&lower(unique.get(address).args.ipId)!==id)throw Error('Conflicting registered Brick addresses.');
  ids.set(id,address);unique.set(address,event);
 }
 const ordered=[...unique.values()].sort((a,b)=>b.blockNumber-a.blockNumber||(b.logIndex||0)-(a.logIndex||0));
 const bricks=[];
 for(const event of ordered.slice(0,MAX_RESULTS)){
  const expected=event.args;
  const value=await readBrick(expected.brick,head.number);
  if(value?.registered!==true||!value.code||value.code==='0x'||
   !HASH.test(value.ipId||'')||lower(value.ipId)!==lower(expected.ipId)||
   !validAddress(value.originator)||lower(value.originator)!==lower(expected.originator)||
   !HASH.test(value.contentHash||'')||lower(value.contentHash)!==lower(expected.contentHash)||
   !validAddress(value.controller)||!HASH.test(value.metadataDigest||'')||
   !/^\d+$/.test(String(value.metadataVersion))||typeof value.metadataURI!=='string'||value.metadataURI.length>8192)
   throw Error('Factory event and Brick state disagree at '+expected.brick+'. Refresh the registry.');
  const id=lower(value.ipId);
  const registration={chainId:status.chainId,factoryAddress:status.factoryAddress,brickAddress:expected.brick,
   ipId:id,originator:value.originator,controller:value.controller,contentHash:lower(value.contentHash),
   metadataDigest:lower(value.metadataDigest),metadataVersion:String(value.metadataVersion),metadataURI:value.metadataURI,
   transactionHash:event.transactionHash,blockNumber:String(event.blockNumber)};
  bricks.push({id,type:'RegisteredBrick',source:'road-registry',title:'Registered Brick '+short(expected.brick),
   creator:value.originator,description:'On-chain registration. A readable title and playable media have not been published to this Player.',
   durationSeconds:0,theme:'gold',streamAllowed:false,registration,
   media:{mimeType:null,sha256:null},
   rights:{license:null,notes:'Registration is not a playback license, proof of copyright ownership, or proof that files are available.'},
   provenance:{agent:value.originator,activity:'Registered on '+(status.chainId===1337?'local Ganache':'Sepolia'),entity:id},
   road:{...registration,licenseMode:'not-published'}});
 }
 const rechecked=await readHead(head.number);
 if(!validHead(rechecked)||rechecked.number!==head.number||lower(rechecked.hash)!==lower(head.hash))
  throw Error('Chain history changed during registry discovery. Refresh to read the current chain.');
 return {...empty,bricks,head:{number:String(head.number),hash:head.hash},fromBlock:String(fromBlock),
  limited:fromBlock>first,matchingEvents:ordered.length,limitReached:ordered.length>MAX_RESULTS};
}

/** Add labels only from the existing verified, consent-gated music catalog.
 * Matching an id alone is insufficient. Never copy a server filesystem path.
 */
function mergeRegisteredTracks(registrations,tracks){
 const byId=new Map(tracks.map(track=>[lower(track.id),track]));
 return registrations.map(registration=>{
  const track=byId.get(lower(registration.id)),r=registration.registration;
  if(!track||track.source!=='road'||track.streamAllowed!==true||track.road?.chainId!==r.chainId||
   lower(track.road.factoryAddress)!==lower(r.factoryAddress)||lower(track.road.brickAddress)!==lower(r.brickAddress)||
   lower(track.road.contentHash)!==lower(r.contentHash)||lower(track.road.metadataDigest)!==lower(r.metadataDigest)||
   lower(track.road.controller)!==lower(r.controller))return registration;
  const {mediaPath,...publicTrack}=track;
  return {...publicTrack,registration:r};
 });
}

async function readPlayerCatalog(road){
 // Tests and alternate adapters without a registry retain the explicit music
 // interface; the normal Ganache adapter always supplies registry().
 if(typeof road.registry!=='function'){
  const catalog=await road.list();
  return {...catalog,bricks:catalog.tracks.map(({mediaPath,...track})=>track)};
 }
 const registry=await road.registry();
 if(!registry.network.ready)return {status:registry.network,bricks:[],registry};
 const catalog=await road.list();
 if(!catalog.status.ready)return {status:catalog.status,bricks:[],registry};
 const indexed=mergeRegisteredTracks(registry.bricks,catalog.tracks);
 const ids=new Set(indexed.map(brick=>lower(brick.id)));
 // Preserve older playable tracks when the newest-registration view is capped.
 const older=catalog.tracks.filter(track=>!ids.has(lower(track.id))).map(({mediaPath,...track})=>track);
 return {status:registry.network,bricks:[...indexed,...older],registry:{...registry,bricks:indexed}};
}
module.exports={discoverRegistry,mergeRegisteredTracks,readPlayerCatalog,MAX_RESULTS};
