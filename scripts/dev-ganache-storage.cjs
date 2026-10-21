'use strict';
/** Prepare the selected profile without deleting, replacing or following links. */
const path=require('node:path');
const {prepareProfile,secureDirectories}=require('./dev-ganache-profile.cjs');
function prepareGanacheStorage(root=path.resolve(__dirname,'..')){
 secureDirectories(root,['.road-local']);
 return prepareProfile(root).database;
}
if(require.main===module){
 try{prepareGanacheStorage();}
 catch{console.error('[YBR] Cannot prepare private Ganache profile storage. Check local settings and directory ownership.');process.exitCode=1;}
}
module.exports={prepareGanacheStorage};
