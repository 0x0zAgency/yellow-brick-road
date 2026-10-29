import {getAddress,isAddress,keccak256,stringToHex,hashTypedData,parseAbi,zeroAddress,zeroHash} from 'viem';
export {zeroAddress,zeroHash};
export const OFFER_FIELDS=[['controller','address'],['licensee','address'],['receiver','address'],['deployment','address'],['asset','address'],['scope','uint8'],['projectHash','bytes32'],['termsHash','bytes32'],['unitPrice','uint128'],['units','uint64'],['expiresAt','uint64'],['deadline','uint64'],['epoch','uint64'],['nonce','bytes32'],['revocable','bool']].map(([name,type])=>({name,type}));
export const OFFER_TYPES={LicenseOffer:OFFER_FIELDS};
const offerTuple='('+OFFER_FIELDS.map(x=>x.type+' '+x.name).join(',')+')';
const policyTuple='(bool enabled,address asset,bytes32 termsHash,bytes32 projectHash,uint128 minUnitPrice,uint64 maxUnits,uint64 maxDuration,bool revocable,uint64 epoch,uint64 version)';
export const licensingAbi=parseAbi([
 'function projectLicensingVersion() view returns (uint8)',
 'function controller() view returns (address)',
 'function licensingContact() view returns (string email,uint64 version,address authority)',
 'function licensingDomainSalt() view returns (bytes32)',
 'function licensingEpoch() view returns (uint64)',
 'function licenseReceiver() view returns (address)',
 'function licensePayoutVersion() view returns (uint64)',
 'function licensePayout(uint64) view returns ((address recipient,uint16 bps)[])',
 'function configureLicensePayout(address[] recipients,uint16[] bps,uint64 expectedEpoch,uint64 expectedVersion)',
 'function autoLicensePolicy(uint8) view returns ('+policyTuple+')',
 'function setAutoLicensePolicy(uint8 scope,'+policyTuple+' next,uint64 expectedEpoch,uint64 expectedVersion)',
 'function licenseOfferDigest('+offerTuple+' offer) view returns (bytes32)',
 'function qualifiesForAutomaticLicense('+offerTuple+' offer) view returns (bool)',
 'function acceptProjectLicense('+offerTuple+' offer,bytes controllerSignature) payable returns (bytes32)',
 'function cancelLicenseOffer('+offerTuple+' offer)',
 'function cancelledLicenseOffers(bytes32) view returns (bool)',
 'function projectLicense(bytes32) view returns ((address licensee,address issuer,address receiver,address asset,uint8 scope,bytes32 projectHash,bytes32 termsHash,uint64 units,uint64 consumed,uint64 expiresAt,bool revocable,bool revoked,uint256 paid))',
 'function recordLicensedUse(bytes32 id,bytes32 usageId,uint64 units,bytes32 evidenceHash)',
 'function revokeProjectLicense(bytes32 id)',
 'function licenseClaimable(address asset,address recipient) view returns (uint256)',
 'function totalLicenseClaimable(address asset) view returns (uint256)',
 'function accountReceivedIPFunds(address asset)',
 'function claimIPFunds(address asset)',
 'event ProjectLicenseAccepted(bytes32 indexed licenseId,address indexed licensee,uint8 indexed scope,address receiver,address asset,uint256 paid,bytes32 projectHash,bytes32 termsHash)',
 'event LicensedUseRecorded(bytes32 indexed licenseId,bytes32 indexed usageId,uint64 units,bytes32 evidenceHash)',
 'event IPFundsClaimed(address indexed asset,address indexed recipient,uint256 amount)',
 ...['NotController','Reentrant','InvalidReceiver','StaleEpoch','StalePayout','PayoutCount','InvalidPayee','DuplicatePayee','SharesTotal10000','NotInitialized','NoUnallocatedFunds','NothingToClaim','ClaimFailed','InvalidScope','StalePolicy','IncompletePolicy','InvalidAsset','WrongParty','StaleOffer','IncompleteOffer','ExpiredOffer','SpentOrCancelled','ApprovalRequired','WrongPayment','TransferFeeAsset','AlreadyLicensed','InactiveLicense','MissingEvidence','DuplicateOrExhausted','NotRevocable'].map(name=>'error License'+name+'()')
]);
export const factoryAbi=parseAbi(['function isBrick(address) view returns (bool)']);
export const tokenAbi=parseAbi(['function decimals() view returns (uint8)','function symbol() view returns (string)','function allowance(address,address) view returns (uint256)','function approve(address,uint256) returns (bool)','function balanceOf(address) view returns (uint256)']);
export const json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);
export const textHash=text=>keccak256(stringToHex(text));
export const sameAddress=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const hash=value=>typeof value==='string'&&/^0x[0-9a-f]{64}$/i.test(value);
const cleanText=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw Error('Enter '+label+' (up to '+max+' characters).');return value.trim().replace(/\r\n/g,'\n');};
export function normalizeProject(value){
 return {title:cleanText(value?.title,200,'a project title'),description:cleanText(value?.description,4000,'a project description'),uri:typeof value?.uri==='string'?value.uri.trim().slice(0,1000):''};
}
export function normalizeEnvelope(raw){
 if(raw?.format!=='ybr-project-offer/1'||![1337,11155111].includes(raw.chainId))throw Error('Unsupported project offer or network.');
 if(!isAddress(raw.factory)||!isAddress(raw.brick)||!hash(raw.genesisHash)||!hash(raw.salt))throw Error('Offer chain identity is incomplete.');
 const project=normalizeProject(raw.project),terms=cleanText(raw.terms,16000,'the exact license terms'),offer={};
 for(const {name,type} of OFFER_FIELDS){const value=raw.offer?.[name];
  if(type==='address'){if(!isAddress(value)||name!=='asset'&&sameAddress(value,zeroAddress))throw Error('Invalid offer '+name+'.');offer[name]=getAddress(value);}
  else if(type==='bytes32'){if(!hash(value)||value===zeroHash)throw Error('Invalid offer '+name+'.');offer[name]=value.toLowerCase();}
  else if(type==='bool'){if(typeof value!=='boolean')throw Error('Invalid offer '+name+'.');offer[name]=value;}
  else {if(!/^\d+$/.test(String(value))||BigInt(value)>=2n**BigInt(type.slice(4)))throw Error('Invalid offer '+name+'.');offer[name]=BigInt(value).toString();}
 }
 if(!['1','2'].includes(offer.scope)||BigInt(offer.units)===0n||BigInt(offer.units)>1000000000n)throw Error('Choose ingestion or publishing and a positive unit quantity (at most one billion).');
 if(!sameAddress(offer.receiver,raw.brick))throw Error('IP funds must be received by the Brick itself.');
 if(offer.termsHash!==textHash(terms)||offer.projectHash!==textHash(json(project)))throw Error('The offer does not match its project or license terms.');
 return {format:raw.format,chainId:raw.chainId,factory:getAddress(raw.factory),brick:getAddress(raw.brick),genesisHash:raw.genesisHash.toLowerCase(),salt:raw.salt.toLowerCase(),project,terms,offer};
}
export function typedOffer(raw){const e=normalizeEnvelope(raw);return {domain:{name:'Yellow Brick Project License',version:'1',chainId:e.chainId,verifyingContract:e.brick,salt:e.salt},types:OFFER_TYPES,primaryType:'LicenseOffer',message:Object.fromEntries(OFFER_FIELDS.map(({name,type})=>[name,type.startsWith('uint')?BigInt(e.offer[name]):e.offer[name]]))};}
export const offerId=raw=>hashTypedData(typedOffer(raw));
export const offerArgs=raw=>typedOffer(raw).message;
export function makeEnvelope({profile,state,licensee,project,terms,asset=zeroAddress,unitPrice,units,expiresAt,deadline,scope,revocable=false,nonce}){
 project=normalizeProject(project);terms=cleanText(terms,16000,'the exact license terms');
 return normalizeEnvelope({format:'ybr-project-offer/1',chainId:profile.chainId,factory:profile.factoryAddress,genesisHash:profile.genesisHash,brick:state.brick,salt:state.salt,project,terms,
  offer:{controller:state.controller,licensee,receiver:state.brick,deployment:profile.walletAddress,asset,scope,projectHash:textHash(json(project)),termsHash:textHash(terms),unitPrice,units,expiresAt,deadline,epoch:state.epoch,nonce,revocable}});
}
export function validateOfferTime(envelope,now=Math.floor(Date.now()/1000)){
 const o=envelope.offer;
 if(BigInt(o.deadline)<=BigInt(now)||BigInt(o.deadline)>BigInt(now+30*86400)||BigInt(o.expiresAt)<=BigInt(now)||BigInt(o.expiresAt)>BigInt(now+10*365*86400))throw Error('Offer must expire within 30 days and the license within 10 years.');
}
