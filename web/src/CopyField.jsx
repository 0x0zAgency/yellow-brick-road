import {useRef,useState,useEffect} from 'react';
import {Copy,Check} from 'lucide-react';
import './copy-field.css';

/** Browser-only clipboard control, never transmits the copied value. */
export default function CopyField({label,value,small=false}){
 const [feedback,setFeedback]=useState('');
 const timer=useRef(null);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
 if(value===undefined||value===null||String(value)==='')return null;
 const content=String(value);
 const copy=async()=>{
  try{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable. Select and copy the value manually.');
   await navigator.clipboard.writeText(content);
   setFeedback('Copied');
  }catch{
   setFeedback('Select value to copy');
  }
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(()=>setFeedback(''),2600);
 };
 return <span className={'road-copy-field'+(small?' road-copy-field-small':'')}>
  <span className="road-copy-value">{content}</span>
  <button type="button" aria-label={'Copy '+label} title={'Copy '+label} onClick={()=>void copy()}>
   {feedback==='Copied'?<Check size={15}/>:<Copy size={15}/>}
  </button>
  {feedback&&<span role="status" className="road-copy-feedback">{feedback}</span>}
 </span>;
}
