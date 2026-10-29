import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectEnvelope,validateChanges,updatedFilename} from '../src/mp3-tag-editor.js';
import {startTagTask} from '../src/mp3-tags-task.js';
const audio=()=>new Uint8Array([255,251,144,100,0,0,0,0]);
function header(version=3,flags=0){return new Uint8Array([73,68,51,version,0,flags,0,0,0,0,...audio()]);}
test('MP3 envelope bounds are enforced before any dependency parses a tag',()=>{
 assert.equal(inspectEnvelope(audio()).hasV2,false);
 assert.equal(inspectEnvelope(header()).version,3);
 assert.throws(()=>inspectEnvelope(new Uint8Array(3)),/Choose/);
 for(const data of [new Uint8Array([73,68,51,3]),new Uint8Array([73,68,51,7,0,0,0,0,0,0]),new Uint8Array([73,68,51,3,0,0,128,0,0,0])])assert.throws(()=>inspectEnvelope(data));
 const oversized=header();oversized[6]=126;assert.throws(()=>inspectEnvelope(oversized),/truncated|exceeds/);
});
test('legacy and flagged ID3 are read-only; an APE trailer cannot leave stale edited values',()=>{
 assert.match(inspectEnvelope(header(2)).reason,/Read-only/);
 assert.match(inspectEnvelope(header(3,128)).reason,/Read-only/);
 assert.match(inspectEnvelope(new Uint8Array([...audio(),...new TextEncoder().encode('APETAGEX')])).reason,/Read-only/);
 const tail=new Uint8Array(128);tail.set([84,65,71]);assert.equal(inspectEnvelope(new Uint8Array([...audio(),...tail])).hasV1,true);
});
test('tag fields are bounded and cannot smuggle arbitrary objects or control codes',()=>{
 assert.deepEqual(validateChanges({album:'Mañana',songwriter:'Writer',lyrics:'Line 1\nLine 2'}),{album:'Mañana',songwriter:'Writer',lyrics:'Line 1\nLine 2'});
 for(const input of [{__proto__:null,privateKey:'not-a-tag'},{album:{}},{album:'bad\0value'},{title:'line\nbreak'},{lyrics:'x'.repeat(64001)},{bpm:'Infinity'},{track:'one'},{isrc:'INVALID'}])assert.throws(()=>validateChanges(input));
 assert.equal(updatedFilename('../Mañana.MP3'),'Mañana-tagged.mp3');
});
test('tag worker completes once, cancels and times out without leaking parser errors',async()=>{
 for(const mode of ['complete','cancel','error','timeout']){
  let worker,terminated=0;
  const job=startTagTask({action:'read'},{timeoutMs:10,createWorker:()=>worker={postMessage(){},terminate(){terminated++;}}});
  if(mode==='complete')worker.onmessage({data:{ok:true,result:{fields:{album:'Album'}}}});
  if(mode==='cancel')job.cancel();
  if(mode==='error')worker.onerror({message:'PRIVATE-DATA',preventDefault(){}});
  const result=await job.promise;
  assert.equal(terminated,1);worker.onmessage({data:{ok:true}});job.cancel();assert.equal(terminated,1);
  if(mode==='cancel')assert.equal(result,null);else if(mode==='complete')assert.equal(result.result.fields.album,'Album');else {assert.equal(result.ok,false);assert.doesNotMatch(result.error,/PRIVATE-DATA/);}
 }
});
test('WOAS preserves literal URL text and rejects values the standard frame cannot encode',()=>{
 for(const value of ['', 'https://source.example/release?one=1&two=2#credits','ipfs://bafyexample/path','https://source.example/caf\u00e9','https://source.example/%E6%96%B0'])assert.equal(validateChanges({audioSourceUrl:value}).audioSourceUrl,value);
 for(const value of ['https://source.example/新','https://source.example/🎵'])assert.throws(()=>validateChanges({audioSourceUrl:value}),/percent-encoded/);
 for(const value of ['https://source.example/\0','https://source.example/\n','https://source.example/\t','x'.repeat(1025)])assert.throws(()=>validateChanges({audioSourceUrl:value}));
});
