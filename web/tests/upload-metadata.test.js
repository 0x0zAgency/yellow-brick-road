import test from 'node:test';
import assert from 'node:assert/strict';
import {filenameTitle,baselineMetadata,normalizeFields,audioSuggestions,extractUploadMetadata,resolveUploadFields,initialUploadForm,uploadFormReducer} from '../src/upload-metadata.js';

function upload(name,bytes,type='application/octet-stream'){return new File([bytes],name,{type});}
function taggedResult(title,source='embedded audio tags'){return {fields:{title},fieldSources:{title:source}};}
test('every file gets a conservative filename title; keep Unicode, hyphens and version numbers',()=>{
 for(const [file,title] of [['My_song.mp3','My song'],['a\\b\\My_Art.png','My Art'],['/private/Demo_Release_v2.final.flp','Demo Release v2.final'],['02 - Mañana.mp3','02 - Mañana'],['Björk.wav','Björk'],['readme','readme'],['.hidden','.hidden']])assert.equal(filenameTitle(file),title);
 assert.equal(baselineMetadata({name:'My_script.rs',type:'',size:9}).technical.byteLength,9);
});
test('normalizes descriptive fields without importing permissions, wallets, GPS or ownership',()=>{
 const fields=normalizeFields({title:'Tagged title',artist:'Artist',genre:'edm',bpm:120,isrc:'US-ABC-26-12345',controller:'0xbad',rights:'licensed',latitude:42,royalties:100});
 assert.deepEqual(fields,{title:'Tagged title',artist:'Artist',genre:'Dance / EDM',bpm:'120',isrc:'USABC2612345'});
 assert.equal(normalizeFields({genre:'unknown-custom',bpm:'NaN',isrc:'fake'}).genre,undefined);
});
test('audio adapter accepts files from any slot, extracts composers and technical attributes, not encoder as DAW',async()=>{
 const file=upload('Tagged_MP3.mp3','dummy','audio/mpeg');
 const out=await extractUploadMetadata(file,{role:'master',parseAudio:async selected=>{
  assert.equal(selected,file);return {common:{title:'Embedded',artist:'Tagged artist',album:'Release',composer:['Writer'],genre:['EDM'],bpm:128,key:'Am',isrc:['USABC2612345'],comment:[{text:'Notes'}]},format:{duration:60,sampleRate:48000,numberOfChannels:2,tool:'Encoder not DAW',codec:'MP3'}};
 }});
 assert.equal(out.fields.title,'Embedded');assert.equal(out.fields.songwriters,'Writer');assert.equal(out.fields.daw,undefined);
 assert.equal(out.technical.durationSeconds,60);assert.equal(out.technical.channels,2);
});
test('a malformed tag or unsupported file is non-fatal and retains the filename default',async()=>{
 const failed=await extractUploadMetadata(upload('broken_file.mp3','bad'),{parseAudio:async()=>{throw Error('untrusted file content');}});
 assert.equal(failed.fields.title,'broken file');assert.ok(failed.notice);assert.ok(!failed.notice.includes('untrusted'));
 const unknown=await extractUploadMetadata(upload('My_Blueprint.flp','binary'));
 assert.equal(unknown.fields.title,'My Blueprint');assert.equal(unknown.parser,'filename');
});
test('image and sidecar adapters read only chosen tags, not sensitive location fields',async()=>{
 const image=await extractUploadMetadata(upload('cover.jpg','test','image/jpeg'),{parseImage:async(_,options)=>{
  assert.equal(options.gps,false);return {ImageDescription:'My Artwork',Artist:'Visual Artist',ImageWidth:600,ImageHeight:600,GPSLatitude:45};
 }});
 assert.equal(image.fields.title,'My Artwork');assert.equal(image.technical.width,600);assert.equal(image.technical.GPSLatitude,undefined);
 const sidecar=await extractUploadMetadata(upload('release.json',JSON.stringify({title:'Song',album:'Collection',artist:'Creator',rights:'allow-all'}),'application/json'),{role:'metadata'});
 assert.equal(sidecar.fields.release,'Collection');assert.equal(sidecar.fields.rights,undefined);
});
test('manual edits including intentional clearing win; preview tags beat master tags; artwork cannot rename a release',()=>{
 const uploads={master:{result:taggedResult('Master Title')},preview:{result:taggedResult('Preview Title')},artwork:{result:taggedResult('Cover name')}};
 assert.equal(resolveUploadFields({title:''},[],uploads).values.title,'Preview Title');
 assert.equal(resolveUploadFields({title:'My edit'},['title'],uploads).values.title,'My edit');
 assert.equal(resolveUploadFields({title:''},['title'],uploads).values.title,'');
 assert.equal(resolveUploadFields({title:''},[],{artwork:uploads.artwork}).values.title,'');
 assert.equal(resolveUploadFields({title:''},[],{master:{result:taggedResult('Master filename','filename')},preview:{result:taggedResult('Preview tags')}}).values.title,'Preview tags');
});
test('replacements, resets and same-name stale reads never restore old inferred tags',()=>{
 let state=initialUploadForm({title:'',artist:'',daw:'FL Studio'});
 state=uploadFormReducer(state,{type:'start',role:'master',id:1,result:taggedResult('Old','filename')});
 state=uploadFormReducer(state,{type:'start',role:'master',id:2,result:taggedResult('New','filename')});
 state=uploadFormReducer(state,{type:'finish',role:'master',id:1,result:taggedResult('Stale')});
 assert.equal(resolveUploadFields(state.manual,state.touched,state.uploads).values.title,'New');
 state=uploadFormReducer(state,{type:'edit',field:'title',value:''});
 state=uploadFormReducer(state,{type:'finish',role:'master',id:2,result:taggedResult('Too late')});
 assert.equal(resolveUploadFields(state.manual,state.touched,state.uploads).values.title,'');
 state=uploadFormReducer(state,{type:'clear-files'});assert.deepEqual(state.uploads,{});
});

// Actual encoded format fixtures, no parser mocks. The short MPEG frames below
// are synthetic tag-reader fixtures, not music or playback demonstration assets.
function mp3(){
 const frame=(id,text)=>{const body=Buffer.concat([Buffer.from([3]),Buffer.from(text)]),header=Buffer.alloc(10);header.write(id);header.writeUInt32BE(body.length,4);return Buffer.concat([header,body]);};
 const tags=Buffer.concat([frame('TIT2','MP3 embedded title'),frame('TPE1','MP3 Artist'),frame('TALB','Album'),frame('TCOM','Composer'),frame('TEXT','Lyricist'),frame('TXXX','SONGWRITER\0Custom Writer'),frame('TXXX','WRITER\0Composer'),frame('TCON','Electronic'),frame('TBPM','123')]);
 const header=Buffer.from([73,68,51,3,0,0,0,0,0,0]);let size=tags.length;for(let i=9;i>=6;i--){header[i]=size&127;size>>=7;}
 const audio=Buffer.alloc(417*8);for(let i=0;i<8;i++)Buffer.from([255,251,144,0]).copy(audio,i*417);
 return Buffer.concat([header,tags,audio]);
}
test('real music-metadata reads MP3 tags and a WAV INFO title',async()=>{
 const actual=await extractUploadMetadata(upload('fallback.mp3',mp3(),'audio/mpeg'),{role:'master'});
 assert.equal(actual.fields.title,'MP3 embedded title',actual.notice);assert.equal(actual.fields.artist,'MP3 Artist');assert.equal(actual.fields.songwriters,'Composer, Lyricist, Custom Writer');assert.equal(actual.fields.release,'Album');
 const chunk=(id,body)=>{const head=Buffer.alloc(8);head.write(id);head.writeUInt32LE(body.length,4);return Buffer.concat([head,body,body.length%2?Buffer.alloc(1):Buffer.alloc(0)]);};
 const fmt=Buffer.alloc(16);fmt.writeUInt16LE(1);fmt.writeUInt16LE(1,2);fmt.writeUInt32LE(24000,4);fmt.writeUInt32LE(48000,8);fmt.writeUInt16LE(2,12);fmt.writeUInt16LE(16,14);
 const content=Buffer.concat([Buffer.from('WAVE'),chunk('fmt ',fmt),chunk('LIST',Buffer.concat([Buffer.from('INFO'),chunk('INAM',Buffer.from('WAV embedded title\0')),chunk('IART',Buffer.from('WAV Artist\0'))])),chunk('data',Buffer.alloc(48000))]);
 const size=Buffer.alloc(4);size.writeUInt32LE(content.length);
 const wav=await extractUploadMetadata(upload('fallback.wav',Buffer.concat([Buffer.from('RIFF'),size,content]),'audio/wav'));
 assert.equal(wav.fields.title,'WAV embedded title',wav.notice);assert.equal(wav.fields.artist,'WAV Artist');assert.equal(wav.technical.sampleRateHz,24000);
});

test('album and songwriter aliases are extracted without inventing artist-based authorship',()=>{
 const metadata={common:{album:'Album',artist:'Performer',composer:[' Writer '],lyricist:['Lyricist'],writer:['writer']},native:{'ID3v2.4':[
  {id:'TXXX:SONGWRITER',value:'Custom Writer'}, {id:'TXXX:Songwriters',value:['writer','Second Writer']},
  {id:'TXXX:OWNER',value:'Do not import'}, {id:'TALB',value:'Lower-priority album'}]}};
 assert.equal(audioSuggestions(metadata).release,'Album');
 assert.equal(audioSuggestions(metadata).songwriters,'Writer, Lyricist, Custom Writer, Second Writer');
 assert.equal(audioSuggestions({common:{artist:'Performer',albumartist:'Band'}}).songwriters,'');
 assert.equal(audioSuggestions({native:{'ID3v2.3':[{id:'TALB',value:'Native album'},{id:'TCOM',value:'Composer'},{id:'TEXT',value:'Lyricist'}]}}).release,'Native album');
});
test('album and songwriter manual edits, including clearing, survive parsed replacements',()=>{
 const uploads={master:{result:{fields:{release:'Tagged album',songwriters:'Tagged writer'},fieldSources:{release:'embedded audio tags',songwriters:'embedded audio tags'}}}};
 const first=resolveUploadFields({release:'',songwriters:''},[],uploads);
 assert.equal(first.values.release,'Tagged album');assert.equal(first.values.songwriters,'Tagged writer');
 for(const manual of [{release:'My album',songwriters:'My writer'},{release:'',songwriters:''}])assert.deepEqual(resolveUploadFields(manual,['release','songwriters'],uploads).values,manual);
});
