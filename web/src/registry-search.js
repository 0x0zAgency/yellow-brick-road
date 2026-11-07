/** Search public registry fields only. Private metadata and playback terms are not sale listings. */
export const SEARCH_DEFAULTS={query:'',category:'all',preview:'all',wallet:'',walletRole:'either',fromBlock:'',toBlock:'',sort:'newest',shortlisted:false,mine:false};
export const WORK_TYPES=[['all','All work types'],['music','Music & audio'],['visual','Images & graphics'],['writing','Writing'],['video','Film & video'],['software','Software'],['data','Data & research'],['other','Other'],['undisclosed','Type not disclosed']];
export const SEARCH_PURPOSES=[['explore','Explore IP'],['publishing','License for publishing'],['ingestion','License for ingestion'],['purchase','Discuss a purchase']];
const lower=value=>String(value||'').toLowerCase();
// The current consent-gated public catalog publishes AudioBrick records only.
// Extend here when another public catalog type has a verified publication adapter.
export const publicWorkType=brick=>brick.source==='road'&&brick.type==='AudioBrick'?'music':'undisclosed';
export const publicWorkTypeLabel=brick=>WORK_TYPES.find(([id])=>id===publicWorkType(brick))[1];
export function validateSearch(filters){
 if(filters.wallet&&!/^0x[\da-f]{40}$/i.test(filters.wallet.trim()))return 'Enter a complete creator or controller wallet address.';
 for(const key of ['fromBlock','toBlock'])if(filters[key]&&!/^\d{1,78}$/.test(filters[key]))return 'Block numbers must be whole, nonnegative numbers.';
 if(filters.fromBlock&&filters.toBlock&&BigInt(filters.fromBlock)>BigInt(filters.toBlock))return 'The first block must be no later than the last block.';
 return '';
}
export function registrationKey(brick,network={}){
 const r=brick.registration;
 return [r.chainId,lower(r.factoryAddress),lower(network.genesisHash),lower(r.brickAddress),lower(r.ipId),lower(r.transactionHash)].join(':');
}
export function matchesRegistrySearch(brick,filters,{wallet,shortlist=[],network}={}){
 if(validateSearch(filters))return false;
 const r=brick.registration,q=lower(filters.query).trim(),address=lower(filters.wallet).trim();
 if(filters.mine&&(!wallet||lower(r.originator)!==lower(wallet)))return false;
 if(filters.shortlisted&&!shortlist.includes(registrationKey(brick,network)))return false;
 if(filters.category!=='all'&&publicWorkType(brick)!==filters.category)return false;
 if(filters.preview==='available'&&!brick.streamAllowed||filters.preview==='unavailable'&&brick.streamAllowed)return false;
 if(address){const fields=filters.walletRole==='originator'?[r.originator]:filters.walletRole==='controller'?[r.controller]:[r.originator,r.controller];if(!fields.some(value=>lower(value)===address))return false;}
 if(filters.fromBlock&&BigInt(r.blockNumber)<BigInt(filters.fromBlock)||filters.toBlock&&BigInt(r.blockNumber)>BigInt(filters.toBlock))return false;
 const fields=[brick.title,brick.id,r.brickAddress,r.originator,r.controller,r.transactionHash,r.contentHash,r.metadataDigest];
 if(brick.source==='road')fields.push(brick.creator,brick.description);
 return !q||fields.some(value=>lower(value).includes(q));
}
export function searchRegistryItems(items,filters,context={}){
 const matches=row=>matchesRegistrySearch(row,filters,context);
 const selected=items.filter(item=>item.rows.some(matches));
 const representative=item=>item.rows.filter(matches).sort((a,b)=>{
  const aa=BigInt(a.registration.blockNumber),bb=BigInt(b.registration.blockNumber);
  return aa===bb?0:filters.sort==='oldest'?(aa<bb?-1:1):(aa>bb?-1:1);
 })[0];
 return selected.sort((a,b)=>{
  const aa=representative(a),bb=representative(b);
  if(filters.sort==='title')return aa.title.localeCompare(bb.title)||aa.id.localeCompare(bb.id);
  const left=BigInt(aa.registration.blockNumber),right=BigInt(bb.registration.blockNumber);
  return left===right?0:filters.sort==='oldest'?(left<right?-1:1):(left>right?-1:1);
 });
}
export const SHORTLIST_KEY='road:registry-shortlist:v1';
export function readShortlist(storage){
 try{const value=JSON.parse(storage?.getItem(SHORTLIST_KEY)||'[]');return Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string'&&/^\d+:0x[\da-f]{40}:(?:0x[\da-f]{64})?:0x[\da-f]{40}:0x[\da-f]{64}:0x[\da-f]{64}$/.test(v)))].slice(0,200):[];}catch{return [];}
}
export function toggleShortlist(storage,key){
 const current=readShortlist(storage);
 if(!current.includes(key)&&current.length>=200)throw Error('Your shortlist is full. Remove a work before saving another.');
 const next=current.includes(key)?current.filter(value=>value!==key):[...current,key];
 storage.setItem(SHORTLIST_KEY,JSON.stringify(next));return next;
}
export const licenseScope=purpose=>purpose==='publishing'?'2':'1';
