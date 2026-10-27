import {readMp3,updateMp3} from './mp3-tool-core.js';
self.onmessage=async({data})=>{
 try{
  if(data?.mode==='read'){const result=await readMp3(data.file);self.postMessage({ok:true,result:result.view});}
  else if(data?.mode==='update'){const result=await updateMp3(data.file,data.edits,{migrateLegacy:data.migrateLegacy===true});self.postMessage({ok:true,result},[result.buffer]);}
  else throw Error('Unsupported MP3 tool operation.');
 }catch(e){self.postMessage({ok:false,error:e instanceof Error?e.message:'MP3 processing failed.'});}
};
