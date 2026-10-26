'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {appearanceAsset}=require('../appearance-assets');
const {createApp}=require('../server');
test('Player presentation routes expose only the explicit public module allowlist',()=>{
 for(const name of ['appearance.js','appearance-palette.js','appearance-graphics.js','nft-cover-format.js','raster-display.js','player-appearance.js'])assert.ok(fs.existsSync(appearanceAsset('/appearance/'+name)));
 for(const route of ['/appearance/demo-vault.js','/appearance/../server.js','/appearance/.env','/appearance/chain-mint.js','/appearance/__proto__','/appearance/constructor'])assert.equal(appearanceAsset(route),null);
 assert.doesNotMatch(fs.readFileSync(appearanceAsset('/appearance/raster-display.js'),'utf8'),/import .*vault|import .*chain-mint/);
});
test('actual static HTTP settings routes preserve CSP and do not disclose private workspace files',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-appearance-assets-'));
 const app=createApp({accounts:{artist:'fixture'},roadGateway:{ready:async()=>({ready:false}),list:async()=>({status:{ready:false},tracks:[]}),track:async()=>null},studioLibrary:{list:()=>[],get:()=>null},interactionFile:path.join(dir,'events.ndjson')});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));fs.rmSync(dir,{force:true,recursive:true});});
 const origin='http://127.0.0.1:'+app.server.address().port;
 for(const route of ['/settings.mjs','/settings.css','/settings-icons.mjs','/appearance/appearance.js','/appearance/raster-display.js']){const res=await fetch(origin+route);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.match(res.headers.get('content-security-policy'),/script-src 'self';/);assert.doesNotMatch(res.headers.get('content-security-policy'),/unsafe-inline|unsafe-eval/);}
 for(const route of ['/appearance/demo-vault.js','/appearance/chain-mint.js','/appearance/.env','/.road-local/tls/key.pem'])assert.equal((await fetch(origin+route)).status,404);
 const html=await(await fetch(origin)).text();assert.doesNotMatch(html,/class="breadcrumb"|YBR <span>\/|PLAYER \/ ALPHA/);assert.equal((html.match(/THE YELLOW BRICK ROAD/g)||[]).length,2);
 assert.equal((await fetch(origin+'/settings.mjs',{method:'POST'})).status,405);
});
