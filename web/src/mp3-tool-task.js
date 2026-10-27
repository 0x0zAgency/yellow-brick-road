/** Disposable workers keep large/untrusted tags off the UI thread. */
export function runTagTask(payload,{timeoutMs=45000,createWorker=()=>new Worker(new URL('./mp3-tool.worker.js',import.meta.url),{type:'module'})}={}){
 let worker,timer,done=false,rejectTask;
 const promise=new Promise((resolve,reject)=>{
  rejectTask=reject;
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);worker?.terminate();error?reject(error):resolve(result);};
  try{worker=createWorker();worker.onmessage=({data})=>data?.ok===true?finish(null,data.result):finish(Error(data?.error||'Could not process the MP3.'));
   worker.onerror=e=>{e.preventDefault?.();finish(Error('The MP3 worker stopped. The original file is unchanged.'));};
   worker.onmessageerror=()=>finish(Error('Could not read the worker response.'));
   timer=setTimeout(()=>finish(Error('MP3 processing timed out. Try a smaller file. The original is unchanged.')),timeoutMs);
   worker.postMessage(payload);
  }catch{finish(Error('MP3 tools could not start. Reload the app and try again.'));}
 });
 return {promise,cancel(){if(done)return;done=true;clearTimeout(timer);worker?.terminate();rejectTask(new DOMException('MP3 operation canceled.','AbortError'));}};
}
