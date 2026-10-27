/** Disposable worker with a bounded lifetime. No parser blocking the UI thread. */
export function startTagTask(payload,{timeoutMs=30000,createWorker=()=>new Worker(new URL('./mp3-tags.worker.js',import.meta.url),{type:'module'})}={}){
 let worker,timer,done=false,resolve;
 const promise=new Promise(r=>{resolve=r;});
 const finish=value=>{if(done)return;done=true;clearTimeout(timer);worker?.terminate();resolve(value);};
 try{
  worker=createWorker();worker.onmessage=({data})=>finish(data);
  worker.onerror=e=>{e?.preventDefault?.();finish({ok:false,error:'MP3 processing stopped. The original file is unchanged.'});};
  worker.onmessageerror=()=>finish({ok:false,error:'MP3 result could not be read.'});
  timer=setTimeout(()=>finish({ok:false,error:'MP3 processing timed out. Try a smaller file; the original is unchanged.'}),timeoutMs);
  worker.postMessage(payload);
 }catch{finish({ok:false,error:'The MP3 worker could not start. Reload the app and retry.'});}
 return {promise,cancel:()=>finish(null)};
}
