'use strict';
/** Local TLS only. Trust installation is explicit; ordinary startup never runs
 * mkcert, disables verification, exposes a key, or binds a public interface. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const names=['key.pem','cert.pem','ca.pem'];
const directory=root=>path.join(root,'.road-local','tls');
function privateDirectory(dir,{create=false}={}){
 if(create)try{fs.mkdirSync(dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||process.getuid&&st.uid!==process.getuid())throw Error('Unsafe local HTTPS directory.');
 if(process.platform!=='win32'&&(st.mode&0o077))throw Error('Local HTTPS storage requires owner-only (700) directory permissions.');
}
function readPrivate(file,max=1024*1024){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{const st=fs.fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||st.size>max||process.getuid&&st.uid!==process.getuid()||process.platform!=='win32'&&(st.mode&0o077))throw Error('Local HTTPS files require owner-only (600) regular files.');
  return fs.readFileSync(fd);
 }finally{fs.closeSync(fd);}
}
function loadHttps(root,env=process.env){
 if(env.YBR_DEV_HTTP==='1')return null;
 const dir=directory(root);
 // Only a completely absent configuration is HTTP. Partial/broken TLS fails closed.
 try{const st=fs.lstatSync(path.dirname(dir));if(!st.isDirectory()||st.isSymbolicLink()||process.getuid&&st.uid!==process.getuid())throw Error('Unsafe local HTTPS directory.');}catch(e){if(e.code==='ENOENT'){
  if(env.YBR_LOCAL_HTTPS==='1')throw Error('HTTPS requested but not configured. Run npm run setup:https.');return null;
 }throw e;}
 try{privateDirectory(dir);}catch(e){if(e.code==='ENOENT'){
  if(env.YBR_LOCAL_HTTPS==='1')throw Error('HTTPS requested but not configured. Run npm run setup:https.');return null;
 }throw e;}
 try{
  privateDirectory(path.dirname(dir));
  const [key,cert,ca]=names.map(name=>readPrivate(path.join(dir,name)));
  const leaf=new crypto.X509Certificate(cert),rootCert=new crypto.X509Certificate(ca),now=Date.now();
  for(const c of [leaf,rootCert])if(now<Date.parse(c.validFrom)||now>=Date.parse(c.validTo))throw Error('Expired certificate.');
  if(!rootCert.ca||!leaf.verify(rootCert.publicKey)||!leaf.checkPrivateKey(crypto.createPrivateKey(key))||!leaf.checkHost('localhost')||!leaf.checkIP('127.0.0.1')||!leaf.checkIP('::1'))throw Error('Certificate identity mismatch.');
  return {key,cert,ca,minVersion:'TLSv1.2'};
 }catch{throw Error('Local HTTPS certificates are incomplete, unsafe, expired or mismatched. Restore them or renew with mkcert; no HTTP fallback was started. Use --http only to recover the previous local browser origin.');}
}
function localUrls(env=process.env){
 const protocol=env.YBR_DEV_HTTP!=='1'&&env.YBR_LOCAL_HTTPS==='1'?'https:':'http:';
 return {web:protocol+'//127.0.0.1:5173',player:protocol+'//127.0.0.1:4173',ipfs:'http://127.0.0.1:8791',ganache:'http://127.0.0.1:8545'};
}
function prepareHttpsEnvironment(root,env=process.env){
 const tls=loadHttps(root,env);
 if(!tls)return {...env,YBR_LOCAL_HTTPS:'0'};
 const bundle=path.join(directory(root),'node-ca.pem');
 let additional='';
 if(env.NODE_EXTRA_CA_CERTS&&path.resolve(env.NODE_EXTRA_CA_CERTS)!==bundle){
  const st=fs.statSync(env.NODE_EXTRA_CA_CERTS);
  if(!st.isFile()||st.size>1024*1024)throw Error('Existing Node CA bundle must be a bounded certificate file.');
  additional=fs.readFileSync(env.NODE_EXTRA_CA_CERTS,'utf8');
  if(/PRIVATE KEY/.test(additional))throw Error('Existing Node CA bundle contains private key material.');
 }else if(env.NODE_EXTRA_CA_CERTS===bundle){
  // Already inside the re-executed process. Do not rewrite its loaded trust set.
  if(!readPrivate(bundle,2*1024*1024).includes(tls.ca))throw Error('Local Node CA bundle changed. Restart Dev Control.');
  return {...env,YBR_LOCAL_HTTPS:'1'};
 }
 const content=Buffer.from(additional+'\n'+tls.ca.toString('utf8'));
 let previous;try{previous=readPrivate(bundle,2*1024*1024);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!previous?.equals(content)){
  const tmp=bundle+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  const fd=fs.openSync(tmp,'wx',0o600);
  try{fs.writeFileSync(fd,content);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{fs.renameSync(tmp,bundle);}finally{try{fs.unlinkSync(tmp);}catch(e){if(e.code!=='ENOENT')throw e;}}
 }
 return {...env,YBR_LOCAL_HTTPS:'1',NODE_EXTRA_CA_CERTS:bundle};
}
function setupHttps(root,{run=spawnSync,log=console.log}={}){
 const version=run('mkcert',['-version'],{encoding:'utf8'});
 if(version.error||version.status!==0)throw Error('Install mkcert first (macOS: brew install mkcert), then run npm run setup:https.');
 const local=path.join(root,'.road-local');
 // A legacy directory may be private already through the normal launcher.
 try{privateDirectory(local,{create:true});}catch(e){throw Error('Prepare a private .road-local directory before HTTPS setup: '+e.message);}
 log('[YBR] HTTPS setup installs a local development CA. Your OS may request permission.');
 log('[YBR] Save pending recovery backups and export themes before changing browser origins.');
 const trust=run('mkcert',['-install'],{stdio:'inherit'});
 if(trust.error||trust.status!==0)throw Error('Local certificate trust was not installed. HTTPS setup stopped.');
 if(loadHttps(root,{})!==null){log('[YBR] Existing local certificates verified. HTTPS is ready for the next npm run dev.');return;}
 const caroot=run('mkcert',['-CAROOT'],{encoding:'utf8'});
 if(caroot.error||caroot.status!==0||!caroot.stdout?.trim())throw Error('Cannot locate the mkcert CA certificate.');
 const caFile=path.join(caroot.stdout.trim(),'rootCA.pem'),st=fs.statSync(caFile);
 if(!st.isFile()||st.size>1024*1024)throw Error('Invalid mkcert CA certificate.');
 const ca=fs.readFileSync(caFile); // Never read or copy rootCA-key.pem.
 const temp=fs.mkdtempSync(path.join(local,'tls-setup-'));fs.chmodSync(temp,0o700);
 try{
  const generated=run('mkcert',['-cert-file',path.join(temp,'cert.pem'),'-key-file',path.join(temp,'key.pem'),'localhost','127.0.0.1','::1'],{stdio:'inherit'});
  if(generated.error||generated.status!==0)throw Error('mkcert could not create local certificates.');
  fs.writeFileSync(path.join(temp,'ca.pem'),ca,{flag:'wx',mode:0o600});
  for(const name of names)fs.chmodSync(path.join(temp,name),0o600);
  fs.renameSync(temp,directory(root));
  loadHttps(root,{});
  log('[YBR] HTTPS ready: https://127.0.0.1:5173 and https://127.0.0.1:4173. Restart with npm run dev.');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
module.exports={loadHttps,localUrls,prepareHttpsEnvironment,setupHttps};
