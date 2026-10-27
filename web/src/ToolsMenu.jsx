import {useEffect,useState} from 'react';
import {ChevronDown,Wrench} from 'lucide-react';
import {WorkspaceIcon} from './AppearanceContext.jsx';
import './tools.css';
export const TOOL_PAGES=[['settings','Settings','settings'],['recovery','Recover files','recovery'],['mp3-tags','MP3 tags','audio']];
export const toolLabel=page=>TOOL_PAGES.find(([id])=>id===page)?.[1];
export function initialWorkspacePage(search=globalThis.location?.search||''){
 const id=new URLSearchParams(search).get('tool');return toolLabel(id)?id:'manifesto';
}
export default function ToolsMenu({page,onNavigate}){
 const active=!!toolLabel(page),[expanded,setExpanded]=useState(active);
 useEffect(()=>{if(active)setExpanded(true);},[page,active]);
 return <div className="workspace-tools"><button type="button" className={'aside-link tools-toggle'+(active?' active':'')} aria-expanded={expanded} aria-controls="workspace-tools-items" onClick={()=>setExpanded(v=>!v)}><Wrench size={18} aria-hidden="true"/>Tools<ChevronDown size={15} className={expanded?'tools-chevron expanded':'tools-chevron'} aria-hidden="true"/></button><div id="workspace-tools-items" className="tools-submenu" hidden={!expanded}>{TOOL_PAGES.map(([id,label,icon])=><button type="button" className={'aside-link'+(page===id?' active':'')} key={id} aria-current={page===id?'page':undefined} onClick={()=>onNavigate(id)}><WorkspaceIcon slot={icon}/>{label}</button>)}</div></div>;
}
