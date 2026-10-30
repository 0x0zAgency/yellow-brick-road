import {applyBrickReuse} from './reuse-bricks.js';
import {songwriterNames,validateSongwriterSplits,songwritingPayout} from './songwriter-splits.js';
import {normalizeLicensingEmail} from './licensing-contact.js';
import {releaseProposal,bindBuildingToBricks} from './release-buildings.js';
import {addContentPolicy} from './content-policy.js';
import {normalizeMusicGenre} from './music-genres.js';
/** Pure model for creator-side registration packets. No chain or upload operations. */
import {getIpCategory,spatialEvidence} from "./ip-catalog.js";
export const assetSlots=[
 {id:'master',label:'Master recording',accept:'*/*',required:true,visibility:'encrypted',brick:'master'},
 {id:'preview',label:'MP3 / listener preview',accept:'*/*',required:false,visibility:'public',brick:'master'},
 {id:'artwork',label:'Cover artwork',accept:'*/*',required:false,visibility:'public',brick:'artwork'},
 {id:'lyrics',label:'Lyrics manuscript / writing evidence',accept:'*/*',required:false,visibility:'encrypted',brick:'composition'},
 {id:'project',label:'Project File / native DAW project',accept:'*/*',required:false,visibility:'encrypted',brick:'master'},
 {id:'metadata',label:'Metadata text / JSON',accept:'*/*',required:false,visibility:'encrypted',brick:'master'}
];
/** File roles vary by IP category. Only a primary work is universally required. */
export function availableAssetSlots(categoryId='sound-recording'){
 const category=getIpCategory(categoryId);
 // Optional lyrics can be attached with a recording; the model places them
 // in the separately attributed songwriting Brick when a composition is created.
 if(category.group==='Music & audio')return assetSlots;
 return assetSlots.filter(slot=>slot.id!=='preview'&&slot.id!=='artwork'&&slot.id!=='lyrics');
}
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
 return {role:slot.id,name:item.name,mediaType:item.type||'application/octet-stream',byteLength:item.size,integrity:{algorithm:'sha2-256',digest:'0x'+item.hash},access:{visibility:item.encryption?.sha256?'encrypted':slot.visibility,
  storageStatus:item.ipfsUpload?.verified?'ipfs-pinned-ciphertext':item.demoUpload?'demo-simulated-not-uploaded':'not-uploaded',
  encryption:item.encryption?.sha256?(item.ipfsUpload?.verified?'AES-256-GCM / ybr-ipfs-pilot':item.demoUpload?'AES-256-GCM / demo-vault':'AES-256-GCM / local-exported'):(slot.visibility==='encrypted'?'required-before-upload':'none'),
  ciphertextDigest:item.encryption?.sha256?'0x'+item.encryption.sha256:null,demoReceipt:item.ipfsUpload?null:item.demoUpload?.receiptId||null},
  cid:item.ipfsUpload?.verified?item.ipfsUpload.cid:null,
  ...(item.extracted?{extractedMetadata:{title:item.extracted.fields.title,technical:item.extracted.technical,source:item.extracted.parser,status:'unverified-file-metadata'}}:{})};
}
export function validateMintInput({metadata,assets,identity,royalties,licensing={},cover={},linkedBricks=[],songwriterSplits=null,composition=true,reusedBricks={}}){
 const errors=[];
 try{normalizeLicensingEmail(licensing.email);}catch(e){errors.push(e.message);}
 if(getIpCategory(metadata.ipCategory||'sound-recording').group==='Music & audio'&&normalizeMusicGenre(metadata.genre)===null)errors.push('Select an approved music genre, Other, or leave genre blank.');
 if(!(metadata.title||'').trim())errors.push('Work title is required.');
 if(!(metadata.artist||'').trim())errors.push('Artist / claimant is required.');
 if(!assets.master?.hash)errors.push('A hashed primary work file is required.');
 if(assets.artwork?.hash&&!reusedBricks.artwork){
  // The recording artist creates their own cover by default. An explicit separate
  // artist is only required after opting out of that default.
  const selfCover=cover.useMainArtist===true||(cover.useMainArtist!==false&&!String(cover.artist||'').trim());
  if(!selfCover){
   if(!String(cover.artist||'').trim())errors.push('Enter the cover artist name or choose "Recording artist created the cover".');
   if(identity.mode==='external'&&(!isEvmAddress(cover.wallet)||cover.wallet.toLowerCase()!==identity.address?.toLowerCase()))
    errors.push('Mint new cover art only from its artist wallet; otherwise link the existing art Brick and obtain consent.');
   if(cover.wallet&&!isEvmAddress(cover.wallet))errors.push('Enter a valid cover artist wallet address.');
  }
  if(linkedBricks.some(l=>l.relation==='cover-art'))errors.push('Use either uploaded cover art or a linked cover Brick, not both.');
 }
 for(const link of linkedBricks){
  if(!isEvmAddress(link.targetBrick)||!isEvmAddress(link.factory))errors.push('Every external Brick reference must have a valid Brick and factory address.');
  if(!String(link.scope||'').trim())errors.push('Specify the requested usage scope for every linked Brick.');
 }
 if(availableAssetSlots(metadata.ipCategory).some(slot=>slot.id==='lyrics')&&assets.lyrics?.hash&&linkedBricks.some(l=>l.relation==='embodies-composition'||l.relation==='lyrics'))errors.push('A separate writer Brick owns linked lyrics evidence. Remove the local lyrics attachment or use a new writing Brick.');
 const writers=songwriterNames(metadata.songwriters);
 const writing=composition&&getIpCategory(metadata.ipCategory||'sound-recording').musical&&!reusedBricks.composition&&!linkedBricks.some(l=>l.relation==='embodies-composition');
 if(writing&&writers.length>1)errors.push(...validateSongwriterSplits(songwriterSplits,writers,{walletRequired:identity.mode==='external'}));
 if(identity.mode==='external'&&writing&&writers.length===1){
  if(writers.some(name=>name.toLowerCase()!==String(metadata.artist||'').trim().toLowerCase()))
   errors.push('Another songwriter is credited. Link their composition Brick with signed approval rather than minting their work from this wallet.');
 }
 if(new Set(linkedBricks.map(l=>l.relation+':'+String(l.targetBrick).toLowerCase())).size!==linkedBricks.length)
  errors.push('Duplicate Brick references are not allowed.');
 if(availableAssetSlots(metadata.ipCategory).some(slot=>assets[slot.id]?.status==='hashing'))errors.push('Wait for file hashing to finish.');
 if(!identity.connected&&identity.mode==='external')errors.push('Connect an EVM wallet or select the assisted demo.');
 if(identity.mode==='external'&&!isEvmAddress(identity.address))errors.push('A valid 20-byte EVM wallet address is required.');
 if(!Number.isInteger(Number(royalties.creatorBps))||Number(royalties.creatorBps)<0||Number(royalties.creatorBps)>10000)errors.push('Royalty share must be between 0 and 100%.');
 return errors;
}
export function makeRegistrationPacket({metadata,assets,identity,royalties,training,composition,storage,licensing={},cover={},linkedBricks=[],contentPolicy=null,songwriterSplits=null,reusedBricks={}},now='2026-01-01T00:00:00.000Z'){
 const category=getIpCategory(metadata.ipCategory||'sound-recording');
 if(category.group==='Music & audio'&&normalizeMusicGenre(metadata.genre)===null)throw Error('Select an approved music genre before creating the registration packet.');
 const files=availableAssetSlots(category.id).map(slot=>assetRecord(slot,assets[slot.id])).filter(Boolean);
 const namespace='https://0x0z.org/road/metadata/v1';
 const denomination=['USD','USDC'].includes(licensing.currency)?licensing.currency:'USD';
 const useUnit=['per-1000-outputs','per-output','per-model-deployment'].includes(licensing.useUnit)?licensing.useUnit:'per-1000-outputs';
 const moneyCents=n=>Number.isInteger(Number(n))&&Number(n)>=0&&Number(n)<=100000000?Number(n):0;
 const licenseQuote=kind=>({status:'draft-only-not-an-authorization',denomination,ingestion:{amountCents:moneyCents(kind==='writing'?licensing.writingIngestionCents:licensing.masterIngestionCents),unit:'per-dataset-inclusion'},use:{amountCents:moneyCents(kind==='writing'?licensing.writingUseCents:licensing.masterUseCents),unit:useUnit}});
 const licensingEmail=normalizeLicensingEmail(licensing.email);
 const common={standard:'0x0z-road-ip',schemaVersion:'1.0.0',schema:namespace,provenance:{recordedAt:now,sourceApplication:category.musical?(metadata.daw||'Unknown DAW'):'Creator-declared source',authStatus:identity.mode==='external'?'wallet-to-be-signed':'assisted-wallet-pending'},creators:[{name:metadata.artist.trim(),role:'primary-artist',wallet:isEvmAddress(identity.address)?identity.address:null,alias:aliasFor(metadata.artist)}],rights:{...(licensingEmail?{licensingContact:{email:licensingEmail}}:{}),ownershipStatus:'self-declared-not-verified',territories:['worldwide'],aiTraining:{mode:training,requiresAttribution:training==='licensed-with-terms',generationRoyalties:'by-separate-agreement'}},extensions:{}};
 const master={...common,objectType:category.objectType,ipCategory:category.id,categoryLabel:category.label,title:metadata.title.trim(),description:metadata.description||'',identifiers:{isrc:category.musical?(metadata.isrc||null):null,iswc:null,upc:null},music:category.musical?{release:metadata.release||null,genre:normalizeMusicGenre(metadata.genre)||null,bpm:metadata.bpm?Number(metadata.bpm):null,key:metadata.key||null,daw:metadata.daw||'Unknown DAW'}:category.group==='Music & audio'?{genre:normalizeMusicGenre(metadata.genre)||null}:undefined,proposedAiLicense:licenseQuote('master'),media:files.filter(x=>x.role!=='artwork'&&x.role!=='lyrics'),relationships:[],payout:{type:'proposed-split',shares:[{party:metadata.artist.trim(),bps:Number(royalties.creatorBps)},{party:'Additional rights holders (specify before signing)',bps:10000-Number(royalties.creatorBps)}].filter(x=>x.bps>0)}};
 if(category.spatial){
  master.evidence={...spatialEvidence(metadata.spatial||{},now),
    sourceMedia:files.filter(f=>f.role!=='artwork').map(f=>({role:f.role,digest:f.integrity.digest,algorithm:f.integrity.algorithm})),
    registrationDateMeaning:'Claimed first capture or performance dates are unverified; registration timestamps are not proof of first creation.'};
 }
 if(category.writers){
  const names=String(metadata.songwriters||'').split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
  if(names.length)master.creators=names.slice(0,64).map(name=>({name,role:'writer',wallet:null,claimStatus:'unverified'}));
  else master.rights={...master.rights,ownershipStatus:'attribution-pending'};
 }
 const localComposition=composition&&category.musical&&!linkedBricks.some(l=>l.relation==='embodies-composition');
 // Do not silently drop an attached lyric manuscript when a separate composition is not being minted.
 if(!localComposition)master.media=files.filter(x=>x.role!=='artwork');
 const bricks=[{localId:'master',role:category.label,metadata:master}];
 if(files.some(x=>x.role==='artwork')){

  const selfCover=cover.useMainArtist===true||(cover.useMainArtist!==false&&!String(cover.artist||'').trim());
  const coverArtist=selfCover?metadata.artist.trim():String(cover.artist||'').trim();
  const coverWallet=selfCover?identity.address:cover.wallet;
  const coverTitle=String(cover.title||metadata.title.trim()+' — cover art').trim();
  bricks.push({localId:'artwork',role:'Cover artwork',metadata:{...common,objectType:'visual-artwork',ipCategory:cover.ipCategory||'illustration',
   categoryLabel:'Cover artwork',title:coverTitle,description:String(cover.description||'').slice(0,8000),
   creators:[{name:coverArtist,role:'visual-artist',wallet:isEvmAddress(coverWallet)?coverWallet:null,alias:aliasFor(coverArtist),claimStatus:'creator-declared-not-verified'}],
   rights:{...common.rights,ownershipStatus:'cover-artist-declared-not-verified'},identifiers:{},media:files.filter(x=>x.role==='artwork'),relationships:[],
   payout:{type:'rights-holder-split-pending',shares:[]}}});
  master.relationships.push({type:'cover-art',target:'artwork',context:'release-artwork',authorization:'license-needed'});
 }
 if(localComposition){
  // Writing is separate IP. A performing artist is not assumed to be the songwriter.
  const songwriters=songwriterNames(metadata.songwriters).slice(0,64);
  const writingCreators=songwriters.map(name=>({name,role:'songwriter',wallet:null,alias:null,claimStatus:'unverified'}));
  bricks.push({localId:'composition',role:'Songwriting / musical work',metadata:{...common,creators:writingCreators,rights:{...common.rights,ownershipStatus:songwriters.length?'self-declared-not-verified':'attribution-pending'},objectType:'musical-work',title:metadata.title.trim(),identifiers:{iswc:metadata.iswc||null},proposedAiLicense:licenseQuote('writing'),payout:songwriters.length>1&&songwriterSplits&&!reusedBricks.composition?songwritingPayout(songwriterSplits,songwriters):{type:'songwriter-split-pending',shares:[]},media:files.filter(x=>x.role==='lyrics'),relationships:[]}});
  master.relationships.push({type:'embodies-composition',target:'composition',context:'recording-embodies-work',authorization:'rights-review'});
 }
 // Cross-wallet references are approval requests until the owner's EIP-712 signature
 // is verified at mint time. A signature is not a DSP license or on-chain link.
 for(const link of linkedBricks){
  master.relationships.push({type:link.relation,target:link.targetBrick,targetBrick:link.targetBrick,factory:link.factory,
   scope:link.scope,authorization:link.response?'controller-signature-supplied-offchain-validation-required':'pending-current-controller-signature'});
 }
 const building={...releaseProposal(bricks,{music:category.group==='Music & audio',name:metadata.title.trim(),createdAt:now,account:identity.address}),
  context:{daw:category.musical?(metadata.daw||'Unknown DAW'):null,purpose:category.musical?'creation-and-release':'creative-registration',rightsEvidence:'requires-signed-authorizations'}};
 return {packetType:'LOCAL_PREVIEW_NOT_MINTED',createdAt:now,linkAuthorizations:linkedBricks.map(l=>({id:l.id,relation:l.relation,request:l.request||null,response:l.response||null})),account:{mode:identity.mode,alias:aliasFor(metadata.artist),ensName:(isEvmAddress(identity.address)&&identity.ensName)||null,address:isEvmAddress(identity.address)?identity.address:null,assistedBatchStatus:identity.mode==='assisted'?'not-requested':null},storage:{mode:storage,approvedProvider:false,uploaded:files.some(f=>f.access.storageStatus==='ipfs-pinned-ciphertext'),encrypted:files.some(f=>f.access.storageStatus==='ipfs-pinned-ciphertext'),encryptedLocally:files.some(f=>!!f.access.ciphertextDigest),demoUploadSimulated:files.some(f=>!!f.access.demoReceipt),encryptedIpfsReceipts:files.filter(f=>f.cid).map(f=>({role:f.role,cid:f.cid,digest:f.access.ciphertextDigest,provider:'ybr-local-kubo'})),demoUploadReceipts:files.filter(f=>f.access.demoReceipt).map(f=>({role:f.role,receipt:f.access.demoReceipt,provider:'none',cid:null})),clientSideEncryptedAssets:files.filter(f=>f.access.ciphertextDigest).map(f=>({role:f.role,digest:f.access.ciphertextDigest}))},bricks:applyBrickReuse(addContentPolicy(bindBuildingToBricks(bricks,building),contentPolicy),reusedBricks),building,notices:['All demo upload receipts are simulated in-browser only. No files are transmitted or hosted; no token-gated access exists.','No wallets created, contracts deployed, or licenses granted.','IP registration is not evidence of legal title.','Signing and royalty recipient verification required before production.']};
}
