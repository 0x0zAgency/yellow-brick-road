import {useEffect,useReducer,useRef} from 'react';
import {baselineMetadata,initialUploadForm,resolveUploadFields,uploadFormReducer} from './upload-metadata.js';
/** Parsers run in disposable workers, so malformed uploads cannot lock the UI. */
export default function useUploadMetadata(initial){
 const [state,dispatch]=useReducer(uploadFormReducer,initial,initialUploadForm);
 const pending=useRef(new Map()),sequence=useRef(0);
 const cancel=()=>{for(const stop of pending.current.values())stop();pending.current.clear();};
 useEffect(()=>()=>cancel(),[]);
 const inspect=(role,file)=>{
  pending.current.get(role)?.();
  const id=++sequence.current,base=baselineMetadata(file);
  dispatch({type:'start',role,id,result:base});
  return new Promise(resolve=>{
   let worker,timer,finished=false;
   const finish=(result,commit=true)=>{
    if(finished)return;finished=true;clearTimeout(timer);worker?.terminate();
    if(pending.current.get(role)===stop)pending.current.delete(role);
    if(commit)dispatch({type:'finish',role,id,result});
    resolve(result);
   };
   const stop=()=>finish(base,false);pending.current.set(role,stop);
   const fallback=()=>finish({...base,notice:'Metadata parser unavailable or timed out. Filename defaults are available.'});
   try{
    worker=new Worker(new URL('./upload-metadata.worker.js',import.meta.url),{type:'module'});
    worker.onmessage=event=>finish(event.data);worker.onerror=fallback;
    timer=setTimeout(fallback,15000);
    worker.postMessage({file,role});
   }catch{fallback();}
  });
 };
 const resolved=resolveUploadFields(state.manual,state.touched,state.uploads);
 return {meta:resolved.values,sources:resolved.sources,inspect,
  edit:(field,value)=>dispatch({type:'edit',field,value}),
  clearFiles:()=>{cancel();dispatch({type:'clear-files'});},
  reset:values=>{cancel();dispatch({type:'reset',values});}};
}
