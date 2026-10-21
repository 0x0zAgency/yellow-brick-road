'use strict';
/** Local, disposable wallet profiles. Never pass a mnemonic in argv or env. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const DEFAULT_ACCOUNT='0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';
const DEFAULT=Object.freeze({kind:'default',id:'default',account:DEFAULT_ACCOUNT});
const HD_PATH="m/44'/60'/0'/0/0";
const owner=stat=>!process.getuid||stat.uid===process.getuid();
function secureDirectories(root,parts){
 let current=path.resolve(root);
 for(const name of parts){
  if(!/^[a-zA-Z0-9._-]+$/.test(name)||name==='..')throw Error('Invalid Ganache profile directory.');
  current=path.join(current,name);
  try{fs.mkdirSync(current,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  const stat=fs.lstatSync(current);
  if(!stat.isDirectory()||stat.isSymbolicLink()||!owner(stat))throw Error('Ganache storage must be a regular directory owned by your user.');
  fs.chmodSync(current,0o700);
 }
 return current;
}
function describeMnemonic(value,library){
 const phrase=typeof value==='string'?value.normalize('NFKD').trim().toLowerCase().replace(/\s+/g,' '):'';
 if(phrase.length>512||!/^([a-z]+ )+[a-z]+$/.test(phrase)||![12,15,18,21,24].includes(phrase.split(' ').length))
  throw Error('Enter a valid English BIP-39 mnemonic: 12, 15, 18, 21 or 24 words.');
 const {utils}=library||require('ethers');
 if(!utils.isValidMnemonic(phrase))throw Error('Mnemonic word list or checksum is invalid. Nothing was changed.');
 let account;
 try{account=utils.HDNode.fromMnemonic(phrase).derivePath(HD_PATH).address;}
 catch{throw Error('Cannot derive the development wallet. Nothing was changed.');}
 if(account.toLowerCase()===DEFAULT_ACCOUNT.toLowerCase())return {...DEFAULT};
 return {kind:'custom',id:account.toLowerCase().slice(2),account,mnemonic:phrase};
}
function generateSelection(library){
 const ethers=library||require('ethers');
 return describeMnemonic(ethers.utils.entropyToMnemonic(crypto.randomBytes(32)),ethers);
}
function selectionFile(root){return path.join(root,'.road-local','ganache-wallet.json');}
function readSelection(root,library){
 const dir=path.join(root,'.road-local');
 try{const s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||!owner(s))throw Error('Unsafe Ganache settings directory.');}
 catch(error){if(error.code==='ENOENT')return {...DEFAULT};throw error;}
 const file=selectionFile(root);let fd;
 try{
  fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  const s=fs.fstatSync(fd);
  if(!s.isFile()||s.nlink!==1||!owner(s)||s.size>4096||process.platform!=='win32'&&(s.mode&0o077)!==0)
   throw Error('Ganache wallet settings must be a private owner-only regular file (chmod 600).');
  let data;try{data=JSON.parse(fs.readFileSync(fd,'utf8'));}catch{throw Error('Invalid Ganache wallet settings. Restore your private backup.');}
  if(data?.version!==1||!['default','custom'].includes(data.kind))throw Error('Unsupported Ganache wallet settings.');
  return data.kind==='default'?{...DEFAULT}:describeMnemonic(data.mnemonic,library);
 }catch(error){if(error.code==='ENOENT')return {...DEFAULT};throw error;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
function profilePaths(root,selection){
 const selected=selection||readSelection(root);
 if(selected.id!=='default'&&!/^[a-f0-9]{40}$/.test(selected.id||''))throw Error('Invalid Ganache profile identity.');
 const parts=selected.id==='default'?['.road-local']:['.road-local','ganache-profiles',selected.id];
 const directory=path.join(path.resolve(root),...parts);
 return {directory,parts,database:path.join(directory,'ganache'),factory:path.join(directory,'factory.json'),history:path.join(directory,'factory-history')};
}
function prepareProfile(root,selection){
 const paths=profilePaths(root,selection);
 secureDirectories(root,[...paths.parts,'ganache']);
 return paths;
}
function saveSelection(root,selection,{expectedId,library}={}){
 const candidate=selection?.kind==='default'?{...DEFAULT}:describeMnemonic(selection?.mnemonic,library);
 secureDirectories(root,['.road-local']);
 const current=readSelection(root,library);
 if(expectedId!==undefined&&current.id!==expectedId)throw Error('Wallet selection changed elsewhere. Reopen the mnemonic tool.');
 const file=selectionFile(root),temporary=file+'.'+crypto.randomBytes(12).toString('hex')+'.tmp';
 const record=candidate.kind==='default'?{version:1,kind:'default'}:{version:1,kind:'custom',mnemonic:candidate.mnemonic};
 let fd;
 try{
  fd=fs.openSync(temporary,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);
  fs.writeFileSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  fs.renameSync(temporary,file);
 }finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
 return candidate;
}
function changeAllowed({phase,ganacheSource,playerSource,overrides=false}){
 if(phase!=='READY')throw Error('Wait until the stack is READY before changing its mnemonic.');
 if(ganacheSource!=='owned')throw Error('This Ganache is externally managed. Stop it in its own terminal, then relaunch npm run dev.');
 if(playerSource!=='owned')throw Error('Restart with npm run dev -- --restart-player before switching wallet profiles.');
 if(overrides)throw Error('Unset YBR_GANACHE_FACTORY and VITE_ROAD_GANACHE_FACTORY before switching profiles.');
}
/** Only commit new settings after owned services and the RPC endpoint have stopped. */
async function switchSelection({root,candidate,expectedId,context},{stop,verifyStopped,save=saveSelection}={}){
 changeAllowed(context);
 if(candidate.id===expectedId)return {changed:false};
 await stop();
 if(!await verifyStopped())throw Error('Ganache is still listening. Wallet settings were NOT changed.');
 save(root,candidate,{expectedId});
 return {changed:true,profile:candidate.id};
}
module.exports={DEFAULT,DEFAULT_ACCOUNT,HD_PATH,secureDirectories,describeMnemonic,generateSelection,readSelection,saveSelection,selectionFile,profilePaths,prepareProfile,changeAllowed,switchSelection};
