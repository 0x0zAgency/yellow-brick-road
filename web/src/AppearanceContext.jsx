import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {BookOpen,LayoutDashboard,Music2,Wallet,FileText,Blocks,Layers3,Coins,ShieldCheck,Network,Settings2,Image,Sparkles,Disc3,Headphones,FolderOpen,Palette,Leaf} from 'lucide-react';
import {APPEARANCE_KEY,defaultTheme,loadAppearance,saveAppearance,saveNamedTheme,themeVariables,validateTheme} from './appearance.js';
import './settings.css';
const AppearanceContext=createContext(null);
const FALLBACK=defaultTheme();
const ICONS={book:BookOpen,dashboard:LayoutDashboard,music:Music2,wallet:Wallet,file:FileText,bricks:Blocks,building:Layers3,coins:Coins,shield:ShieldCheck,network:Network,settings:Settings2,image:Image,sparkles:Sparkles,disc:Disc3,headphones:Headphones,folder:FolderOpen,palette:Palette,leaf:Leaf};
function storage(){try{return window.localStorage;}catch{return null;}}
export function AppearanceProvider({children}){
 const [saved,setSaved]=useState(()=>loadAppearance(storage()));
 const [theme,setTheme]=useState(()=>saved.active),[message,setMessage]=useState(saved.notice),[error,setError]=useState('');
 const dirty=JSON.stringify(theme)!==JSON.stringify(saved.active),dirtyRef=useRef(dirty);dirtyRef.current=dirty;
 useLayoutEffect(()=>{
  const root=document.documentElement,vars=themeVariables(theme);
  for(const [name,value] of Object.entries(vars))root.style.setProperty(name,value);
  root.dataset.roadMotion=theme.reduceMotion?'reduced':'system';
  root.style.colorScheme=parseInt(theme.colors.background.slice(1,3),16)>160?'light':'dark';
  return()=>{for(const name of Object.keys(vars))root.style.removeProperty(name);delete root.dataset.roadMotion;root.style.removeProperty('color-scheme');};
 },[theme]);
 useEffect(()=>{
  const changed=e=>{
   if(e.key!==APPEARANCE_KEY)return;
   if(dirtyRef.current){setMessage('Appearance changed in another tab. Your unsaved preview is retained.');return;}
   const next=loadAppearance(storage());setSaved(next);setTheme(next.active);setMessage(next.notice||'Appearance updated from another tab.');
  };
  window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
 },[]);
 const preview=next=>{try{setTheme(validateTheme(typeof next==='function'?next(theme):next));setError('');}catch(e){setError(e.message);}};
 const persist=(active,themes,notice)=>{
  try{const next=saveAppearance(storage(),{active,themes});setSaved(next);setTheme(next.active);setMessage(notice);setError('');return true;}
  catch(e){setError(e.message);return false;}
 };
 const save=(named=false)=>{
  try{const current=loadAppearance(storage());const themes=named?saveNamedTheme(current.themes,theme):current.themes;
   return persist(theme,themes,named?'Theme saved and applied on this browser.':'Appearance saved on this browser.');
  }catch(e){setError(e.message);return false;}
 };
 const removeTheme=name=>{
  const current=loadAppearance(storage());
  try{const next=saveAppearance(storage(),{active:current.active,themes:current.themes.filter(t=>t.name!==name)});
   setSaved(next);setMessage('Saved theme removed. Your current preview and creator data are unchanged.');setError('');
  }catch(e){setError(e.message);}
 };
 const value={theme,preview,saved,dirty,message,error,setMessage,setError,save,removeTheme,discard:()=>{const next=loadAppearance(storage());setSaved(next);setTheme(next.active);setMessage('Saved appearance restored.');setError('');}};
 return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
export function useAppearance(){return useContext(AppearanceContext);}
export function WorkspaceIcon({slot,fallback='bricks',size=18,...props}){
 const theme=useContext(AppearanceContext)?.theme||FALLBACK,Icon=ICONS[theme.icons[slot]||fallback]||Blocks;
 return <Icon size={size} strokeWidth={theme.iconWeight} aria-hidden="true" {...props}/>;
}
export function WorkspaceGraphic({slot,alt='',className='',fallback=null}){
 const theme=useContext(AppearanceContext)?.theme||FALLBACK,src=theme.graphics[slot];
 const [failed,setFailed]=useState(null);
 return src&&src!==failed?<img className={className} src={src} alt={alt} onError={()=>setFailed(src)}/>:fallback;
}
