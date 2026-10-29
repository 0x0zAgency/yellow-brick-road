'use strict';
/** Ephemeral test CA. Never touches OS trust or accesses a real mkcert CA. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
function createTestTls(root,{wallet=false}={}){
 const dir=path.join(root,'.road-local','tls');
 fs.mkdirSync(path.join(root,'.road-local'),{recursive:true,mode:0o700});
 fs.mkdirSync(dir,{mode:0o700}); // Fail rather than overwrite any existing certificates.
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-test-ca-'));
 const exec=args=>execFileSync('openssl',args,{cwd:work,stdio:'ignore'});
 try{
  exec(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca-key.pem','-out','ca.pem','-days','2','-subj','/CN=YBR disposable test CA','-addext','basicConstraints=critical,CA:TRUE']);
  exec(['req','-new','-newkey','rsa:2048','-nodes','-keyout','key.pem','-out','leaf.csr','-subj','/CN=localhost']);
  fs.writeFileSync(path.join(work,'san.cnf'),'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1'+(wallet?',DNS:*.ipfs.localhost':'')+'\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n');
  exec(['x509','-req','-in','leaf.csr','-CA','ca.pem','-CAkey','ca-key.pem','-CAcreateserial','-out','cert.pem','-days','2','-extfile','san.cnf']);
  for(const name of ['key.pem','cert.pem','ca.pem'])fs.writeFileSync(path.join(dir,name),fs.readFileSync(path.join(work,name)),{flag:'wx',mode:0o600});
  return dir;
 }finally{fs.rmSync(work,{recursive:true,force:true});}
}
module.exports={createTestTls};
