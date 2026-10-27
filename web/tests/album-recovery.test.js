import test from 'node:test';
import assert from 'node:assert/strict';
import {audioAlbum,extractUploadMetadata,resolveUploadFields,initialUploadForm,uploadFormReducer} from '../src/upload-metadata.js';
import {startMetadataRead} from '../src/read-upload-metadata.js';
const file=()=>new File(['test'],'tagged.mp3',{type:'audio/mpeg'});
test('album aliases are conservative and ignore album artists/sort titles',()=>{
 assert.equal(audioAlbum({common:{album:['',' Collection ']}}),'Collection');
 for(const [type,id] of [['ID3v2.2','TAL'],['ID3v2.3','TALB'],['ID3v2.4','TALB'],['ID3v1','album'],['APEv2','Album'],['ID3v2.4','TXXX:ALBUM TITLE'],['ID3v2.4','TXXX:AlbumName']])assert.equal(audioAlbum({native:{[type]:[{id,value:'Album \u0000'}]}}),'Album');
 assert.equal(audioAlbum({common:{albumartist:'Not a title',albumsort:'Sort'},native:{'ID3v2.4':[{id:'TPE2',value:'Band'},{id:'TSOA',value:'Sort'},{id:'TIT1',value:'Group'},{id:'TXXX:ALBUMARTIST',value:'Band'}]}}),'');
 assert.equal(audioAlbum({common:{album:'Preferred'},native:{'ID3v2.4':[{id:'TALB',value:'Other'}]}}),'Preferred');
});
test('keep observed descriptive tags after an unrelated parser failure, without raw tags or inferred rights',async()=>{
 const progress=[];
 const result=await extractUploadMetadata(file(),{onProgress:value=>progress.push(value),parseAudio:async(_,options)=>{
  assert.equal(options.skipPostHeaders,false);assert.equal(options.skipCovers,true);
  options.observer({metadata:{common:{title:'Read title',album:'Read album',artist:'Performer'},native:{'ID3v2.4':[{id:'TXXX:OWNER_KEY',value:'private-do-not-propagate'}]}}});
  throw Error('Bad later frame with private-do-not-propagate');
 }});
 assert.equal(result.fields.release,'Read album');assert.match(result.notice,/Extracted tags were kept/);
 assert.ok(progress.some(x=>x.fields.release==='Read album'));
 assert.doesNotMatch(JSON.stringify({result,progress}),/private-do-not-propagate|OWNER_KEY/);
 assert.equal(result.fields.songwriters,undefined);
});
test('worker timeout/crash retains decoded album; cancellation discards it and terminates once',async()=>{
 for(const mode of ['timeout','error','cancel']){
  let worker,terminated=0;const partial={fields:{title:'Title',release:'Preserved album'},fieldSources:{title:'embedded audio tags',release:'embedded audio tags'},technical:{},parser:'embedded audio tags'};
  const task=startMetadataRead(file(),{timeoutMs:20,createWorker:()=>worker={postMessage(){queueMicrotask(()=>worker.onmessage({data:{type:'metadata-progress',result:partial}}));},terminate(){terminated++;}}});
  await new Promise(resolve=>setImmediate(resolve));
  if(mode==='cancel')task.cancel();else if(mode==='error')worker.onerror({preventDefault(){}});
  const result=await task.promise;
  if(mode==='cancel')assert.equal(result,null);else {assert.equal(result.fields.release,'Preserved album');assert.match(result.notice,/Extracted tags were kept/);}
  assert.equal(terminated,1);
 }
});
test('recovered album replaces a saved default but not a current-session edit',()=>{
 let state=initialUploadForm({release:'Saved album'});
 state=uploadFormReducer(state,{type:'start',role:'master',id:2,result:{fields:{release:'Tagged album'},fieldSources:{release:'embedded audio tags'}}});
 assert.equal(resolveUploadFields(state.manual,state.touched,state.uploads).values.release,'Tagged album');
 state=uploadFormReducer(state,{type:'edit',field:'release',value:'My edited album'});
 assert.equal(resolveUploadFields(state.manual,state.touched,state.uploads).values.release,'My edited album');
 const suggestion=resolveUploadFields({},[],state.uploads).values.release;
 state=uploadFormReducer(state,{type:'edit',field:'release',value:suggestion});
 assert.equal(resolveUploadFields(state.manual,state.touched,state.uploads).values.release,'Tagged album');
 state=uploadFormReducer(state,{type:'edit',field:'release',value:''});
 assert.equal(resolveUploadFields(state.manual,state.touched,state.uploads).values.release,'');
});
