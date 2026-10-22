'use strict';
const {describeSavedUpload,newestSavedUploads}=require('./studio-catalog');
// YBR Player proof 001. Local-only reference implementation: no external SDKs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createStudioLibrary } = require('./studio-releases');
const { createStudioHttp } = require('./studio-http');
const { readPlayerCatalog } = require('./road-registry');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const MEDIA = path.join(ROOT, 'media');
const MANIFEST = path.join(ROOT, 'data', 'bricks.json');
const EVENTS = path.join(ROOT, 'data', 'player-events.ndjson');
const SESSION_MS = 60 * 60 * 1000;
const GRANT_MS = 30 * 60 * 1000;
const MAX_BODY_BYTES = 10_000;
const COOKIE = 'ybr_session';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function loadBricks() {
  const payload = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (payload.format !== 'ybr-player-demo-manifest/0.1' || !Array.isArray(payload.bricks)) {
    throw new Error('Invalid local YBR Player demo manifest');
  }
  const bricks = new Map();
  for (const brick of payload.bricks) {
    const file = brick.media?.file;
    if (!file || path.basename(file) !== file || !/^[a-zA-Z0-9._-]+$/.test(file)) throw new Error(`Unsafe media filename for ${brick.id}`);
    if (!/^[A-Za-z0-9-]+$/.test(brick.id)) throw new Error('Unsafe Brick identifier');
    const mediaPath = path.resolve(MEDIA, file);
    if (path.dirname(mediaPath) !== MEDIA) throw new Error('Media must be inside the media directory');
    const digest = crypto.createHash('sha256').update(fs.readFileSync(mediaPath)).digest('hex');
    if (digest !== brick.media.sha256) throw new Error(`SHA-256 mismatch for ${brick.id}; refusing to serve changed media`);
    bricks.set(brick.id, { ...brick, mediaPath });
  }
  return bricks;
}

function exposeBrick(brick, user) {
  return {
    id: brick.id, type: brick.type, title: brick.title, creator: brick.creator,
    description: brick.description, durationSeconds: brick.durationSeconds,
    theme: brick.theme, streamAllowed: canStream(brick, user),
    rights: brick.rights,
    media: { mimeType: brick.media.mimeType, sha256: brick.media.sha256 },
    provenance: brick.provenance
  };
}

function canStream(brick, user) {
  if(brick.source==='studio-demo')return Boolean(user);
  return Boolean(brick.permissions?.stream?.allowed && brick.permissions.stream.allowedAccounts?.includes(user));
}

function sendJson(res, status, data, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control':'no-store', ...extra });
  res.end(JSON.stringify(data));
}
function fail(res, status, message) { sendJson(res, status, { error: message }); }

async function readJson(req) {
  let content = '';
  for await (const chunk of req) {
    content += chunk.toString();
    if (Buffer.byteLength(content) > MAX_BODY_BYTES) throw new Error('Request too large');
  }
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Expected application/json');
  try { return JSON.parse(content || '{}'); } catch { throw new Error('Invalid JSON'); }
}
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  return raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || '';
}
function parseRange(range, size) {
  if (!range) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix === 0) return null;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start < 0 || end < start) return null;
  return { start, end: Math.min(end, size - 1), partial: true };
}
function constantTimeEquals(a, b) {
  const x=Buffer.from(String(a)); const y=Buffer.from(String(b));
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}

function streamAudio(req,res,brick) {
  const st=fs.statSync(brick.mediaPath);
  const range=parseRange(req.headers.range,st.size);
  if(!range){res.writeHead(416,{'Content-Range':`bytes */${st.size}`,'Cache-Control':'no-store'});return res.end();}
  const {start,end,partial}=range;
  res.writeHead(partial?206:200,{
    'Content-Type':brick.media.mimeType,
    'Content-Length':end-start+1,
    'Accept-Ranges':'bytes',
    'Cache-Control':'private, no-store',
    'X-YBR-Content-SHA256':brick.media.sha256,
    ...(partial?{'Content-Range':`bytes ${start}-${end}/${st.size}`}:{})
  });
  if(req.method==='HEAD')return res.end();
  return fs.createReadStream(brick.mediaPath,{start,end}).pipe(res);
}
function createApp({ accounts = {}, now = () => Date.now(), eventFile = EVENTS, roadGateway, studioLibrary } = {}) {
  const studio = studioLibrary || createStudioLibrary();
  const road = roadGateway || require('./road-music').makeGateway();
  const bricks = loadBricks();
  const sessions = new Map();
  const attempts = new Map();

  function sessionFrom(req) {
    const id = getCookie(req, COOKIE);
    const s = sessions.get(id);
    if (!s) return null;
    if (s.expires <= now()) { sessions.delete(id); return null; }
    return s;
  }
  function requireSession(req, res) {
    const s = sessionFrom(req);
    if (!s) fail(res,401,'Sign in to access your YBR bricks');
    return s;
  }
  const checkPermission=async(record,role='audio')=>road.playerPolicy?road.playerPolicy.check(record,role):{allowed:!record?.authorization};
  async function permittedStudio(idOrBrick,knownGrant){
    const brick=typeof idOrBrick==='string'?studio.get(idOrBrick):idOrBrick;
    if(!brick)return null;
    const grant=knownGrant||await checkPermission(brick);
    if(!grant.allowed)return null;
    const result={...brick,policy:grant.onChain?grant:null};
    if(brick.artwork&&!(await checkPermission(brick,'artwork')).allowed){result.artwork=null;result.files=brick.files.map(file=>({...file,artworkUrl:null}));}
    if(brick.lyrics&&!(await checkPermission(brick,'lyrics')).allowed)result.lyrics=null;
    return result;
  }
  const studioHttp = createStudioHttp({library:studio,sendJson,requireSession,parseRange,checkPermission});
  const server = http.createServer(async (req, res) => {
    try {
      const origin = req.headers.origin;
      const expectedOrigin = `http://${req.headers.host}`;
      if (req.method === 'POST' && origin && origin !== expectedOrigin) return fail(res, 403, 'Cross-origin requests are not allowed');
      const url = new URL(req.url || '/', expectedOrigin);
      const route = url.pathname;
      // Public playback is a deliberately open, rights-gated API.
      // Cross-origin reads are allowed only here, never on private session APIs.
      if (route.startsWith('/road/')) {
        res.setHeader('Access-Control-Allow-Origin','*');
        res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Expose-Headers','Content-Length, Content-Range, Accept-Ranges, X-YBR-Content-SHA256');
        if (req.method==='OPTIONS') {
          res.writeHead(204,{'Cache-Control':'no-store','Access-Control-Max-Age':'600'});
          return res.end();
        }
      }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Frame-Options', 'DENY');

      if (await studioHttp.handle(req,res,route)) return;

      if (route === '/api/session' && req.method === 'GET') {
        const s = sessionFrom(req);
        return sendJson(res, 200, {authenticated:!!s, user:s?.user || null});
      }
      if (route === '/api/session' && req.method === 'POST') {
        const ip = req.socket.remoteAddress || 'local';
        const entry = attempts.get(ip) || { count:0, until:0 };
        if (entry.until > now()) return fail(res,429,'Too many attempts. Try again in one minute.');
        const { username, password } = await readJson(req);
        if (typeof username !== 'string' || typeof password !== 'string' || !Object.hasOwn(accounts, username) || !constantTimeEquals(password, accounts[username])) {
          entry.count++;
          if (entry.count >= 8) { entry.count=0; entry.until=now()+60_000; }
          attempts.set(ip,entry);
          return fail(res,401,'Incorrect username or password');
        }
        attempts.delete(ip);
        const id = crypto.randomBytes(32).toString('hex');
        sessions.set(id, { user: username, expires: now()+SESSION_MS, grants: new Map() });
        const secure = req.socket.encrypted ? '; Secure' : '';
        return sendJson(res,200,{authenticated:true,user:username},{'Set-Cookie':`${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${secure}`});
      }
      if (route === '/api/logout' && req.method === 'POST') {
        sessions.delete(getCookie(req,COOKIE));
        return sendJson(res,200,{ok:true},{'Set-Cookie':`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`});
      }
      // Public Road Music API for other players; no YBR Player login required.
      // Authorization is the opt-in license committed by the current Brick controller.
      if (route === '/road/api/status' && req.method === 'GET') {
        return sendJson(res,200,await road.ready());
      }
      // Registration visibility is independent of public playback eligibility.
      if (route === '/road/api/registry' && req.method === 'GET') {
        if(typeof road.registry!=='function')return fail(res,503,'Registry discovery is unavailable. Restart the updated local Player.');
        try {
          const catalog=await readPlayerCatalog(road);
          if(!catalog.status.ready)return sendJson(res,503,{...catalog.registry,error:catalog.status.reason||'Registry is offline.'});
          return sendJson(res,200,catalog.registry);
        } catch { return fail(res,503,'Unable to verify the local registry. Check Ganache and the configured factory, then refresh.'); }
      }
      if (route === '/road/api/music' && req.method === 'GET') {
        const catalog=await road.list();
        return sendJson(res,200,{network:catalog.status,tracks:catalog.tracks.map(({mediaPath,...item})=>({
          ...item,mediaUrl:'/road/media/'+item.id,metadataUrl:'/road/metadata/'+item.id
        }))});
      }
      const publicRoadRoute=/^\/road\/(api\/music|media|metadata)\/(0x[\da-fA-F]{64})$/.exec(route);
      if (publicRoadRoute && (req.method==='GET'||req.method==='HEAD')) {
        const brick=await road.track(publicRoadRoute[2]);
        if (!brick) return fail(res,404,'No currently authorized, public Road audio at this Brick');
        if (publicRoadRoute[1]==='api/music') {
          if (req.method==='HEAD')return res.writeHead(200,{'Cache-Control':'no-store'}).end();
          const {mediaPath,...published}=brick;
          return sendJson(res,200,{...published,mediaUrl:'/road/media/'+brick.id});
        }
        if (publicRoadRoute[1]==='metadata') {
          const data=fs.readFileSync(path.join(ROOT,'data/road-public',brick.id+'.json'));
          res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':data.length,'Cache-Control':'no-store'});
          return req.method==='HEAD'?res.end():res.end(data);
        }
        return streamAudio(req,res,brick);
      }
      if (route === '/api/bricks' && req.method === 'GET') {
        const s=requireSession(req,res); if (!s) return;
        let catalog;
        try { catalog=await readPlayerCatalog(road); }
        catch { catalog={status:{ready:false,reason:'Registry verification failed. Check Ganache and refresh.'},bricks:[]}; }
        const stored=await Promise.all(studio.list().map(async item=>{
          const grant=await checkPermission(item);
          return {summary:describeSavedUpload(item,grant),playable:await permittedStudio(item,grant)};
        }));
        return sendJson(res,200,{format:'ybr-player-demo-manifest/0.4',
          network:catalog.status,registry:catalog.registry?{matchingEvents:catalog.registry.matchingEvents,limitReached:catalog.registry.limitReached,limited:catalog.registry.limited}:null,
          uploads:newestSavedUploads(stored.map(item=>item.summary)),
          bricks:[...bricks.values()].map(b=>exposeBrick(b,s.user)).concat(catalog.bricks,stored.map(item=>item.playable).filter(Boolean))});
      }
      const brickRoute = /^\/api\/bricks\/(0x[\da-fA-F]{64}|[A-Za-z0-9-]+)(?:\/(authorize|media))?$/.exec(route);
      if (brickRoute) {
        const s=requireSession(req,res); if (!s) return;
        let brick=bricks.get(brickRoute[1]) || await permittedStudio(brickRoute[1]) || (brickRoute[1].startsWith('0x')?await road.track(brickRoute[1]):null);
        if(!brick&&brickRoute[1].startsWith('0x')&&typeof road.registry==='function'){
          const index=await road.registry();
          brick=index.bricks.find(item=>item.id.toLowerCase()===brickRoute[1].toLowerCase());
        }
        if (!brick) return fail(res,404,'Brick not found');
        const action=brickRoute[2];
        if (!action && req.method==='GET') {
          if(brick.source==='studio-demo'||brick.source==='road-registry')return sendJson(res,200,brick);
          if(brick.source==='road'){const {mediaPath,...publicBrick}=brick;return sendJson(res,200,publicBrick);}
          return sendJson(res,200,exposeBrick(brick,s.user));
        }
        if (action==='authorize' && req.method==='POST') {
          if (brick.source!=='road' && !canStream(brick,s.user)) return fail(res,403, 'Streaming rights not granted for this Brick and account');
          s.grants.set(brick.id, now()+GRANT_MS);
          return sendJson(res,200,{ authorized:true,brickId:brick.id,mediaUrl:brick.source==='road'?'/road/media/'+brick.id:`/api/bricks/${brick.id}/media`,expiresInSeconds:GRANT_MS/1000 });
        }
        if (action==='media' && (req.method==='GET' || req.method==='HEAD')) {
          if(brick.source==='road')return streamAudio(req,res,brick);
          if (!canStream(brick,s.user) || !(s.grants.get(brick.id)>now())) return fail(res,403,'Playback authorization required');
          if(brick.source==='studio-demo')return await studioHttp.deliver(req,res,brick.id,'audio');
          const st=fs.statSync(brick.mediaPath);
          const range=parseRange(req.headers.range,st.size);
          if (!range) { res.writeHead(416,{'Content-Range':`bytes */${st.size}`,'Cache-Control':'no-store'});return res.end(); }
          const {start,end,partial}=range;
          res.writeHead(partial?206:200,{
            'Content-Type':brick.media.mimeType,
            'Content-Length':end-start+1,
            'Accept-Ranges':'bytes',
            'Cache-Control':'private, no-store',
            'X-YBR-Content-SHA256':brick.media.sha256,
            ...(partial?{'Content-Range':`bytes ${start}-${end}/${st.size}`}:{})
          });
          if (req.method==='HEAD')return res.end();
          return fs.createReadStream(brick.mediaPath,{start,end}).pipe(res);
        }
      }
      if (route === '/api/events' && req.method === 'POST') {
        const s=requireSession(req,res);if (!s)return;
        const body=await readJson(req);
        if (!['play','pause','ended'].includes(body.event) || typeof body.brickId!=='string' || !Number.isFinite(body.positionSeconds) || body.positionSeconds < 0 || body.positionSeconds>86400) return fail(res,400,'Invalid playback event');
        const eventBrick=bricks.get(body.brickId)||await permittedStudio(body.brickId)||(body.brickId.startsWith('0x')?await road.track(body.brickId):null);
        if (!eventBrick || (eventBrick.source!=='road'&&!canStream(eventBrick,s.user)) || !(s.grants.get(body.brickId)>now())) return fail(res,403,'Playback authorization required');
        const entry={at:new Date(now()).toISOString(),kind:'client-reported-demo-event',user:s.user,brickId:body.brickId,event:body.event,positionSeconds:Math.round(body.positionSeconds*10)/10};
        fs.appendFileSync(eventFile,JSON.stringify(entry)+'\n','utf8');
        return sendJson(res,202,{recorded:true,proofLevel:'unverified-client-report',event:entry});
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res,405,'Method not allowed');
      const staticPath = route==='/'?'/index.html':route;
      if (!['/index.html','/styles.css','/app.js','/favicon.svg','/release-ui.js','/releases.css','/library-model.js','/saved-uploads.js'].includes(staticPath)) return fail(res,404,'Not found');
      const filePath=path.join(PUBLIC,staticPath.slice(1));
      const body=fs.readFileSync(filePath);
      res.writeHead(200,{
        'Content-Type':TYPES[path.extname(filePath)]||'application/octet-stream',
        'Content-Length':body.length, 'Cache-Control':'no-store',
        'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
      });
      if(req.method==='HEAD')return res.end();
      return res.end(body);
    } catch (e) {
      const status=e.status || (e.message==='Request too large'?413:400);
      if(!res.headersSent) return fail(res,status,e.message);
      res.destroy(e);
    }
  });
  return {server,bricks,sessions};
}

if (require.main===module) {
  const listenerPassword=process.env.YBR_LISTENER_PASSWORD || crypto.randomBytes(8).toString('base64url');
  const artistPassword=process.env.YBR_ARTIST_PASSWORD || crypto.randomBytes(8).toString('base64url');
  const port=Number(process.env.PORT || 4173);
  const host=process.env.HOST || '127.0.0.1';
  const {server,bricks}=createApp({accounts:{listener:listenerPassword,artist:artistPassword}});
  server.listen(port,host,()=>{
    console.log(`\nYBR PLAYER • ${bricks.size} integrity-checked audio Bricks`);
    console.log(`Open http://${host}:${port}\n`);
    console.log('Local demonstration accounts (passwords reset on restart unless set with env):');
    console.log(`  listener / ${listenerPassword}  (public demo Brick only)`);
    console.log(`  artist   / ${artistPassword}  (both demo Bricks)`);
    console.log('\nThis is a local reference implementation, NOT production authentication.\n');
  });
}
module.exports={createApp,parseRange,canStream,loadBricks};
