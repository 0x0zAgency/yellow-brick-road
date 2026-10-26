'use strict';
/** Startup postconditions: usable Player logins and an actual playable demo Brick.
 * Dependencies are injected so every branch can be tested without a wallet.
 */
const {createHash}=require('node:crypto');
const PLAYER_URL=require('./dev-https.cjs').localUrls().player;
const DEMO_TITLE='Golden Hour — Road Release';
const DEMO_ARTIST='The Amber Sessions';
const IPID=/^0x[0-9a-f]{64}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const sameFactory=(status,factory,chainId=1337,genesisHash=null)=>status?.ready===true&&status.chainId===chainId&&
 (!genesisHash||status.genesisHash?.toLowerCase()===genesisHash.toLowerCase())&&
 typeof status.factoryAddress==='string'&&status.factoryAddress.toLowerCase()===factory.toLowerCase();

async function ensurePlayerSession({factoryAddress,chainId=1337,genesisHash=null,restart=false},{
 status,access,verify,restartLocal,start,onAccess=()=>{},onSecrets=()=>{},log=()=>{}
}){
 const previous=await status();
 if(previous&&!restart&&sameFactory(previous,factoryAddress,chainId,genesisHash)){
  const known=access({generate:false});
  if(known){
   onSecrets(known);
   if(await verify(known)){
    onAccess({...known,source:'reused',verified:true});
    log('Reusing YBR Player with both logins verified in this terminal.');
    return {source:'reused',verified:true};
   }
  }
 }
 // Never accept a running Player whose credentials cannot be displayed.
 // restartLocal must enforce same-user, same-checkout process inspection.
 if(previous||restart){
  onAccess({source:'starting',verified:false});
  log('Repairing this checkout\'s Player automatically; its active sessions will reset.');
  await restartLocal();
 }
 const credentials=access({generate:true});
 if(!credentials)throw Error('No local Player credentials are available.');
 onSecrets(credentials);
 onAccess({source:'starting',verified:false});
 await start(credentials);
 if(!(await verify(credentials)))throw Error('Player logins could not be verified. Startup stopped; unverified passwords were not displayed.');
 onAccess({...credentials,source:'owned',verified:true});
 log('YBR Player ready: listener and artist logins verified.');
 return {source:'owned',verified:true};
}

async function ensureDemoPublished({skip=false},{generate,list,publish,digest,log=()=>{}}){
 if(skip){log('Test music explicitly disabled by YBR_STACK_NO_DEMO_MUSIC=1.');return {state:'SKIPPED'};}
 await generate();
 const sha256=digest();
 if(!SHA.test(sha256))throw Error('Synthetic test audio has no valid SHA-256.');
 const find=catalog=>catalog?.tracks?.find(t=>t.source==='road'&&t.title===DEMO_TITLE&&
  t.creator===DEMO_ARTIST&&t.media?.sha256===sha256&&t.road?.licenseMode==='public-stream'&&IPID.test(t.id));
 let track=find(await list()),disposition='reused';
 if(!track){
  log('Publishing our generated Golden Hour fixture to Ganache (not private user media)...');
  await publish();
  // Re-read the registered catalog. A successful command alone is not evidence.
  track=find(await list());disposition='published';
 }
 if(!track)throw Error('Test music publication did not produce a discoverable Ganache Brick.');
 log('Ganache test music '+disposition+': '+track.id);
 return {state:'REGISTERED',id:track.id,sha256,title:track.title,
  factoryAddress:track.road.factoryAddress,disposition};
}

async function verifyDemoPlayback(demo,{fetchImpl=fetch,maxBytes=32*1024*1024}={}){
 if(demo?.state==='SKIPPED')return demo;
 if(!IPID.test(demo?.id)||!SHA.test(demo?.sha256)||typeof demo.factoryAddress!=='string')
  throw Error('A registered synthetic test Brick is required before playback verification.');
 const request=async path=>{
  const response=await fetchImpl(PLAYER_URL+path,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok){await response.body?.cancel();throw Error('Test music request failed (HTTP '+response.status+').');}
  return response;
 };
 const catalog=await (await request('/road/api/music')).json();
 const track=catalog?.tracks?.find(t=>t.id===demo.id&&t.media?.sha256===demo.sha256&&
  t.source==='road'&&t.road?.chainId===1337&&t.road?.licenseMode==='public-stream'&&
  t.road.factoryAddress?.toLowerCase()===demo.factoryAddress.toLowerCase());
 if(!track)throw Error('The running Player does not expose the registered Ganache test music.');
 // Fetch only our fixed loopback route, never a URL taken from metadata.
 const response=await request('/road/media/'+demo.id);
 if(!response.body)throw Error('Test music returned no audio bytes.');
 const reader=response.body.getReader(),hash=createHash('sha256');let size=0;
 try{
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>maxBytes)throw Error('Test music exceeds the playback verification limit.');
   hash.update(value);
  }
 }catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
 if(!size||hash.digest('hex')!==demo.sha256)throw Error('Test music playback bytes do not match the synthetic fixture.');
 return {...demo,state:'VERIFIED',mediaUrl:PLAYER_URL+'/road/media/'+demo.id};
}
module.exports={ensurePlayerSession,ensureDemoPublished,verifyDemoPlayback,DEMO_TITLE,DEMO_ARTIST};
