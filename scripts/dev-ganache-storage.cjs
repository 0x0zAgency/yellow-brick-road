'use strict';
/** Prepare local chain storage without deleting, replacing or following links. */
const fs=require('node:fs');
const path=require('node:path');
function prepareGanacheStorage(root=path.resolve(__dirname,'..')){
 let current=root;
 for(const name of ['.road-local','ganache']){
  current=path.join(current,name);
  try{fs.mkdirSync(current,{mode:0o700});}
  catch(error){if(error.code!=='EEXIST')throw error;}
  const stat=fs.lstatSync(current);
  if(!stat.isDirectory()||stat.isSymbolicLink()||process.getuid&&stat.uid!==process.getuid())
   throw Error('Ganache storage must be a regular directory owned by your user: '+current);
  fs.chmodSync(current,0o700);
 }
 return current;
}
if(require.main===module){
 try{prepareGanacheStorage();}
 catch(error){console.error('[YBR] Cannot prepare persistent Ganache storage: '+error.message);process.exitCode=1;}
}
module.exports={prepareGanacheStorage};
