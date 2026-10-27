import test from 'node:test';
import assert from 'node:assert/strict';
import MP3Tag from 'mp3tag.js';
import {parseBuffer} from 'music-metadata';
import {readMp3Tags,writeMp3Tags,inspectEnvelope} from '../src/mp3-tag-editor.js';
import {extractUploadMetadata} from '../src/upload-metadata.js';
function audio(){const b=Buffer.alloc(417*8);for(let i=0;i<8;i++)b.set([255,251,144,100],i*417);return b;}
const png=Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
function fixture(version=3,extras={}){const file=MP3Tag.writeBuffer(audio(),{v2:{TIT2:'Original',TPE1:'Performer',TALB:'Album before',TCOM:'Composer',TEXT:'Lyricist',TXXX:[{description:'SONGWRITER',text:'Songwriter'},{description:'PRIVATE NOTE',text:'Keep me'}],COMM:[{language:'eng',descriptor:'',text:'Notes'},{language:'spa',descriptor:'Alternate',text:'Comentario'}],USLT:[{language:'eng',descriptor:'',text:'First line\nSecond line'}],APIC:[{format:'image/png',type:3,description:'Cover',data:png}],...extras}},{id3v2:{version,encoding:'utf-16',unsupported:true,padding:0}});return addRawFrame(file,'PRIV',Buffer.from('local.test\0\x01\x02\x03','latin1'));}
function addRawFrame(file,id,payload){
 const envelope=inspectEnvelope(file),frame=Buffer.alloc(10+payload.length);frame.write(id,0,'ascii');
 if(envelope.version===4)for(let i=0;i<4;i++)frame[4+i]=(payload.length>>>(7*(3-i)))&127;else frame.writeUInt32BE(payload.length,4);
 payload.copy(frame,10);const output=Buffer.concat([file.subarray(0,envelope.start),frame,file.subarray(envelope.start)]);
 const size=envelope.start-10+frame.length;for(let i=0;i<4;i++)output[6+i]=(size>>>(7*(3-i)))&127;return output;
}
for(const version of [3,4])test('real ID3v2.'+version+' round-trip keeps audio, private tags and pictures; album feeds Mint Studio',async()=>{
 const source=fixture(version),original=Buffer.from(source),before=await readMp3Tags(source);
 assert.equal(before.fields.album,'Album before');assert.equal(before.fields.songwriter,'Songwriter');assert.equal(before.readOnly,false);assert.equal(before.picture.mime,'image/png');
 const output=await writeMp3Tags(source,{album:'Mañana — 新作',composer:'New Composer',songwriter:'New Writer',lyrics:'New lyrics\nSecond line'});
 assert.deepEqual(source,original,'Input bytes must not change');assert.equal(output.audioVerified,true);
 const after=await readMp3Tags(output.bytes);assert.equal(after.fields.album,'Mañana — 新作');assert.equal(after.fields.composer,'New Composer');assert.equal(after.fields.lyricist,'Lyricist');assert.equal(after.fields.songwriter,'New Writer');
 const tags=MP3Tag.readBuffer(output.bytes.buffer);assert.deepEqual(tags.v2.PRIV,[{ownerId:'local.test',data:[1,2,3]}]);assert.deepEqual(tags.v2.APIC,MP3Tag.readBuffer(source).v2.APIC);assert.equal(tags.v2.TXXX.find(x=>x.description==='PRIVATE NOTE').text,'Keep me');assert.equal(tags.v2.COMM[1].text,'Comentario');
 const extracted=await extractUploadMetadata(new File([output.bytes],'updated.mp3',{type:'audio/mpeg'}));assert.equal(extracted.fields.release,'Mañana — 新作');assert.match(extracted.fields.songwriters,/New Writer/);
 const a=inspectEnvelope(source),b=inspectEnvelope(output.bytes);assert.deepEqual(new Uint8Array(source).slice(a.start,a.end),output.bytes.slice(b.start,b.end));
});
test('clearing standard album removes custom album aliases, without removing unrelated custom tags',async()=>{
 const source=fixture(3,{TXXX:[{description:'ALBUM TITLE',text:'Stale album'},{description:'NOTE',text:'Keep me'}]});
 const output=await writeMp3Tags(source,{album:''});const parsed=await parseBuffer(output.bytes,{mimeType:'audio/mpeg'});
 assert.equal(parsed.common.album,undefined);assert.equal(MP3Tag.readBuffer(output.bytes.buffer).v2.TXXX[0].text,'Keep me');
});
test('front-cover replacement/removal keeps other pictures and does not alter audio',async()=>{
 const source=fixture(3,{APIC:[{format:'image/png',type:3,description:'Front',data:png},{format:'image/png',type:4,description:'Back',data:png}]});
 const removed=await writeMp3Tags(source,{}, {coverMode:'remove'});assert.deepEqual(MP3Tag.readBuffer(removed.bytes.buffer).v2.APIC.map(p=>p.type),[4]);
 const replaced=await writeMp3Tags(source,{}, {coverMode:'replace',coverBytes:new Uint8Array(png)});assert.equal((await readMp3Tags(replaced.bytes)).coverCount,2);
 await assert.rejects(()=>writeMp3Tags(source,{}, {coverMode:'replace',coverBytes:new TextEncoder().encode('<svg/>')}),/PNG/);
});
test('ID3v1-only fields migrate to v2; new Unicode album is not truncated or shadowed',async()=>{
 const source=MP3Tag.writeBuffer(audio(),{v1:{title:'Old title',artist:'Old artist',album:'Old album',year:'2025',comment:'Old note',track:'2',genre:'13'}},{id3v1:{include:true},id3v2:{include:false}});
 const output=await writeMp3Tags(source,{album:'A longer album — Mañana and beyond thirty characters'}),read=await readMp3Tags(output.bytes);
 assert.equal(output.legacyMigrated,true);assert.equal(inspectEnvelope(output.bytes).hasV1,false);assert.equal(read.fields.title,'Old title');assert.equal(read.fields.album,'A longer album — Mañana and beyond thirty characters');
});
test('untagged MP3 supports a new album and never derives songwriter from performer',async()=>{
 const source=audio(),read=await readMp3Tags(source);assert.equal(read.fields.songwriter,'');
 const result=await writeMp3Tags(source,{title:'New',album:'First album'});assert.equal((await readMp3Tags(result.bytes)).fields.album,'First album');
});
test('non-MP3 input and flagged files cannot be exported',async()=>{
 await assert.rejects(()=>readMp3Tags(new TextEncoder().encode('Not an MP3 file')),/MP3|MPEG/);
 const source=new Uint8Array(fixture());source[5]=32;
 await assert.rejects(()=>writeMp3Tags(source,{album:'Nope'}),/Read-only|safely/);
});

test('standards-compliant padding belongs to the ID3 envelope, not the audio',async()=>{
 const source=fixture(),old=inspectEnvelope(source),padding=2048;
 const padded=Buffer.concat([source.subarray(0,old.start),Buffer.alloc(padding),source.subarray(old.start)]);
 const size=old.start-10+padding;for(let i=0;i<4;i++)padded[6+i]=(size>>>(7*(3-i)))&127;
 assert.equal(inspectEnvelope(padded).start,old.start+padding);
 const result=await writeMp3Tags(padded,{album:'Padded source album'});
 const envelope=inspectEnvelope(result.bytes);assert.equal(result.bytes[envelope.start],255);
 assert.deepEqual(result.bytes.slice(envelope.start,envelope.end),new Uint8Array(audio()));
 assert.equal((await readMp3Tags(result.bytes)).fields.album,'Padded source album');
});

test('unedited opaque frames are preserved byte-for-byte, not reconstructed from decoded values',async()=>{
 const source=addRawFrame(fixture(),'XABC',Buffer.from([0,1,255,0,42]));
 const result=await writeMp3Tags(source,{title:'Edited title'});
 for(const id of ['PRIV','XABC','APIC']){
  const a=inspectEnvelope(source).frameRanges.find(f=>f.id===id),b=inspectEnvelope(result.bytes).frameRanges.find(f=>f.id===id);
  assert.ok(a&&b,id);assert.deepEqual(new Uint8Array(source.subarray(a.start,a.end)),result.bytes.slice(b.start,b.end),id+' must be bit-identical');
 }
});
