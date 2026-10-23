'use strict';
/** Local demo collector and aggregate reader, separate from ordinary diagnostics. */
const path=require('node:path'),crypto=require('node:crypto');
const {EVENTS,subjectFor,createInteractionStore}=require('./interactions');
const {trustedLocalRequest}=require('./studio-http');
function createInteractionHttp({file=path.resolve(__dirname,'../../.road-local/player-interactions/events.ndjson'),now,requireSession,studio,bricks,road,checkPermission,canStream,sendJson,readJson,fail}){
 const store=createInteractionStore({file,now});
 async function routeRequest(req,res,route,url){
      if (route === '/api/interactions' && req.method === 'POST') {
        const s=requireSession(req,res);if(!s)return;
        if(!trustedLocalRequest(req))return fail(res,403,'Interactions require the same-origin local Player.');
        const minute=Math.floor(now()/60000);
        if(s.interactionMinute!==minute){s.interactionMinute=minute;s.interactionCount=0;}
        if(++s.interactionCount>120)return fail(res,429,'Interaction report limit reached. Playback is unaffected.');
        const body=await readJson(req),role=EVENTS[body.event];
        if(!Object.hasOwn(EVENTS,body.event)||typeof body.brickId!=='string'||!Number.isFinite(body.positionSeconds))return fail(res,400,'Invalid interaction event.');
        const original=studio.get(body.brickId);
        const brick=bricks.get(body.brickId)||original||(body.brickId.startsWith('0x')?await road.track(body.brickId):null);
        if(!brick||original&&!(await checkPermission(original,role)).allowed||!original&&brick.source!=='road'&&!canStream(brick,s.user))return fail(res,403,'Current file permission is required.');
        if(role==='audio'&&!(s.grants.get(body.brickId)>now()))return fail(res,403,'Playback authorization required.');
        const subject=subjectFor(brick,role);
        if(subject.sha256!==body.sha256)return fail(res,409,'Interaction bytes differ from the authorized file.');
        s.interactionSalt||=crypto.randomBytes(32).toString('hex');
        const result=store.record({subject,event:body.event,eventId:body.eventId,playbackId:body.playbackId,sessionSalt:s.interactionSalt,positionSeconds:body.positionSeconds});
        return sendJson(res,202,{...result,proofLevel:'unverified-client-report'});
      }
      const interactionRead=/^\/api\/bricks\/(0x[\da-fA-F]{64}|[A-Za-z0-9-]+)\/interactions$/.exec(route);
      if(interactionRead&&req.method==='GET'){
        const s=requireSession(req,res);if(!s)return;
        // The shared artist profile is local demo administration, NOT a wallet
        // ownership assertion or a production creator-authentication mechanism.
        if(s.user!=='artist'||!trustedLocalRequest(req))return fail(res,403,'Local artist demo access required.');
        const role=url.searchParams.get('role')||'audio';
        if(!['audio','artwork','lyrics'].includes(role))return fail(res,400,'Invalid file role.');
        const id=interactionRead[1],original=studio.get(id);
        const brick=bricks.get(id)||original||(id.startsWith('0x')?await road.track(id):null);
        if(!brick||original&&!(await checkPermission(original,role)).allowed||!original&&brick.source!=='road'&&!canStream(brick,s.user))return fail(res,403,'Current file permission is required.');
        return sendJson(res,200,store.snapshot(subjectFor(brick,role)));
      }
  return fail(res,404,'Interaction endpoint not found.');
 }
 return {async handle(req,res,route,url){
  if(route!=='/api/interactions'&&!/^\/api\/bricks\/[^/]+\/interactions$/.test(route))return false;
  if(!['GET','POST'].includes(req.method)){fail(res,405,'Method not allowed');return true;}
  if(route==='/api/interactions'&&req.method!=='POST'||route!=='/api/interactions'&&req.method!=='GET'){fail(res,405,'Method not allowed');return true;}
  await routeRequest(req,res,route,url);return true;
 }};
}
module.exports={createInteractionHttp};
