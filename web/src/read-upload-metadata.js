import {baselineMetadata} from './upload-metadata.js';
/** One disposable parser worker per upload. Cancellation discards partial results;
 * a timeout/crash retains already-decoded descriptive fields, never raw tags.
 * The hook's generation IDs separately reject stale replacements.
 */
export function startMetadataRead(file,{role='',onProgress=()=>{},timeoutMs=15000,
 createWorker=()=>new Worker(new URL('./upload-metadata.worker.js',import.meta.url),{type:'module'})}={}){
 const base=baselineMetadata(file);let latest=base,worker,timer,finished=false,resolve;
 const promise=new Promise(done=>{resolve=done;});
 const finish=result=>{
  if(finished)return;finished=true;clearTimeout(timer);worker?.terminate();resolve(result);
 };
 const fallback=()=>finish({...latest,notice:Object.values(latest.fieldSources).includes('embedded audio tags')?
  'Metadata reading stopped early. Extracted tags were kept; review them before minting.':
  'Metadata parser unavailable or timed out. Filename defaults are available.'});
 try{
  worker=createWorker();
  worker.onmessage=({data})=>{
   if(finished)return;
   if(data?.type==='metadata-progress'){
    latest=data.result;onProgress(latest);
   }else finish(data);
  };
  worker.onerror=event=>{event?.preventDefault?.();fallback();};
  worker.onmessageerror=fallback;
  timer=setTimeout(fallback,timeoutMs);
  worker.postMessage({file,role});
 }catch{fallback();}
 return {promise,cancel:()=>finish(null)};
}
