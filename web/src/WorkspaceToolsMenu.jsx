import {useEffect,useRef,useState} from 'react';
import {ChevronDown,Wrench} from 'lucide-react';
import {WorkspaceIcon} from './AppearanceContext.jsx';
import './tools.css';
export const TOOL_PAGES=[['settings','Settings','settings'],['recovery','Recover files','recovery'],['mp3-tags','MP3 Tags','audio']];
export default function WorkspaceToolsMenu({page,onNavigate}){
 const [open,setOpen]=useState(false),trigger=useRef(null);
 const active=TOOL_PAGES.some(([id])=>id===page);
 useEffect(()=>{if(active)setOpen(true);},[page,active]);
 return <div className="workspace-tools" onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus();}}}>
  <button ref={trigger} type="button" className={'aside-link tools-trigger'+(active?' active':'')} aria-expanded={open} aria-controls="workspace-tools-menu" onClick={()=>setOpen(v=>!v)}><Wrench size={18} aria-hidden="true"/>Tools<ChevronDown size={15} aria-hidden="true" className={open?'tools-chevron open':'tools-chevron'}/></button>
  <div id="workspace-tools-menu" className="tools-submenu" hidden={!open}>
   {TOOL_PAGES.map(([id,label,slot])=><button key={id} type="button" className={'aside-link'+(page===id?' active':'')} aria-current={page===id?'page':undefined} onClick={()=>onNavigate(id)}><WorkspaceIcon slot={slot}/>{label}</button>)}
  </div>
 </div>;
}
