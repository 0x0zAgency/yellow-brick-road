/** Local-only Mint Studio preferences.
 * Deliberately excludes uploaded bytes, hashes, cipher material, keys,
 * browser-wallet identity, signed packets and on-chain receipts.
 * localStorage is not encryption: other scripts running on this origin can read it.
 */
import {IP_CATEGORIES,SPATIAL_FIELDS} from './ip-catalog.js';
import {trainingModes} from './mint-model.js';

export const MINT_FORM_KEY='road:mint:form:v1';
export const MINT_SETTINGS_KEY='road:mint:network:v1';
const META_FIELDS=['title','artist','songwriters','daw','release','genre','bpm','key','isrc','iswc','description'];
const FEE_FIELDS=['masterIngestionCents','masterUseCents','writingIngestionCents','writingUseCents'];
const VALID_TYPES=new Set(IP_CATEGORIES.map(x=>x.id));
const SPATIAL_KEYS=SPATIAL_FIELDS.map(x=>x.id);
const TRAINING=new Set(trainingModes.map(x=>x.value));
const UNITS=new Set(['per-1000-outputs','per-output','per-model-deployment']);
const MAX_FORM_BYTES=32000;
const MAX_SETTINGS_BYTES=20000;
const text=(value,max=1024)=>typeof value==='string'?value.slice(0,max):'';
const bounded=(value,min,max,fallback)=>Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):fallback;
const defaults={
 meta:{title:'',artist:'',songwriters:'',daw:'FL Studio',release:'',genre:'',bpm:'',key:'',isrc:'',iswc:'',description:''},
 ipCategoryId:'sound-recording',spatial:{},cover:{artist:'',title:'',description:'',wallet:'',ipCategory:'illustration'},composition:true,training:'separate-license',
 share:10000,currency:'USDC',unit:'per-1000-outputs',
 fees:{masterIngestionCents:10000,masterUseCents:500,writingIngestionCents:5000,writingUseCents:250}
};
const networkDefaults={
 network:'ganache',rpcUrl:'http://127.0.0.1:8545',ganacheChainId:'1337',rememberForm:true,
 factories:{'ganache:1337:http://127.0.0.1:8545':'','sepolia:11155111':''}
};
export const defaultMintForm=()=>JSON.parse(JSON.stringify(defaults));
export const defaultMintNetwork=()=>JSON.parse(JSON.stringify(networkDefaults));
export function sanitizeMintForm(value={}){
 const clean=defaultMintForm();
 if(!value||typeof value!=='object'||Array.isArray(value))return clean;
 for(const key of META_FIELDS)clean.meta[key]=text(value.meta?.[key],key==='description'?8000:1024)||(key==='daw'?'FL Studio':'');
 if(VALID_TYPES.has(value.ipCategoryId))clean.ipCategoryId=value.ipCategoryId;
 for(const key of SPATIAL_KEYS){const field=text(value.spatial?.[key],512);if(field)clean.spatial[key]=field;}
 if(value.cover&&typeof value.cover==='object'&&!Array.isArray(value.cover)){
  for(const field of ['artist','title','description','wallet'])clean.cover[field]=text(value.cover[field],field==='description'?8000:1024);
  if(['illustration','photograph','digital-art','painting'].includes(value.cover.ipCategory))clean.cover.ipCategory=value.cover.ipCategory;
 }
 if(typeof value.composition==='boolean')clean.composition=value.composition;
 if(TRAINING.has(value.training))clean.training=value.training;
 clean.share=bounded(value.share,0,10000,10000);
 if(value.currency==='USD'||value.currency==='USDC')clean.currency=value.currency;
 if(UNITS.has(value.unit))clean.unit=value.unit;
 for(const key of FEE_FIELDS)clean.fees[key]=bounded(value.fees?.[key],0,100000000,clean.fees[key]);
 return clean;
}
export function sanitizeMintNetwork(value={}){
 const clean=defaultMintNetwork();
 if(!value||typeof value!=='object'||Array.isArray(value))return clean;
 if(value.network==='ganache'||value.network==='sepolia')clean.network=value.network;
 if(typeof value.rememberForm==='boolean')clean.rememberForm=value.rememberForm;
 const url=text(value.rpcUrl,255);
 try{const u=new URL(url);if((u.protocol==='http:'||u.protocol==='https:')&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&!u.username&&!u.password)clean.rpcUrl=url;}catch{}
 const id=text(value.ganacheChainId,12);
 if(/^\d+$/.test(id)&&Number.isSafeInteger(Number(id))&&Number(id)>0)clean.ganacheChainId=id;
 if(value.factories&&typeof value.factories==='object'&&!Array.isArray(value.factories)){
  for(const [key,addr] of Object.entries(value.factories).slice(0,60)){
   if((key==='sepolia:11155111'||/^ganache:\d{1,12}:https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:\/[\w.\-]*)?$/.test(key))&&typeof addr==='string'&&addr.length<=42){
    clean.factories[key]=addr;
   }
  }
 }
 return clean;
}
function getItem(store,key,max){
 try{const input=store?.getItem(key);if(!input||input.length>max)return null;return JSON.parse(input);}catch{return null;}
}
export function loadMintForm(store){const raw=getItem(store,MINT_FORM_KEY,MAX_FORM_BYTES);return raw?.version===1?sanitizeMintForm(raw.data):null;}
export function loadMintNetwork(store){const raw=getItem(store,MINT_SETTINGS_KEY,MAX_SETTINGS_BYTES);return raw?.version===1?sanitizeMintNetwork(raw.data):defaultMintNetwork();}
function put(store,key,value){try{store?.setItem(key,JSON.stringify({version:1,data:value}));return !!store;}catch{return false;}}
export function saveMintForm(store,value){return put(store,MINT_FORM_KEY,sanitizeMintForm(value));}
export function saveMintNetwork(store,value){return put(store,MINT_SETTINGS_KEY,sanitizeMintNetwork(value));}
export function clearMintForm(store){try{store?.removeItem(MINT_FORM_KEY);return true;}catch{return false;}}
export function clearMintNetwork(store){try{store?.removeItem(MINT_SETTINGS_KEY);return true;}catch{return false;}}
