import {extractUploadMetadata} from './upload-metadata.js';
self.onmessage=async({data})=>{
 const result=await extractUploadMetadata(data.file,{role:data.role,
  onProgress:result=>self.postMessage({type:'metadata-progress',result})});
 self.postMessage(result);
};
