/** Pure model for creator-side registration packets. No chain or upload operations. */
export const assetSlots=[
 {id:'master',label:'Master recording',accept:'*/*',required:true,visibility:'encrypted',brick:'master'},
 {id:'preview',label:'MP3 / listener preview',accept:'*/*',required:false,visibility:'public',brick:'master'},
 {id:'artwork',label:'Cover artwork',accept:'*/*',required:false,visibility:'public',brick:'artwork'},
 {id:'project',label:'Project File / native DAW project',accept:'*/*',required:false,visibility:'encrypted',brick:'master'},
 {id:'metadata',label:'Metadata text / JSON',accept:'*/*',required:false,visibility:'encrypted',brick:'master'}
];
export const trainingModes=[
 {value:'not-authorized',label:'No AI training permission'},
 {value:'separate-license',label:'Separate signed training license required'},
 {value:'licensed-with-terms',label:'Authorized under documented terms'}
];
export function isEvmAddress(value){return /^0x[0-9a-fA-F]{40}$/.test(value||'')}
export function aliasFor(handle){const h=(handle||'creator').toLowerCase().normalize('NFKD').replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,32);return '0x0z:'+ (h||'creator')}
export function parseMetadataText(text){
 const input=String(text||'').trim();if(!input)return {};
 try{const obj=JSON.parse(input);if(obj&&typeof obj==='object'&&!Array.isArray(obj))return obj}catch{}
 return Object.fromEntries(input.split(/\r?\n/).map(line=>{const pos=line.indexOf(':');return pos>0?[line.slice(0,pos).trim().toLowerCase().replace(/\s+/g,'_'),line.slice(pos+1).trim()]:null}).filter(x=>x&&x[0]));
}
export function assetRecord(slot,item){
 if(!item?.hash)return null;
 return {role:slot.id,name:item.name,mediaType:item.type||'application/octet-stream',byteLength:item.size,integrity:{algorithm:'sha2-256',digest:'0x'+item.hash},access:{visibility:slot.visibility,storageStatus:'not-uploaded',encryption:slot.visibility==='encrypted'?(item.encryption?.sha256?'AES-256-GCM / local-exported':'required-before-upload'):'none',ciphertextDigest:item.encryption?.sha256?'0x'+item.encryption.sha256:null},cid:null};
}
export function validateMintInput({metadata,assets,identity,royalties}){
 const errors=[];
 if(!(metadata.title||'').trim())errors.push('Track title is required.');
 if(!(metadata.artist||'').trim())errors.push('Artist / claimant is required.');
 if(!assets.master?.hash)errors.push('A hashed master audio file is required.');
 if(Object.values(assets).some(a=>a?.status==='hashing'))errors.push('Wait for file hashing to finish.');
 if(!identity.connected&&identity.mode==='external')errors.push('Connect an EVM wallet or select the assisted demo.');
 if(identity.mode==='external'&&!isEvmAddress(identity.address))errors.push('A valid 20-byte EVM wallet address is required.');
 if(!Number.isInteger(Number(royalties.creatorBps))||Number(royalties.creatorBps)<0||Number(royalties.creatorBps)>10000)errors.push('Royalty share must be between 0 and 100%.');
 return errors;
}
export function makeRegistrationPacket({metadata,assets,identity,royalties,training,composition,storage,licensing={}},now='2026-01-01T00:00:00.000Z'){
 const files=assetSlots.map(slot=>assetRecord(slot,assets[slot.id])).filter(Boolean);
 const namespace='https://0x0z.org/road/metadata/v1';
 const denomination=['USD','USDC'].includes(licensing.currency)?licensing.currency:'USD';
 const useUnit=['per-1000-outputs','per-output','per-model-deployment'].includes(licensing.useUnit)?licensing.useUnit:'per-1000-outputs';
 const moneyCents=n=>Number.isInteger(Number(n))&&Number(n)>=0&&Number(n)<=100000000?Number(n):0;
 const licenseQuote=kind=>({status:'draft-only-not-an-authorization',denomination,ingestion:{amountCents:moneyCents(kind==='writing'?licensing.writingIngestionCents:licensing.masterIngestionCents),unit:'per-dataset-inclusion'},use:{amountCents:moneyCents(kind==='writing'?licensing.writingUseCents:licensing.masterUseCents),unit:useUnit}});
 const common={standard:'0x0z-road-ip',schemaVersion:'1.0.0',schema:namespace,provenance:{recordedAt:now,sourceApplication:metadata.daw||'Unknown DAW',authStatus:identity.mode==='external'?'wallet-to-be-signed':'assisted-wallet-pending'},creators:[{name:metadata.artist.trim(),role:'primary-artist',wallet:isEvmAddress(identity.address)?identity.address:null,alias:aliasFor(metadata.artist)}],rights:{ownershipStatus:'self-declared-not-verified',territories:['worldwide'],aiTraining:{mode:training,requiresAttribution:training==='licensed-with-terms',generationRoyalties:'by-separate-agreement'}},extensions:{}};
 const master={...common,objectType:'sound-recording',title:metadata.title.trim(),description:metadata.description||'',identifiers:{isrc:metadata.isrc||null,iswc:null,upc:null},music:{release:metadata.release||null,genre:metadata.genre||null,bpm:metadata.bpm?Number(metadata.bpm):null,key:metadata.key||null,daw:metadata.daw||'Unknown DAW'},proposedAiLicense:licenseQuote('master'),media:files.filter(x=>x.role!=='artwork'),relationships:[],payout:{type:'proposed-split',shares:[{party:metadata.artist.trim(),bps:Number(royalties.creatorBps)},{party:'Additional rights holders (specify before signing)',bps:10000-Number(royalties.creatorBps)}].filter(x=>x.bps>0)}};
 const bricks=[{localId:'master',role:'Sound recording / master',metadata:master}];
 if(files.some(x=>x.role==='artwork')){
  bricks.push({localId:'artwork',role:'Cover artwork',metadata:{...common,objectType:'visual-artwork',title:metadata.title.trim()+' — cover art',identifiers:{},media:files.filter(x=>x.role==='artwork'),relationships:[]}});
  master.relationships.push({type:'cover-art',target:'artwork',context:'release-artwork',authorization:'license-needed'});
 }
 if(composition){
  // Writing is separate IP. A performing artist is not assumed to be the songwriter.
  const songwriters=String(metadata.songwriters||'').split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean).slice(0,64);
  const writingCreators=songwriters.map(name=>({name,role:'songwriter',wallet:null,alias:null,claimStatus:'unverified'}));
  bricks.push({localId:'composition',role:'Songwriting / musical work',metadata:{...common,creators:writingCreators,rights:{...common.rights,ownershipStatus:songwriters.length?'self-declared-not-verified':'attribution-pending'},objectType:'musical-work',title:metadata.title.trim(),identifiers:{iswc:metadata.iswc||null},proposedAiLicense:licenseQuote('writing'),payout:{type:'songwriter-split-pending',shares:[]},media:[],relationships:[]}});
  master.relationships.push({type:'embodies-composition',target:'composition',context:'recording-embodies-work',authorization:'rights-review'});
 }
 const building={standard:'0x0z-road-building',schemaVersion:'1.0.0',type:'recording-session',name:metadata.title.trim()+' / session',members:bricks.map(b=>({ref:b.localId,role:b.role,permission:'unverified'})),context:{daw:metadata.daw||'Unknown DAW',purpose:'creation-and-release',rightsEvidence:'requires-signed-authorizations'}};
 return {packetType:'LOCAL_PREVIEW_NOT_MINTED',createdAt:now,account:{mode:identity.mode,alias:aliasFor(metadata.artist),ensName:(isEvmAddress(identity.address)&&identity.ensName)||null,address:isEvmAddress(identity.address)?identity.address:null,assistedBatchStatus:identity.mode==='assisted'?'not-requested':null},storage:{mode:storage,approvedProvider:false,uploaded:false,encrypted:false,clientSideEncryptedAssets:files.filter(f=>f.access.ciphertextDigest).map(f=>({role:f.role,digest:f.access.ciphertextDigest}))},bricks,building,notices:['No files uploaded by this prototype. Local encrypted exports are not token-gated or published.','No wallets created, contracts deployed, or licenses granted.','IP registration is not evidence of legal title.','Signing and royalty recipient verification required before production.']};
}
