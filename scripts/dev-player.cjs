'use strict';
/** npm start entrypoint. Shares owner-only credentials with the local dashboard. */
const path=require('node:path');
const {selectPlayerAccess,savePlayerAccess}=require('./dev-player-access.cjs');
const {demoArtistAccount}=require('../apps/ybr-player/demo-login');
const ROOT=path.resolve(__dirname,'..');
async function main(){
 const host=process.env.HOST||'127.0.0.1';
 const port=Number(process.env.PORT||4173);
 // The shared credential file applies only to the standard local development Player.
 const local=['localhost','127.0.0.1','::1'].includes(host)&&port===4173;
 if(!local){
  const {runChild}=require('./dev.cjs');
  process.exitCode=await runChild(process.execPath,[path.join(ROOT,'apps','ybr-player','server.js')],{cwd:path.join(ROOT,'apps','ybr-player')});
  return;
 }
 const accounts=selectPlayerAccess(ROOT);
 const {createApp}=require('../apps/ybr-player/server.js');
 const demoAutoLogin=demoArtistAccount({host,port});
 const {server}=createApp({accounts,demoAutoLogin});
 server.once('error',()=>{console.error('[YBR] Player could not listen on its configured port.');process.exitCode=1;});
 server.listen(port,host,()=>{
  try{savePlayerAccess(ROOT,accounts);}
  catch(error){console.error('[YBR] '+error.message);server.close();process.exitCode=1;return;}
  console.log('[YBR] Player ready on http://'+host+':'+port);
  console.log('[YBR] Local credentials shared privately with the development dashboard.');
  if(demoAutoLogin)console.log('[YBR] Demo auto-login: artist (loopback only; Brick permissions still apply).');
  if(process.stdout.isTTY&&process.env.YBR_DEV_HIDE_SECRETS!=='1'&&!process.env.CI){
   for(const name of ['listener','artist']){
    const value=/^[\x20-\x7e]+$/.test(accounts[name])?accounts[name]:'[configured non-printable password]';
    console.log('  '+name+' / '+value);
   }
  }
 });
}
if(require.main===module)main().catch(()=>{console.error('[YBR] Player startup failed. Check local credential file permissions and dependencies.');process.exitCode=1;});
module.exports={main};
