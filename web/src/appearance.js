/** Presentation only. No wallets, RPC credentials, rights or recovery keys belong here. */
import {validateNftCoverPng} from './nft-cover-format.js';
import {PALETTE} from './appearance-palette.js';
export {PALETTE};
export const APPEARANCE_KEY='road:appearance:v1';
export const MAX_IMPORT_BYTES=1024*1024,MAX_STORE_BYTES=2*1024*1024,MAX_THEMES=8;
export const COLOR_FIELDS={background:'Page background',sidebar:'Sidebar',surface:'Panels and cards',input:'Inputs',border:'Borders',text:'Primary text',muted:'Secondary text',accent:'Primary accent',onAccent:'Text on accent',secondary:'Secondary accent',success:'Success',warning:'Warning',danger:'Error',overlay:'Overlay and shadow'};
export const BASE_COLORS={background:'#0c1015',sidebar:'#131820',surface:'#1b272f',input:'#111820',border:'#3e4c50',text:'#eeeeee',muted:'#adbac1',accent:'#edcb80',onAccent:'#252118',secondary:'#8abed2',success:'#b5e8cb',warning:'#ffdc9e',danger:'#f0a5a5',overlay:'#000000'};
export const ICON_OPTIONS=['book','dashboard','music','wallet','file','bricks','building','coins','shield','network','settings','image','sparkles','disc','headphones','folder','palette','leaf'];
export const ICON_FIELDS={manifesto:'Manifesto',overview:'Overview',mint:'Mint Studio','wallet-bricks':'My Bricks',recovery:'Recover files',bricks:'IP Registry',buildings:'Buildings',royalties:'Licenses and royalties',governance:'Governance',network:'Road network',settings:'Settings',player:'YBR Player',placeholder:'Missing artwork',building:'Building cards',audio:'Audio works',visual:'Visual works',writing:'Written works'};
export const BASE_ICONS={manifesto:'book',overview:'dashboard',mint:'music','wallet-bricks':'wallet',recovery:'file',bricks:'bricks',buildings:'building',royalties:'coins',governance:'shield',network:'network',settings:'settings',player:'headphones',placeholder:'building',building:'building',audio:'music',visual:'image',writing:'file'};
export function defaultTheme(){return {name:'Original Gold',colors:{...BASE_COLORS},overrides:{},icons:{...BASE_ICONS},graphics:{logo:null,background:null,placeholder:null},backgroundOpacity:0.12,iconWeight:1.75,reduceMotion:false};}
export const PRESETS=[
 defaultTheme(),
 {...defaultTheme(),name:'Neon Road',colors:{...BASE_COLORS,background:'#090816',sidebar:'#121025',surface:'#1d1935',input:'#100e20',border:'#51426e',text:'#f7f0ff',muted:'#b4a6cf',accent:'#fff235',onAccent:'#141222',secondary:'#18e5ed',success:'#9cf3bc',warning:'#ffd382',danger:'#ff90b9'}},
 {...defaultTheme(),name:'Paper Studio',colors:{...BASE_COLORS,background:'#f4f1e9',sidebar:'#eae5d8',surface:'#ffffff',input:'#faf8f2',border:'#8a8275',text:'#20272d',muted:'#515b63',accent:'#805500',onAccent:'#ffffff',secondary:'#246785',success:'#1b6843',warning:'#86551c',danger:'#a42c3f',overlay:'#30343a'}},
 {...defaultTheme(),name:'Evergreen',colors:{...BASE_COLORS,background:'#0d1716',sidebar:'#13221e',surface:'#1b3029',input:'#101f1b',border:'#426b58',text:'#f1f4e8',muted:'#aec8ba',accent:'#c9dc8c',onAccent:'#172315',secondary:'#79cbbb',success:'#9de4b4',warning:'#f4cc8a',danger:'#f5abab'}}
];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
function keys(value,allowed,where){if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('Invalid '+where+'.');}
function hex(v,alpha=false){if(typeof v!=='string'||!(alpha?/^#[a-f\d]{6}([a-f\d]{2})?$/i:/^#[a-f\d]{6}$/i).test(v))throw Error('Colors must be hex values, not CSS or URLs.');return v.toLowerCase();}
export function validateGraphic(value){
 if(value===null)return null;
 if(typeof value!=='string'||value.length>180000||!/^data:image\/png;base64,[a-z\d+/]+={0,2}$/i.test(value))throw Error('Graphics must be bounded PNG display copies.');
 let bytes;try{bytes=Uint8Array.from(atob(value.slice(22)),c=>c.charCodeAt(0));}catch{throw Error('Invalid PNG display copy.');}
 try{validateNftCoverPng(bytes);}catch{throw Error('Invalid normalized PNG display copy.');}
 return value;
}
export function validateTheme(value){
 const base=defaultTheme();keys(value,Object.keys(base),'theme');
 if(typeof value.name!=='string'||!value.name.trim()||value.name.length>48||/[\x00-\x1f\x7f]/.test(value.name))throw Error('Use a theme name of 1–48 characters.');
 keys(value.colors,Object.keys(BASE_COLORS),'theme colors');keys(value.icons,Object.keys(BASE_ICONS),'theme icons');keys(value.graphics,Object.keys(base.graphics),'theme graphics');keys(value.overrides,PALETTE,'palette overrides');
 for(const k of Object.keys(BASE_COLORS))base.colors[k]=hex(value.colors[k]);
 for(const k of Object.keys(BASE_ICONS)){if(!ICON_OPTIONS.includes(value.icons[k]))throw Error('Choose an installed icon.');base.icons[k]=value.icons[k];}
 for(const [k,v] of Object.entries(value.overrides))base.overrides[k]=hex(v,true);
 for(const k of Object.keys(base.graphics))base.graphics[k]=validateGraphic(value.graphics[k]);
 if(typeof value.reduceMotion!=='boolean'||!Number.isFinite(value.backgroundOpacity)||value.backgroundOpacity<0||value.backgroundOpacity>0.4||![1,1.5,1.75,2,2.5].includes(value.iconWeight))throw Error('Invalid display preferences.');
 return {...base,name:value.name.trim(),reduceMotion:value.reduceMotion,backgroundOpacity:value.backgroundOpacity,iconWeight:value.iconWeight};
}
export function decodeTheme(text){
 if(typeof text!=='string'||text.length>MAX_IMPORT_BYTES)throw Error('Theme file exceeds 1 MiB.');
 let doc;try{doc=JSON.parse(text);}catch{throw Error('Choose a valid Road theme JSON file.');}
 keys(doc,['format','version','theme'],'theme file');if(doc.format!=='ybr-workspace-theme'||doc.version!==1)throw Error('Unsupported theme file version.');
 return validateTheme(doc.theme);
}
export function encodeTheme(theme){return JSON.stringify({format:'ybr-workspace-theme',version:1,theme:validateTheme(theme)},null,2);}
function validateStore(value){
 keys(value,['version','active','themes'],'appearance settings');
 if(value.version!==1||!Array.isArray(value.themes)||value.themes.length>MAX_THEMES)throw Error('Unsupported appearance settings.');
 const themes=value.themes.map(validateTheme),names=themes.map(t=>t.name.toLowerCase());
 if(new Set(names).size!==names.length)throw Error('Saved theme names must be unique.');
 return {version:1,active:validateTheme(value.active),themes};
}
export function loadAppearance(storage){
 try{const raw=storage?.getItem(APPEARANCE_KEY);if(!raw)return {version:1,active:defaultTheme(),themes:[],notice:''};
  if(raw.length>MAX_STORE_BYTES)throw Error('Appearance settings exceed the size limit.');
  return {...validateStore(JSON.parse(raw)),notice:''};
 }catch{return {version:1,active:defaultTheme(),themes:[],notice:'Saved appearance could not be read. Original Gold is shown; existing storage has not been deleted.'};}
}
export function saveAppearance(storage,value){
 const checked=validateStore({version:1,active:value.active,themes:value.themes});const raw=JSON.stringify(checked);
 if(raw.length>MAX_STORE_BYTES)throw Error('Theme library is full. Remove an unused saved theme or use smaller graphics.');
 if(!storage?.setItem)throw Error('Browser storage is unavailable. Export your theme to keep it.');
 try{storage.setItem(APPEARANCE_KEY,raw);}catch{throw Error('Browser storage is full or blocked. Nothing was saved. Export your theme instead.');}
 return checked;
}
export function saveNamedTheme(themes,theme){
 const checked=validateTheme(theme),old=themes.findIndex(t=>t.name.toLowerCase()===checked.name.toLowerCase());
 if(old<0&&themes.length>=MAX_THEMES)throw Error('Up to eight saved themes are supported. Delete one before saving another.');
 const next=themes.slice();if(old>=0)next[old]=checked;else next.push(checked);return next;
}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const toHex=a=>'#'+a.map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');
function hsl(hex){const [r,g,b]=rgb(hex).map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(min+max)/2;
 let h=0;if(d)h=(max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60;return {h,s:d?d/(1-Math.abs(2*l-1)):0,l};}
export function paletteRole(color){
 const c='#'+color.slice(0,6),{h,s,l}=hsl(c);
 if(c==='#0c1015')return 'background';if(c==='#131820')return 'sidebar';if(c==='#111820')return 'input';if(c==='#252118')return 'onAccent';
 if(['332c1f','151f26','152127','142028','302d21','121920','131a21','232b33','262d36','232c33','101c26'].includes(color.slice(0,6)))return 'input';
 if(l<0.035)return 'overlay';
 if(s>0.25&&l>0.4){if(h<20||h>=340)return 'danger';if(h<42)return 'warning';if(h<75)return 'accent';if(h<170)return 'success';return 'secondary';}
 if(l>0.81)return 'text';if(l>0.39)return 'muted';if(l>0.21)return 'border';return 'surface';
}
export function paletteValue(theme,color){
 if(Object.hasOwn(theme.overrides,color))return theme.overrides[color];
 const role=paletteRole(color),target=theme.colors[role];
 if(target===BASE_COLORS[role])return '#'+color;
 const original='#'+color.slice(0,6),delta=hsl(original).l-hsl(BASE_COLORS[role]).l;
 // Preserve shade separation while avoiding an inverted surface hierarchy in light themes.
 const adjustment=Math.max(-0.08,Math.min(0.08,delta))*255;
 return toHex(rgb(target).map(v=>v+adjustment))+(color.length===8?color.slice(6):'');
}
export function contrastRatio(a,b){const l=color=>rgb(color).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);const x=l(a),y=l(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
export function themeVariables(theme){
 const t=validateTheme(theme),vars={};
 for(const [key,value] of Object.entries(t.colors))vars['--road-'+key]=value;
 for(const c of PALETTE)vars['--road-palette-'+c]=paletteValue(t,c);
 vars['--road-background-image']=t.graphics.background?'url("'+t.graphics.background+'")':'none';
 vars['--road-background-opacity']=String(t.backgroundOpacity);
 return vars;
}
