import {useEffect,useRef,useState} from 'react';
import {Check,Copy} from 'lucide-react';

/** One user-initiated browser clipboard write; no network request or persistence. */
export default function CopyAllButton({label,text}){
 const [feedback,setFeedback]=useState('');
 const timer=useRef(null);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
 const copy=async()=>{
  try{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
   await navigator.clipboard.writeText(text);
   setFeedback('Copied!');
  }catch{
   setFeedback('Clipboard unavailable. Use individual fields.');
  }
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(()=>setFeedback(''),3500);
 };
 return <span className="ms-copy-all-wrap">
  <button className="ms-copy-all" type="button" aria-label={'Copy all mint details for '+label} title={'Copy all mint details for '+label} onClick={()=>void copy()}>
   {feedback==='Copied!'?<Check size={15}/>:<Copy size={15}/>}
   <span>{feedback==='Copied!'?'Copied!':'Copy All'}</span>
  </button>
  {feedback&&<span role="status" className="ms-copy-all-status">{feedback}</span>}
 </span>;
}
