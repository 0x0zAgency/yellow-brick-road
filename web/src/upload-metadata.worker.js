import {extractUploadMetadata} from './upload-metadata.js';
self.onmessage=async({data})=>{
 const result=await extractUploadMetadata(data.file,{role:data.role});
 self.postMessage(result);
};
