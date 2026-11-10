import test from 'node:test';
import assert from 'node:assert/strict';
import {approvalProgress,draftStatus,hasDraftWork,applyReferenceUpdates,draftFileRevision,listMintDrafts,saveMintDraft,loadMintDraft,removeMintDraft} from '../src/mint-drafts.js';
import {newLinkRequest,linkRequestDigest} from '../src/brick-authorization.js';
const wallet='0x'+'a'.repeat(40),controller='0x'+'b'.repeat(40),hash='1'.repeat(64),now=1794200000000;
const request=newLinkRequest({chainId:1337,requester:wallet,sourceCommitment:'0x'+hash,targetBrick:controller,targetIpId:'0x'+'2'.repeat(64),factory:controller,relation:'cover-art',scope:'Cover for this album only',deadline:Math.floor(now/1000)+60});
const state={wallet,chainId:1337,assets:{master:{hash}},form:{meta:{title:'Midnight EP'}},linkedBricks:[{id:'cover',title:'Cover',request,sent:true}]};
const response={format:'response-for-unit-test',signature:'0x1234',controller};
test('waiting, ready, incomplete, declined, expired and changed-source drafts are distinct',()=>{
 assert.deepEqual(approvalProgress(state,now),{waiting:1,attention:0,approved:0,total:1});
 assert.equal(draftStatus(state,now).label,'Waiting for approval');
 const approved={...state,linkedBricks:[{...state.linkedBricks[0],response}]};
 assert.equal(draftStatus(approved,now).label,'Ready to resume');
 for(const modified of [{...approved,assets:{master:{hash:'3'.repeat(64)}}},{...approved,wallet:controller},{...approved,chainId:11155111},{...state,linkedBricks:[{id:'unprepared'}]},{...approved,linkedBricks:[{...approved.linkedBricks[0],requestStatus:'declined'}]}])assert.equal(draftStatus(modified,now).label,'Needs attention');
 assert.equal(draftStatus(approved,now+61000).label,'Needs attention');
 assert.equal(draftStatus({...state,linkedBricks:[]},now).label,'In progress');
});
test('an attempted mint cannot become a fresh resumable mint after reload',()=>{
 assert.equal(draftStatus({...state,submissionPending:true},now).label,'Check mint transaction');
 assert.equal(draftStatus({...state,mint:{status:'submission-unknown',simulated:false}},now).kind,'attention');
 assert.equal(draftStatus({...state,mint:{status:'confirmed',simulated:false}},now).kind,'complete');
 assert.equal(draftStatus({...state,mint:{status:'DEMO_ONLY_NOT_MINTED',simulated:true}},now).kind,'complete');
});
test('updates bind the exact signed request, wallet and chain; changed responses do not imply verified mint permission',()=>{
 const record={id:linkRequestDigest(request),request,status:'approved',response,controller};
 const updated=applyReferenceUpdates(state,[record]);assert.equal(updated.linkedBricks[0].response,response);assert.equal(updated.linkedBricks[0].requestStatus,'approved');
 assert.equal(applyReferenceUpdates(updated,[record]),updated,'Unchanged polls do not write again');
 for(const other of [{...record,id:'different request'},{...record,request:{...request,requester:controller}},{...record,request:{...request,chainId:1}}])assert.equal(applyReferenceUpdates(state,[other]),state);
 const declined=applyReferenceUpdates(updated,[{...record,status:'declined',response:null}]);assert.equal(declined.linkedBricks[0].response,null);assert.equal(draftStatus(declined,now).label,'Needs attention');
});
test('empty starts stay empty; metadata saves do not rewrite unchanged source bytes',()=>{
 assert.equal(hasDraftWork({form:{meta:{title:'   '}}}),false);assert.equal(hasDraftWork(state),true);
 assert.equal(hasDraftWork({assets:{master:{name:'track.wav'}}}),true);
 assert.equal(draftFileRevision(state),draftFileRevision({...state,form:{meta:{title:'New title'}}}));
 assert.notEqual(draftFileRevision(state),draftFileRevision({...state,assets:{master:{hash,encryption:{sha256:'different cipher'}}}}));
});
test('storage failure is surfaced instead of claiming a draft was saved',async()=>{
 const options={indexedDB:null},id=wallet+':test';
 await assert.rejects(listMintDrafts(wallet,options),/could not save/);
 await assert.rejects(saveMintDraft({wallet,id,state,files:{}},options),/could not save/);
 await assert.rejects(loadMintDraft(wallet,id,options),/could not save/);
 await assert.rejects(removeMintDraft(wallet,id,options),/could not save/);
 await assert.rejects(saveMintDraft({wallet:controller,id,state,files:{}},options),/wallet mismatch/);
 await assert.rejects(loadMintDraft('invalid',id,options),/Connect a wallet/);
});
