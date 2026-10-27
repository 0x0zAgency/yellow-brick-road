import test from 'node:test';
import assert from 'node:assert/strict';
import {readMp3,updateMp3} from '../src/mp3-tool-core.js';
import {tagHeader,concatBytes,inspectEnvelope} from '../src/mp3-tool-model.js';
import {extractUploadMetadata} from '../src/upload-metadata.js';
const encoder=new TextEncoder();
function frame(id,body,v){const h=new Uint8Array(10);h.set(encoder.encode(id));if(v===4)h.set(tagHeader(v,body.length).subarray(6),4);else new DataView(h.buffer).setUint32(4,body.length);return concatBytes([h,body]);}
function tagged(v=3){
 const text=(id,value)=>frame(id,concatBytes([new Uint8Array([3]),encoder.encode(value)]),v);
 const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));
 const art=frame('APIC',concatBytes([new Uint8Array([0]),encoder.encode('image/png\0'),new Uint8Array([3,0]),png]),v);
 const frames=[text('TIT2','Test title'),text('TALB','Original album'),text('TPE1','Artist'),text('TCOM','Composer'),text('TEXT','Lyricist'),text('TXXX','SONGWRITER\0Writer'),text('TXXX','CATALOG\0Keep this'),art,frame('XABC',new Uint8Array([7,9,0,3]),v)];
 const payload=concatBytes(frames),audio=new Uint8Array(417*8);for(let i=0;i<8;i++)audio.set([255,251,144,100],417*i);
 return concatBytes([tagHeader(v,payload.length),payload,audio]);
}
const file=b=>new File([b],'test.mp3',{type:'audio/mpeg'});
for(const version of [3,4])test('actual codecs: v2.'+version+' album and credits round-trip; untouched frames/art/audio are byte-identical',async()=>{
 const source=tagged(version),before=source.slice(),input=file(source),read=await readMp3(input);
 assert.equal(read.view.fields.album,'Original album');assert.equal(read.view.fields.songwriters,'Writer');assert.equal(read.view.readOnly,'');assert.equal(read.view.pictureCount,1);
 const result=await updateMp3(input,{album:'Mañana 日本語',songwriters:'New Writer',composer:'New Composer',lyricist:'New Lyricist',title:'New title'});
 assert.match(result.audioHash,/^[a-f0-9]{64}$/);assert.equal(result.name,'test-tagged.mp3');assert.deepEqual(source,before);
 const old=inspectEnvelope(source),next=inspectEnvelope(result.buffer);assert.deepEqual(next.audio,old.audio);
 for(const id of ['APIC','XABC'])assert.deepEqual(next.frames.find(f=>f.id===id).bytes,old.frames.find(f=>f.id===id).bytes);
 const oldTxxx=old.frames.filter(f=>f.id==='TXXX')[1];assert.ok(next.frames.some(f=>Buffer.from(f.bytes).equals(Buffer.from(oldTxxx.bytes))));
 const parsed=await readMp3(file(result.buffer));assert.equal(parsed.view.fields.album,'Mañana 日本語');assert.equal(parsed.view.fields.songwriters,'New Writer');assert.equal(parsed.view.fields.composer,'New Composer');assert.equal(parsed.view.fields.lyricist,'New Lyricist');
 const mint=await extractUploadMetadata(file(result.buffer),{role:'master'});assert.equal(mint.fields.release,'Mañana 日本語');assert.match(mint.fields.songwriters,/New Writer/);
});
test('removing a field is verified; tagless audio can acquire album and songwriter tags',async()=>{
 const b=tagged(),deleted=await updateMp3(file(b),{album:'',songwriters:''}),after=await readMp3(file(deleted.buffer));
 assert.equal(after.view.fields.album,'');assert.equal(after.view.fields.songwriters,'');
 const bare=file(inspectEnvelope(b).audio),result=await updateMp3(bare,{album:'First release',songwriters:'Author'});assert.equal((await readMp3(file(result.buffer))).view.fields.album,'First release');
});
test('legacy migration needs consent and retains album, track and comment before removing the old tag',async()=>{
 const audio=inspectEnvelope(tagged()).audio,legacy=Buffer.alloc(128);legacy.write('TAG');legacy.write('Legacy title',3);legacy.write('Legacy artist',33);legacy.write('Legacy album',63);legacy.write('2026',93);legacy.write('Legacy note',97);legacy[125]=0;legacy[126]=4;legacy[127]=17;
 const f=file(concatBytes([audio,legacy]));assert.equal((await readMp3(f)).view.legacy,true);await assert.rejects(()=>updateMp3(f,{title:'Changed'}),/Approve converting/);
 const out=await updateMp3(f,{title:'Changed'},{migrateLegacy:true}),info=await readMp3(file(out.buffer));assert.equal(info.view.legacy,false);assert.equal(info.view.fields.album,'Legacy album');assert.equal(info.view.fields.track,'4');assert.ok(info.view.tags.some(t=>t.value.includes('Legacy note')));
});
test('non-MP3 and complex tags never produce an edited file',async()=>{
 await assert.rejects(()=>readMp3(file(new TextEncoder().encode('not an MP3'))));const b=tagged();b[5]=0x20;const r=await readMp3(file(b));assert.match(r.view.readOnly,/flags/);await assert.rejects(()=>updateMp3(file(b),{album:'X'}));
});
