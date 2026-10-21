'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createStudioLibrary,sha256}=require('../studio-releases');
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-listing-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}
function payload(title='Preview'){
 const bytes=Buffer.from('RIFF-demo-playback-bytes');
 return {format:'ybr-studio-preview/1',audioSourceRole:'preview',consent:'share-selected-copies-with-local-player',title,creator:'Artist',
  assets:{audio:{name:'preview.wav',mime:'audio/wav',sha256:sha256(bytes),base64:bytes.toString('base64')}},
  files:[{role:'preview',name:'preview.wav',sharedAs:'audio'}],publishedAt:'9999-01-01T00:00:00.000Z'};
}
test('server dates publications; identical retries and reopening preserve the original date',t=>{
 const directory=fixture(t);let now=Date.parse('2026-01-01T00:00:00.000Z');
 const library=createStudioLibrary({directory,now:()=>now});
 const first=library.publish(payload('Older')).brick;
 now+=10000;const second=library.publish(payload('Newer')).brick;
 now+=10000;const retry=library.publish(payload('Older'));
 assert.equal(first.publishedAt,'2026-01-01T00:00:00.000Z');
 assert.equal(second.publishedAt,'2026-01-01T00:00:10.000Z');
 assert.equal(retry.created,false);assert.equal(retry.brick.id,first.id);assert.equal(retry.brick.publishedAt,first.publishedAt);
 assert.equal(createStudioLibrary({directory}).get(second.id).publishedAt,second.publishedAt);
});
test('existing undated releases use a stable file-time fallback, not current startup time',t=>{
 const directory=fixture(t),library=createStudioLibrary({directory});
 const {brick}=library.publish(payload());const filename=path.join(directory,brick.id,'release.json');
 const record=JSON.parse(fs.readFileSync(filename));delete record.publishedAt;delete record.publishedAtSource;
 fs.writeFileSync(filename,JSON.stringify(record));const time=new Date('2025-07-01T12:00:00Z');fs.utimesSync(filename,time,time);
 const old=createStudioLibrary({directory}).get(brick.id),reopened=createStudioLibrary({directory}).get(brick.id);
 assert.equal(old.publishedAt,'2025-07-01T12:00:00.000Z');assert.equal(reopened.publishedAt,old.publishedAt);
 assert.equal(old.publishedAtSource,'legacy-file-time');
});
test('missing/truncated preview or malformed record is hidden without deleting or losing other releases',t=>{
 const directory=fixture(t),library=createStudioLibrary({directory});
 const missing=library.publish(payload('Missing')).brick,truncated=library.publish(payload('Truncated')).brick;
 const broken=library.publish(payload('Broken JSON')).brick,good=library.publish(payload('Good')).brick;
 fs.unlinkSync(path.join(directory,missing.id,'audio.bin'));
 fs.writeFileSync(path.join(directory,truncated.id,'audio.bin'),'x');
 fs.writeFileSync(path.join(directory,broken.id,'release.json'),'{bad');
 assert.deepEqual(library.list().map(b=>b.id),[good.id]);
 assert.ok(fs.existsSync(path.join(directory,truncated.id,'audio.bin')));
});
