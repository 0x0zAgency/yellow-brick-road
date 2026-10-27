import {MAX_MP3_BYTES,readMp3Tags,writeMp3Tags} from './mp3-tag-editor.js';
self.onmessage=async({data})=>{
 try{
  if(!data?.file||data.file.size>MAX_MP3_BYTES)throw Error('Choose an MP3 no larger than 128 MiB.');
  const bytes=await data.file.arrayBuffer();
  const result=data.action==='write'?await writeMp3Tags(bytes,data.changes,data.options):await readMp3Tags(bytes);
  self.postMessage({ok:true,result},result.bytes?[result.bytes.buffer]:[]);
 }catch(error){self.postMessage({ok:false,error:error?.message||'MP3 processing failed. No file was changed.'});}
};
