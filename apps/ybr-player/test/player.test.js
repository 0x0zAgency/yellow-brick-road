'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {createApp, parseRange, canStream, loadBricks} = require('../server');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'ybr-player-test-'));
let server,base;

function json(pathname, body, cookie) {
  return fetch(`${base}${pathname}`,{
    method:'POST',
    headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},
    body:JSON.stringify(body)
  });
}
async function login(user,password) {
  const response=await json('/api/session',{username:user,password});
  return {response,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
test('range parsing handles common seek, suffix, and invalid ranges',()=>{
  assert.deepEqual(parseRange(null,100),{start:0,end:99,partial:false});
  assert.deepEqual(parseRange('bytes=10-19',100),{start:10,end:19,partial:true});
  assert.deepEqual(parseRange('bytes=95-',100),{start:95,end:99,partial:true});
  assert.deepEqual(parseRange('bytes=-5',100),{start:95,end:99,partial:true});
  assert.deepEqual(parseRange('bytes=0-1000',100),{start:0,end:99,partial:true});
  assert.equal(parseRange('bytes=101-',100),null);
  assert.equal(parseRange('bytes=20-10',100),null);
  assert.equal(parseRange('bytes=0-9,20-29',100),null);
});
test('manifest has integrity-checked media and per-account rights',()=>{
  const bricks=loadBricks();
  assert.equal(bricks.size,2);
  assert.ok(canStream(bricks.get('BRK-AUD-001'),'listener'));
  assert.equal(canStream(bricks.get('BRK-AUD-002'),'listener'),false);
  assert.ok(canStream(bricks.get('BRK-AUD-002'),'artist'));
});
test('real login → Brick lookup → authorization → byte-range playback; denied access and telemetry',async (t)=>{
  ({server}=createApp({accounts:{listener:'test-listener-password',artist:'test-artist-password'},eventFile:path.join(tmp,'events.ndjson')}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  base=`http://127.0.0.1:${server.address().port}`;

  let response=await fetch(`${base}/api/bricks`);
  assert.equal(response.status,401);
  let bad=await login('listener','wrong');
  assert.equal(bad.response.status,401);
  const {response:signin,cookie}=await login('listener','test-listener-password');
  assert.equal(signin.status,200);
  assert.ok(cookie.startsWith('ybr_session='));
  assert.match(signin.headers.get('set-cookie'),/HttpOnly/);
  response=await fetch(`${base}/api/bricks`,{headers:{Cookie:cookie}});
  assert.equal(response.status,200);
  const list=await response.json();
  assert.equal(list.bricks.length,2);
  assert.equal(list.bricks[0].streamAllowed,true);
  assert.equal(list.bricks[1].streamAllowed,false);
  assert.match(list.bricks[0].media.sha256,/^[a-f0-9]{64}$/);
  assert.equal(list.bricks[0].media.file,undefined);

  const stream='/api/bricks/BRK-AUD-001/media';
  response=await fetch(`${base}${stream}`,{headers:{Cookie:cookie,Range:'bytes=0-100'}});
  assert.equal(response.status,403,'cannot stream before authorization');
  response=await json('/api/bricks/BRK-AUD-002/authorize',{},cookie);
  assert.equal(response.status,403,'denies restricted brick');
  response=await json('/api/bricks/BRK-AUD-001/authorize',{},cookie);
  assert.equal(response.status,200);
  assert.equal((await response.json()).mediaUrl,stream);

  response=await fetch(`${base}${stream}`,{headers:{Cookie:cookie,Range:'bytes=0-99'}});
  assert.equal(response.status,206);
  assert.equal(response.headers.get('content-range'),'bytes 0-99/1152044');
  assert.equal((await response.arrayBuffer()).byteLength,100);
  response=await fetch(`${base}${stream}`,{headers:{Cookie:cookie,Range:'bytes=-16'}});
  assert.equal(response.status,206);
  assert.equal((await response.arrayBuffer()).byteLength,16);
  response=await fetch(`${base}${stream}`,{headers:{Cookie:cookie,Range:'bytes=999999999-'}});
  assert.equal(response.status,416);
  response=await fetch(`${base}${stream}`,{headers:{Cookie:cookie}});
  assert.equal(response.status,200);
  const digest=crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  assert.equal(digest,list.bricks[0].media.sha256);

  response=await json('/api/events',{brickId:'BRK-AUD-001',event:'play',positionSeconds:3.8},cookie);
  assert.equal(response.status,202);
  assert.equal((await response.json()).proofLevel,'unverified-client-report');
  assert.equal(fs.readFileSync(path.join(tmp,'events.ndjson'),'utf8').trim().length>0,true);
  response=await json('/api/events',{brickId:'BRK-AUD-002',event:'play',positionSeconds:0},cookie);
  assert.equal(response.status,403);

  const artist=await login('artist','test-artist-password');
  assert.equal(artist.response.status,200);
  response=await json('/api/bricks/BRK-AUD-002/authorize',{},artist.cookie);
  assert.equal(response.status,200);
  response=await fetch(`${base}/api/bricks/BRK-AUD-002/media`,{headers:{Cookie:artist.cookie,Range:'bytes=0-44'}});
  assert.equal(response.status,206);
  assert.equal((await response.arrayBuffer()).byteLength,45);

  response=await json('/api/logout',{},cookie);
  assert.equal(response.status,200);
  response=await fetch(`${base}${stream}`,{headers:{Cookie:cookie}});
  assert.equal(response.status,401,'logout invalidates access');
});
