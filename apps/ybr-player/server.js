'use strict';
// YBR Player proof 001. Local-only reference implementation: no external SDKs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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

function createApp({ accounts = {}, now = () => Date.now(), eventFile = EVENTS } = {}) {
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
  const server = http.createServer(async (req, res) => {
    try {
      const origin = req.headers.origin;
      const expectedOrigin = `http://${req.headers.host}`;
      if (req.method === 'POST' && origin && origin !== expectedOrigin) return fail(res, 403, 'Cross-origin requests are not allowed');
      const url = new URL(req.url || '/', expectedOrigin);
      const route = url.pathname;
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Frame-Options', 'DENY');

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
      if (route === '/api/bricks' && req.method === 'GET') {
        const s=requireSession(req,res); if (!s) return;
        return sendJson(res,200,{format:'ybr-player-demo-manifest/0.1', bricks:[...bricks.values()].map(b=>exposeBrick(b,s.user))});
      }
      const brickRoute = /^\/api\/bricks\/([A-Za-z0-9-]+)(?:\/(authorize|media))?$/.exec(route);
      if (brickRoute) {
        const s=requireSession(req,res); if (!s) return;
        const brick=bricks.get(brickRoute[1]);
        if (!brick) return fail(res,404,'Brick not found');
        const action=brickRoute[2];
        if (!action && req.method==='GET') return sendJson(res,200,exposeBrick(brick,s.user));
        if (action==='authorize' && req.method==='POST') {
          if (!canStream(brick,s.user)) return fail(res,403, 'Streaming rights not granted for this Brick and account');
          s.grants.set(brick.id, now()+GRANT_MS);
          return sendJson(res,200,{ authorized:true,brickId:brick.id,mediaUrl:`/api/bricks/${brick.id}/media`,expiresInSeconds:GRANT_MS/1000 });
        }
        if (action==='media' && (req.method==='GET' || req.method==='HEAD')) {
          if (!canStream(brick,s.user) || !(s.grants.get(brick.id)>now())) return fail(res,403,'Playback authorization required');
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
        if (!['play','pause','ended'].includes(body.event) || !bricks.has(body.brickId) || !Number.isFinite(body.positionSeconds) || body.positionSeconds < 0 || body.positionSeconds>86400) return fail(res,400,'Invalid playback event');
        if (!canStream(bricks.get(body.brickId),s.user) || !(s.grants.get(body.brickId)>now())) return fail(res,403,'Playback authorization required');
        const entry={at:new Date(now()).toISOString(),kind:'client-reported-demo-event',user:s.user,brickId:body.brickId,event:body.event,positionSeconds:Math.round(body.positionSeconds*10)/10};
        fs.appendFileSync(eventFile,JSON.stringify(entry)+'\n','utf8');
        return sendJson(res,202,{recorded:true,proofLevel:'unverified-client-report',event:entry});
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res,405,'Method not allowed');
      const staticPath = route==='/'?'/index.html':route;
      if (!['/index.html','/styles.css','/app.js','/favicon.svg'].includes(staticPath)) return fail(res,404,'Not found');
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
      const status=e.message==='Request too large'?413:400;
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
