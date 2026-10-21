import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encryptDemoBatch} from '../src/demo-vault.js';
import {buildPlayerRelease,publishPlayerRelease,playerReleaseFiles} from '../src/player-release.js';
const hash=data=>createHash('sha256').update(data).digest('hex');
const inputs={preview:{name:'preview.mp3',type:'audio/mpeg',data:new TextEncoder().encode('ID3 demo audio')},artwork:{name:'cover.png',type:'image/png',data:Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKxkAAAAASUVORK5CYII=','base64'))},lyrics:{name:'lyrics.txt',type:'text/plain',data:new TextEncoder().encode('Creator lyric one\nCreator lyric two')}};
async function fixture(){
 const secret='a private original encryption key for tests only';
 const items=Object.entries(inputs).map(([id,source])=>({id,originalSha256:hash(source.data),file:{name:source.name,type:source.type,arrayBuffer:async()=>source.data.buffer.slice(source.data.byteOffset,source.data.byteOffset+source.data.byteLength)}}));
 const vault=await encryptDemoBatch({items,secret,privacyMode:true});
 const media=Object.entries(inputs).map(([role,source])=>({role,name:source.name,mediaType:source.type,byteLength:source.data.length,integrity:{algorithm:'sha2-256',digest:'0x'+hash(source.data)}}));
 const packet={bricks:[{localId:'master',role:'Sound recording',metadata:{title:'Fresh upload',creators:[{name:'Creator'}],music:{release:'Album'},media:media.filter(file=>file.role==='preview')}},{localId:'artwork',role:'Cover artwork',metadata:{title:'Fresh upload cover',media:media.filter(file=>file.role==='artwork')}},{localId:'composition',role:'Composition',metadata:{title:'Fresh upload',media:media.filter(file=>file.role==='lyrics')}}]};
 return {packet,vault,mint:{simulated:true,receipts:[]},consent:true};
}

test('existing encrypted browser uploads become one release; preview preferred; key never serialized',async()=>{
 const options=await fixture();const data=await buildPlayerRelease(options);
 assert.equal(data.assets.audio.name,'preview.mp3');assert.equal(data.assets.artwork.name,'cover.png');assert.equal(data.assets.lyrics.name,'lyrics.txt');
 assert.equal(data.bricks.length,3);assert.equal(data.files.length,3);
 assert.equal(data.files.find(file=>file.role==='lyrics').sharedAs,'lyrics');
 assert.ok(!JSON.stringify(data).includes(options.vault.secret));assert.ok(!JSON.stringify(data).includes('ciphertext'));
 assert.equal(Buffer.from(data.assets.lyrics.base64,'base64').toString(),'Creator lyric one\nCreator lyric two');
 assert.equal(playerReleaseFiles(options.packet).audio.role,'preview');
});

test('explicit consent, successful mint, file hashes and missing browser vault gate sharing',async()=>{
 const opts=await fixture();
 await assert.rejects(buildPlayerRelease({...opts,consent:false}),/Confirm sharing/);
 await assert.rejects(buildPlayerRelease({...opts,mint:{simulated:false,status:'incomplete'}}),/Finish/);
 await assert.rejects(buildPlayerRelease({...opts,vault:null}),/no longer/);
 opts.packet.bricks[0].metadata.media[0].integrity.digest='0x'+'f'.repeat(64);
 await assert.rejects(buildPlayerRelease(opts),/no longer matches/);
});

test('request adapter shares only selected copies and whitelist metadata; can omit artwork or lyrics',async()=>{
 const opts=await fixture(),calls=[];
 const data=await publishPlayerRelease({...opts,includeArtwork:false},{fetchImpl:async(url,init)=>{
  calls.push({url,init});return new Response(JSON.stringify(url.endsWith('config')?{token:'a'.repeat(64)}:{brick:{id:'STUDIO-'+'b'.repeat(64)}}),{status:200,headers:{'Content-Type':'application/json'}});
 }});
 assert.match(data.brick.id,/^STUDIO-/);assert.equal(calls.length,2);
 const payload=JSON.parse(calls[1].init.body);assert.equal(payload.assets.artwork,undefined);assert.ok(payload.assets.audio);assert.ok(payload.assets.lyrics);
 assert.equal(calls[1].init.headers['X-YBR-Publish-Token'],'a'.repeat(64));assert.equal(calls[1].init.credentials,'same-origin');
 assert.ok(!calls[1].init.body.includes(opts.vault.secret));
});

test('aborted publication never starts its upload',async()=>{
 const opts=await fixture();const abort=new AbortController();abort.abort();
 await assert.rejects(buildPlayerRelease({...opts,signal:abort.signal}),{name:'AbortError'});
});

test('missing or unsupported Audio Preview never falls back to a playable Master Recording',async()=>{
 const opts=await fixture(),preview=opts.packet.bricks[0].metadata.media[0];
 const master={...preview,role:'master',name:'private-master.mp3'};
 opts.packet.bricks[0].metadata.media=[master];
 const forbidden={secret:'present',encrypted:{get(){throw Error('The master must never be read or decrypted');}}};
 assert.equal(playerReleaseFiles(opts.packet).audio,null);
 await assert.rejects(buildPlayerRelease({...opts,vault:forbidden}),/Audio Preview/);
 opts.packet.bricks[0].metadata.media.push({...preview,name:'bad.flp',mediaType:'application/octet-stream'});
 assert.equal(playerReleaseFiles(opts.packet).audio,null);
 await assert.rejects(buildPlayerRelease({...opts,vault:forbidden}),/Audio Preview/);
});
test('a valid preview is the only audio role read, even with a distinct supported master',async()=>{
 const opts=await fixture(),preview=opts.packet.bricks[0].metadata.media[0];
 opts.packet.bricks[0].metadata.media.unshift({...preview,role:'master',name:'secret-master.wav'});
 const reads=[],entries=opts.vault.encrypted;
 opts.vault={...opts.vault,encrypted:{get(role){reads.push(role);assert.notEqual(role,'master');return entries.get(role);}}};
 const result=await buildPlayerRelease(opts);
 assert.equal(result.audioSourceRole,'preview');assert.ok(reads.includes('preview'));assert.ok(!reads.includes('master'));
 assert.equal(result.files.find(f=>f.role==='master').sharedAs,null);
});
