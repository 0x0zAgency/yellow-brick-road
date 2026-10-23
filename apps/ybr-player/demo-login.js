'use strict';
/** Disposable local-demo identity only. This never grants rights over a Brick. */
const {trustedLocalRequest}=require('./studio-http');
const loopback=address=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
function demoArtistAccount({host,port,env=process.env}){
 return ['127.0.0.1','localhost','::1'].includes(host)&&port===4173&&
  env.NODE_ENV!=='production'&&env.YBR_PLAYER_AUTO_LOGIN!=='0'?'artist':null;
}
function mayUseDemoLogin(req,boundAddress){
 // A reverse proxy or a wildcard-bound server must never inherit this shortcut.
 if(!boundAddress||!loopback(boundAddress.address)||!trustedLocalRequest(req))return false;
 if(Object.keys(req.headers).some(key=>key==='forwarded'||key.startsWith('x-forwarded-')))return false;
 const host=new URL('http://'+req.headers.host);
 if(Number(host.port||80)!==boundAddress.port)return false;
 // Browser POSTs must originate from this exact Player origin, not Mint Studio
 // or another local site. GET only advertises the mode and never creates a session.
 return req.method!=='POST'||req.headers.origin===host.origin;
}
module.exports={demoArtistAccount,mayUseDemoLogin};
