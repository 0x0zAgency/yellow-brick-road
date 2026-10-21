'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepareGanacheStorage}=require('./dev-ganache-storage.cjs');
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-storage-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('fresh Ganache storage creates both private directories without another service',t=>{
 const root=temp(t),target=prepareGanacheStorage(root);
 assert.equal(target,path.join(root,'.road-local','ganache'));
 for(const dir of [path.dirname(target),target]){
  assert.ok(fs.statSync(dir).isDirectory());
  if(process.platform!=='win32')assert.equal(fs.statSync(dir).mode&0o777,0o700);
 }
});
test('repeated preparation preserves existing chain and credential files',t=>{
 const root=temp(t),target=prepareGanacheStorage(root);
 const chain=path.join(target,'CURRENT'),access=path.join(root,'.road-local','player-access.json');
 fs.writeFileSync(chain,'existing chain');fs.writeFileSync(access,'existing credentials');
 assert.equal(prepareGanacheStorage(root),target);
 assert.equal(fs.readFileSync(chain,'utf8'),'existing chain');assert.equal(fs.readFileSync(access,'utf8'),'existing credentials');
});
test('ordinary files at either storage path are refused, not replaced',t=>{
 for(const part of ['.road-local','ganache']){
  const root=temp(t);if(part==='ganache')fs.mkdirSync(path.join(root,'.road-local'));
  const target=path.join(root,'.road-local',...(part==='ganache'?['ganache']:[]));
  fs.writeFileSync(target,'do not replace');
  assert.throws(()=>prepareGanacheStorage(root),/regular directory/);
  assert.equal(fs.readFileSync(target,'utf8'),'do not replace');
 }
});
test('symlinked storage paths are refused before writing into their targets',{skip:process.platform==='win32'},t=>{
 for(const part of ['.road-local','ganache']){
  const root=temp(t),outside=temp(t);if(part==='ganache')fs.mkdirSync(path.join(root,'.road-local'));
  const target=path.join(root,'.road-local',...(part==='ganache'?['ganache']:[]));
  fs.symlinkSync(outside,target,'dir');
  assert.throws(()=>prepareGanacheStorage(root),/regular directory/);
  assert.deepEqual(fs.readdirSync(outside),[]);
 }
});
