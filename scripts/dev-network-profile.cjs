'use strict';
/** Private node configuration; never contains a signing key. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ADDRESS=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i;
const NETWORKS=Object.freeze({ganache:{name:'Local Ganache',chainId:1337},sepolia:{name:'Sepolia',chainId:11155111}});
function safeDirectory(root){
 let dir=root;
 for(const part of ['.road-local','networks']){
  dir=path.join(dir,part);
  try{fs.mkdirSync(dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||(process.getuid&&st.uid!==process.getuid()))throw Error('Unsafe network settings directory.');
  fs.chmodSync(dir,0o700);
 }
 return dir;
}
function profilePath(root,name){
 if(!['sepolia','sepolia-pending'].includes(name)&&!/^sepolia-history-[a-f0-9]{40}-[a-f0-9]{64}$/.test(name))throw Error('Unsupported network record.');
 return path.join(root,'.road-local','networks',name+'.json');
}
function readRecord(root,name){
 const file=profilePath(root,name);
 // Inspect parents without creating them during a read.
 for(const dir of [path.join(root,'.road-local'),path.dirname(file)]){
  try{const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||(process.getuid&&st.uid!==process.getuid()))throw Error('Unsafe network settings directory.');}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
 }
 let fd;
 try{
  fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));const st=fs.fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||st.size>32768||(process.getuid&&st.uid!==process.getuid())||(process.platform!=='win32'&&(st.mode&0o077)))throw Error('Network records must be private regular files.');
  try{return JSON.parse(fs.readFileSync(fd,'utf8'));}catch{throw Error('Invalid network record.');}
 }catch(e){if(e.code==='ENOENT')return null;throw e;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
function writeRecord(root,name,value){
 const dir=safeDirectory(root),file=profilePath(root,name);
 readRecord(root,name); // Refuse linked, foreign or permissive destinations.
 const text=JSON.stringify(value)+'\n';if(Buffer.byteLength(text)>32768)throw Error('Network record is too large.');
 const temporary=path.join(dir,'.write-'+crypto.randomBytes(12).toString('hex'));let fd;
 try{
  fd=fs.openSync(temporary,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600);
  fs.writeFileSync(fd,text);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temporary,file);
 }finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temporary);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
function checkedRpc(value,{network='sepolia'}={}){
 let url;try{url=new URL(value);}catch{throw Error('Enter a valid RPC URL.');}
 const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.hash||!url.hostname||!['http:','https:'].includes(url.protocol)||(!local&&url.protocol!=='https:')||(network==='ganache'&&!local))throw Error('Use HTTPS for remote RPCs, or HTTP on loopback. URL user/password credentials are not supported.');
 if(url.href.length>2048)throw Error('RPC URL is too long.');
 return url.href;
}
function rpcLabel(value){try{return new URL(value).origin+' / private endpoint';}catch{return 'RPC not configured';}}
function checkedProfile(value){
 if(value?.version!==1||value.network!=='sepolia'||value.chainId!==11155111||!ADDRESS.test(value.factoryAddress||'')||/^0x0{40}$/i.test(value.factoryAddress)||!HASH.test(value.genesisHash||'')||!Number.isSafeInteger(value.deploymentBlock)||value.deploymentBlock<0)throw Error('Sepolia profile is incomplete. Use Network Control to validate or deploy its factory.');
 const rpcUrl=checkedRpc(value.rpcUrl);
 return {version:1,network:'sepolia',chainId:11155111,name:'Sepolia',rpcUrl,factoryAddress:value.factoryAddress,genesisHash:value.genesisHash,deploymentBlock:value.deploymentBlock,deployer:ADDRESS.test(value.deployer||'')?value.deployer:null,transactionHash:HASH.test(value.transactionHash||'')?value.transactionHash:null};
}
function readActiveProfile(root,env=process.env){
 const network=env.YBR_ACTIVE_NETWORK||require('./dev-network.cjs').readNetwork(root).network;
 if(!Object.hasOwn(NETWORKS,network))throw Error('Unsupported active network. No local fallback was selected.');
 if(network==='ganache')return {network,name:'Local Ganache',chainId:1337,rpcUrl:checkedRpc(env.YBR_GANACHE_RPC||'http://127.0.0.1:8545',{network}),factoryAddress:env.YBR_FACTORY_ADDRESS||env.YBR_GANACHE_FACTORY||null,deploymentBlock:0,genesisHash:env.YBR_GENESIS_HASH||null};
 const saved=readRecord(root,'sepolia');
 if(saved)checkedProfile(saved);
 // All services receive the same completed profile. Missing remote settings are an error.
 return checkedProfile({...saved,...(env.YBR_RPC_URL?{rpcUrl:env.YBR_RPC_URL}:{}),...(env.YBR_FACTORY_ADDRESS?{factoryAddress:env.YBR_FACTORY_ADDRESS}:{}),...(env.YBR_GENESIS_HASH?{genesisHash:env.YBR_GENESIS_HASH}:{}),...(env.YBR_DEPLOYER_ADDRESS?{deployer:env.YBR_DEPLOYER_ADDRESS}:{}),...(env.YBR_DEPLOYMENT_BLOCK?{deploymentBlock:Number(env.YBR_DEPLOYMENT_BLOCK)}:{}),version:1,network,chainId:11155111});
}
function withoutSigningSecrets(env=process.env){
 const result={...env};
 for(const key of Object.keys(result))if(/(?:PRIVATE_KEY|MNEMONIC|KEYSTORE_PASSWORD)$/i.test(key))delete result[key];
 return result;
}
function activeEnvironment(profile,revision='',env=process.env){
 const result=withoutSigningSecrets(env);
 // No inherited address may redirect a component to the other chain.
 for(const key of ['YBR_GANACHE_FACTORY','VITE_ROAD_GANACHE_FACTORY','VITE_ROAD_SEPOLIA_FACTORY','VITE_ROAD_RPC_URL','SEPOLIA_RPC_URL'])delete result[key];
 Object.assign(result,{YBR_ACTIVE_NETWORK:profile.network,YBR_CHAIN_ID:String(profile.chainId),YBR_RPC_URL:profile.rpcUrl,YBR_FACTORY_ADDRESS:profile.factoryAddress,YBR_GENESIS_HASH:profile.genesisHash||'',YBR_DEPLOYER_ADDRESS:profile.deployer||'',YBR_DEPLOYMENT_BLOCK:String(profile.deploymentBlock||0),VITE_ROAD_ACTIVE_NETWORK:profile.network,VITE_ROAD_ACTIVE_CHAIN_ID:String(profile.chainId),VITE_ROAD_ACTIVE_FACTORY:profile.factoryAddress,VITE_ROAD_ACTIVE_GENESIS_HASH:profile.genesisHash||'',VITE_ROAD_ACTIVE_DEPLOYMENT_BLOCK:String(profile.deploymentBlock||0),VITE_ROAD_DEFAULT_NETWORK:profile.network,VITE_ROAD_NETWORK_SELECTION:revision});
 if(profile.network==='ganache')Object.assign(result,{YBR_GANACHE_FACTORY:profile.factoryAddress,VITE_ROAD_GANACHE_FACTORY:profile.factoryAddress});
 else result.VITE_ROAD_SEPOLIA_FACTORY=profile.factoryAddress;
 return result;
}
module.exports={NETWORKS,ADDRESS,HASH,safeDirectory,readRecord,writeRecord,checkedRpc,rpcLabel,checkedProfile,readActiveProfile,activeEnvironment,withoutSigningSecrets};
