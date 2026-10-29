import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadFilter,validatePreviewSelection} from '../src/upload-filters.js';
test('preview filter and validation accept only MP3, including uppercase extension and blank MIME',()=>{
 assert.equal(uploadFilter('preview').accept,'.mp3,audio/mpeg');
 for(const name of ['preview.mp3','PREVIEW.MP3'])assert.doesNotThrow(()=>validatePreviewSelection({name,type:''}));
 for(const name of ['preview.wav','preview.flac','preview.mp3.wav','preview'])assert.throws(()=>validatePreviewSelection({name,type:'audio/mpeg'}),/MP3 files only/);
});
test('role filters support WAV masters, safe public artwork and open native projects',()=>{
 assert.match(uploadFilter('master',{id:'sound-recording'}).accept,/\.wav/);
 assert.match(uploadFilter('master',{id:'musical-work'}).accept,/\.midi/);
 assert.match(uploadFilter('artwork').accept,/\.png/);assert.doesNotMatch(uploadFilter('artwork').accept,/svg/);
 assert.match(uploadFilter('lyrics').accept,/\.vtt/);assert.match(uploadFilter('metadata').accept,/\.json/);
 assert.equal(uploadFilter('project').accept,'');assert.equal(uploadFilter('master',{id:'software'}).accept,'');
});
