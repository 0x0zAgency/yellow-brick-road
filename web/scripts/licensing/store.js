import {mkdir,readFile,writeFile,rename,lstat,chmod} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {textHash,json} from '../../src/licensing/protocol.js';

async function directory(dir){
 await mkdir(dir,{recursive:true,mode:0o700});
 const stat=await lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Licensing storage must be a private directory.');
 await chmod(dir,0o700);
}
async function privateRead(file){const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32*1024*1024)throw Error('Invalid licensing storage file.');await chmod(file,0o600);return JSON.parse(await readFile(file,'utf8'));}
export async function openStore(root,profile){
 const local=path.join(root,'.road-local');await directory(local);
 const parent=path.join(local,'licensing');await directory(parent);
 const scope=textHash([profile.chainId,profile.factoryAddress.toLowerCase(),profile.genesisHash.toLowerCase()].join(':')).slice(2);
 const dir=path.join(parent,scope);await directory(dir);
 const walletFile=path.join(dir,'wallet.json');let secret;
 try{secret=await privateRead(walletFile);}catch(error){if(error.code!=='ENOENT')throw error;
  const privateKey=generatePrivateKey();secret={version:1,privateKey};
  try{await writeFile(walletFile,json(secret),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;secret=await privateRead(walletFile);}
 }
 const walletAddress=privateKeyToAccount(secret.privateKey).address;
 const file=path.join(dir,'offers.json');let data;
 try{data=await privateRead(file);}catch(error){if(error.code!=='ENOENT')throw error;data={version:1,offers:[],policies:{}};}
 if(data.version!==1||!Array.isArray(data.offers)||data.offers.length>1000||!data.policies||typeof data.policies!=='object')throw Error('Invalid licensing ledger.');
 let tail=Promise.resolve();
 return {walletAddress,snapshot:()=>structuredClone(data),mutate(fn){
  const task=tail.then(async()=>{const next=structuredClone(data),result=await fn(next),content=json(next);if(Buffer.byteLength(content)>32*1024*1024)throw Error('This deployment inbox has reached its 32 MiB storage limit. Archive the ledger before adding more offers.');const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp';await writeFile(temp,content,{flag:'wx',mode:0o600});await rename(temp,file);data=next;return result;});
  tail=task.catch(()=>{});return task;
 }};
}
