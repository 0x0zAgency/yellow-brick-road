import {useEffect,useReducer,useRef} from 'react';
import {baselineMetadata,initialUploadForm,resolveUploadFields,uploadFormReducer} from './upload-metadata.js';
import {startMetadataRead} from './read-upload-metadata.js';
/** Parsers run in disposable workers, so malformed uploads cannot lock the UI. */
export default function useUploadMetadata(initial){
 const [state,dispatch]=useReducer(uploadFormReducer,initial,initialUploadForm);
 const pending=useRef(new Map()),sequence=useRef(0);
 const cancel=()=>{for(const task of pending.current.values())task.cancel();pending.current.clear();};
 useEffect(()=>()=>cancel(),[]);
 const inspect=(role,file)=>{
  pending.current.get(role)?.cancel();
  const id=++sequence.current,base=baselineMetadata(file);
  dispatch({type:'start',role,id,result:base});
  const task=startMetadataRead(file,{role,onProgress:result=>dispatch({type:'finish',role,id,result})});
  pending.current.set(role,task);
  return task.promise.then(result=>{
   if(pending.current.get(role)===task)pending.current.delete(role);
   if(result)dispatch({type:'finish',role,id,result});
   return result||base;
  });
 };
 const resolved=resolveUploadFields(state.manual,state.touched,state.uploads);
 const suggestions=resolveUploadFields({},[],state.uploads).values;
 return {meta:resolved.values,sources:resolved.sources,suggestions,inspect,
  edit:(field,value)=>dispatch({type:'edit',field,value}),
  clearFiles:()=>{cancel();dispatch({type:'clear-files'});},
  reset:values=>{cancel();dispatch({type:'reset',values});}};
}
