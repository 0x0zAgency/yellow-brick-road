import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLicensingEmail,licensingMailto,packetLicensingEmails} from '../src/licensing-contact.js';
import {makeRegistrationPacket,validateMintInput} from '../src/mint-model.js';
import {defaultMintForm,saveMintForm,loadMintForm} from '../src/mint-persistence.js';
import {defaultCreatorDefaults,saveCreatorDefaults,loadCreatorDefaults,applyCreatorDefaults} from '../src/creator-defaults.js';
import {requireLicensingContactFactory} from '../src/chain-mint.js';
const input={metadata:{title:'Contact test',artist:'Creator',songwriters:'Creator'},assets:{master:{name:'test.wav',hash:'a'.repeat(64),size:1},artwork:{name:'art.png',hash:'b'.repeat(64),size:1}},identity:{mode:'assisted'},composition:true,royalties:{creatorBps:10000},training:'separate-license',licensing:{email:' Licenses+Music@EXAMPLE.COM '}};
test('licensing address validation and mailto escaping prevent message-header injection',()=>{
 assert.equal(normalizeLicensingEmail(input.licensing.email),'Licenses+Music@example.com');assert.equal(normalizeLicensingEmail(), '');
 for(const email of ['a@example.com\r\nBcc:b@example.com','a@example.com\n','a@example.com?subject=x','Name <a@example.com>','a@@example.com','a@localhost','a@-example.com','a..b@example.com','x'.repeat(65)+'@example.com',null])assert.throws(()=>normalizeLicensingEmail(email));
 assert.equal(licensingMailto('a?b&c+sync@example.com'),'mailto:a%3Fb%26c%2Bsync@example.com');
});
test('all new local Bricks carry the reviewed contact; linked sources and permissions remain independent',()=>{
 const packet=makeRegistrationPacket(input);assert.equal(packet.bricks.length,3);
 assert.deepEqual(packetLicensingEmails(packet),Array(3).fill('Licenses+Music@example.com'));
 assert.ok(packet.bricks.every(b=>b.metadata.rights.aiTraining.mode==='separate-license'));
 assert.ok(validateMintInput({...input,licensing:{email:'bad'}}).some(e=>e.includes('email')));
 assert.throws(()=>makeRegistrationPacket({...input,licensing:{email:'bad'}}),/email/);
 assert.ok(makeRegistrationPacket({...input,licensing:{}}).bricks.every(b=>!b.metadata.rights.licensingContact));
});
test('explicit saved defaults and per-work persistence keep a bounded public licensing contact',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 saveCreatorDefaults(storage,{...defaultCreatorDefaults(),enabled:true,licensingEmail:input.licensing.email});
 const defaults=loadCreatorDefaults(storage),form=applyCreatorDefaults(defaultMintForm(),defaults);assert.equal(form.licensingEmail,'Licenses+Music@example.com');
 saveMintForm(storage,form);assert.equal(loadMintForm(storage).licensingEmail,form.licensingEmail);
 const original={...form,licensingEmail:'work@example.com'};assert.equal(applyCreatorDefaults(original,{...defaults,enabled:false}),original);
 assert.throws(()=>saveCreatorDefaults(storage,{...defaults,licensingEmail:'invalid'}),/email/);
});
test('contact requests fail closed on old factories instead of silently dropping the address',async()=>{
 await assert.rejects(requireLicensingContactFactory({readContract:async()=>{throw Error('missing');}},'factory'),/cannot store a licensor email/);
 await requireLicensingContactFactory({readContract:async()=>1},'factory');
});
