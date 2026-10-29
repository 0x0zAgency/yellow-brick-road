/** Explicit browser preferences for new registrations, not transaction authorization. */
import {defaultMintForm} from './mint-persistence.js';
import {DEFAULT_CONTENT_POLICY} from './content-policy.js';
export const CREATOR_DEFAULTS_KEY='road:creator-defaults:v1';
export function defaultCreatorDefaults(){
 const form=defaultMintForm();
 return {enabled:false,delivery:true,contentPolicy:{...DEFAULT_CONTENT_POLICY,locked:true},training:form.training,
  composition:form.composition,share:form.share,currency:form.currency,unit:form.unit,fees:{...form.fees}};
}
export function sanitizeCreatorDefaults(value){
 const clean=defaultCreatorDefaults();if(!value||typeof value!=='object'||Array.isArray(value))return clean;
 for(const key of ['enabled','delivery','composition'])if(typeof value[key]==='boolean')clean[key]=value[key];
 for(const key of Object.keys(clean.contentPolicy))if(typeof value.contentPolicy?.[key]==='boolean')clean.contentPolicy[key]=value.contentPolicy[key];
 if(['not-authorized','separate-license','licensed-with-terms'].includes(value.training))clean.training=value.training;
 if(['USD','USDC'].includes(value.currency))clean.currency=value.currency;
 if(['per-1000-outputs','per-output','per-model-deployment'].includes(value.unit))clean.unit=value.unit;
 if(Number.isInteger(value.share)&&value.share>=0&&value.share<=10000)clean.share=value.share;
 for(const key of Object.keys(clean.fees))if(Number.isInteger(value.fees?.[key])&&value.fees[key]>=0&&value.fees[key]<=(key.includes('Ingestion')?100000:25000))clean.fees[key]=value.fees[key];
 return clean;
}
export function loadCreatorDefaults(storage){
 try{const raw=storage?.getItem(CREATOR_DEFAULTS_KEY);if(!raw||raw.length>8192)return defaultCreatorDefaults();
  const parsed=JSON.parse(raw);return parsed.version===1?sanitizeCreatorDefaults(parsed.data):defaultCreatorDefaults();
 }catch{return defaultCreatorDefaults();}
}
export function saveCreatorDefaults(storage,value){
 const clean=sanitizeCreatorDefaults(value);
 if(!storage?.setItem)throw Error('Browser storage is unavailable. Creator defaults were not saved.');
 storage.setItem(CREATOR_DEFAULTS_KEY,JSON.stringify({version:1,data:clean}));return clean;
}
export function applyCreatorDefaults(form,defaults){
 if(!defaults.enabled)return form;
 return {...form,...Object.fromEntries(['training','composition','share','currency','unit'].map(key=>[key,defaults[key]])),fees:{...defaults.fees}};
}
export const initialContentPolicy=defaults=>({... (defaults.enabled?defaults.contentPolicy:DEFAULT_CONTENT_POLICY)});
export function defaultDeliveryApproved({defaults,choice,consent,scope,assets,policy}){
 return !!(assets.preview?.hash&&policy.preview&&(consent===scope||choice==='default'&&defaults.enabled&&defaults.delivery));
}
