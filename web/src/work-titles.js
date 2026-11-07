/** Display labels only. Local titles never publish metadata or establish rights. */
const lower=value=>String(value||'').toLowerCase();
export function cleanWorkTitle(value){
 if(typeof value!=='string')return '';
 const title=value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,1024);
 return /^0x[\da-f]{40,64}$/i.test(title)?'':title;
}
export const displayWorkTitle=row=>cleanWorkTitle(row?.workTitle)||(row?.source!=='road-registry'?cleanWorkTitle(row?.title):'')||'Registered work';
export function workTitleKey(scope,row){
 const r=row.registration||row;
 if(!scope||!Number.isSafeInteger(Number(scope.chainId))||!/^0x[\da-f]{64}$/i.test(scope.genesisHash||''))return '';
 const fields=[scope.factoryAddress,r.brickAddress||r.address,r.ipId,r.metadataDigest];
 if(!fields.every((v,i)=>new RegExp('^0x[\\da-f]{'+(i<2?40:64)+'}$','i').test(v||'')))return '';
 return [scope.chainId,scope.genesisHash,...fields].map(lower).join(':');
}
export function applyWorkTitles(rows,index,bindings,scope,wallet){
 const known=new Map();
 // Only exact chain/history/factory/Brick/IP/metadata matches can supply a label.
 for(const record of index)for(const member of record.members){
  const key=workTitleKey(record,member),title=cleanWorkTitle(member.title);
  if(key&&title&&!known.has(key))known.set(key,title);
 }
 // Recovery bindings include confirmed editor titles and override older packet labels.
 for(const binding of [...bindings].sort((a,b)=>(a.updatedAt||0)-(b.updatedAt||0))){
  const key=workTitleKey(binding,binding),title=cleanWorkTitle(binding.title);
  if(key&&title&&lower(binding.wallet)===lower(wallet))known.set(key,title);
 }
 return rows.map(row=>{
  const r=row.registration||row,owned=wallet&&[r.originator,r.controller].some(v=>lower(v)===lower(wallet));
  const local=owned?known.get(workTitleKey(scope,row)):'';
  const title=local||(row.source!=='road-registry'?cleanWorkTitle(row.title):'');
  return {...row,workTitle:title||'',workTitleSource:local?'local':title?'public':''};
 });
}
