'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {stripVTControlCharacters:strip}=require('node:util');
const {createHash}=require('node:crypto');
const {FRAMED_YBR,FRAMED_YBR_WIDTH,FRAMED_YBR_COMPACT}=require('./dev-title.cjs');
const {renderDashboard}=require('./dev-screen.cjs');
const state={startedAt:0,now:0,phase:'READY',services:{web:'UP',player:'UP',ipfs:'UP',ganache:'UP'},ganache:{account:'0x'+'1'.repeat(40),balance:'1000',block:0,mnemonic:'abandon '.repeat(11)+'about'},factory:'0x'+'2'.repeat(40),access:{verified:true,listener:'listener-test',artist:'artist-test'}};
const render=(s=state,options={})=>renderDashboard(s,{columns:150,rows:40,showSecrets:true,...options}).map(strip);
const required=['YELLOW BRICK ROAD','FOLLOW THE YELLOW BRICK ROAD','Chain 1337','listener-test','artist-test','about',state.factory,state.ganache.account];

test('supplied framed YBR and block/shade background retain all 27 original 72-column rows',()=>{
 assert.equal(FRAMED_YBR_WIDTH,72);assert.equal(FRAMED_YBR.length,27);
 assert.ok(Object.isFrozen(FRAMED_YBR));
 assert.ok(FRAMED_YBR.every(line=>line.length===72&&!/[\x00-\x1f\x7f-\x9f]/.test(line)));
 assert.equal(createHash('sha256').update(FRAMED_YBR.join('\n')).digest('hex'),'6baab4ce6b78d8aaeafa3f0dd9b9d2c9bbcb1f78434165187162d912871c89fc');
 assert.deepEqual(FRAMED_YBR_COMPACT,FRAMED_YBR.slice(8,19));
});

test('full artwork is left aligned and verified login box begins at its top right',()=>{
 const lines=render(state,{color:true}),start=lines.findIndex(line=>line.includes('YBR PLAYER LOGIN'));
 assert.equal(start,3);
 for(const [i,row] of FRAMED_YBR.entries())assert.equal(lines[start+i].slice(0,72),row);
 assert.equal(lines[start].indexOf('┌'),74);
 const right=lines.slice(start,start+FRAMED_YBR.length).map(line=>line.slice(74)).join('\n');
 for(const text of ['YBR PLAYER LOGIN','listener-test','artist-test','SERVICES','GANACHE',state.factory,state.ganache.account])assert.ok(right.includes(text),text);
 assert.ok(right.indexOf('YBR PLAYER LOGIN')<right.indexOf('SERVICES'));
 assert.ok(right.indexOf('SERVICES')<right.indexOf('GANACHE'));
 for(const text of [...required,'DEVELOPMENT CONTROL','CREATOR TOOLS / IP PROTOCOL'])assert.ok(lines.join('\n').includes(text),text);
});

test('short wide terminal uses the framed letters and keeps services below rather than clipping',()=>{
 const lines=render(state,{rows:30,color:true}),start=lines.findIndex(line=>line.includes('YBR PLAYER LOGIN'));
 for(const [i,row] of FRAMED_YBR_COMPACT.entries())assert.equal(lines[start+i].slice(0,72),row);
 assert.equal(lines[start].indexOf('┌'),74);
 assert.ok(lines.findIndex(line=>line.includes('SERVICES'))>start+10);
 for(const text of required)assert.ok(lines.join('\n').includes(text),text);
});

test('narrow or short reference layout keeps full credentials and addresses instead of squeezed artwork',()=>{
 for(const [columns,rows] of [[80,24],[100,30],[120,40],[134,40],[150,24]]){
  const lines=render(state,{columns,rows});
  assert.ok(lines.length<rows);assert.ok(lines.every(line=>line.length<columns));
  assert.ok(!lines.some(line=>line.startsWith(FRAMED_YBR[0])));
  for(const text of required)assert.ok(lines.join('\n').includes(text),columns+'x'+rows+': '+text);
 }
});

test('layout thresholds, views, color modes and both mnemonic lengths remain bounded',()=>{
 for(const columns of [40,60,70,80,100,113,134,135,144,145,150,180])for(const rows of [14,24,26,30,34,35,36,40]){
  for(const color of [true,false])for(const count of [12,24]){
   const s={...state,ganache:{...state.ganache,mnemonic:'abandon '.repeat(count-1)+'about'}};
   const lines=render(s,{columns,rows,color});
   assert.ok(lines.length<rows);assert.ok(lines.every(line=>line.length<columns),columns+'x'+rows);
   if(columns>=80&&rows>=24)for(const text of ['listener-test','artist-test','about',state.factory,state.ganache.account,'[q] quit'])
    assert.ok(lines.join('\n').includes(text),columns+'x'+rows+': '+text);
  }
 }
 for(const view of ['details','logs']){
  const lines=render(state,{view,columns:150,rows:40});
  assert.ok(lines.length<40);assert.ok(lines.every(line=>line.length<150));
  assert.ok(!lines.some(line=>line.startsWith(FRAMED_YBR[0])),'Diagnostics retain compact header');
 }
});

test('24-word mnemonics and long passwords wrap without truncation in the right access box',()=>{
 const words=Array.from({length:24},(_,i)=>'word'+String(i).padStart(2,'0')).join(' ');
 const s={...state,ganache:{...state.ganache,mnemonic:words},access:{...state.access,listener:'L'.repeat(100)}};
 const lines=render(s,{columns:135,rows:45}),start=lines.findIndex(line=>line.includes('YBR PLAYER LOGIN'));
 assert.equal(lines[start].indexOf('┌'),74);
 const end=lines.findIndex((line,i)=>i>start&&line.slice(74).startsWith('└'));
 const inside=lines.slice(start+1,end).map(line=>line.slice(76,-2).trim()).join(' ');
 for(const word of words.split(' '))assert.ok(inside.includes(word),word);
 assert.equal((inside.match(/L/g)||[]).length,100);
 assert.doesNotMatch(inside,/\.\.\./);
 for(const text of [s.factory,s.ganache.account,'[q] quit'])assert.ok(lines.join('\n').includes(text),text);
});

test('hidden and remote layouts do not reveal credentials, local keys or the Ganache endpoint',()=>{
 const remote={...state,activeNetwork:{network:'sepolia',label:'Sepolia',chainId:11155111,rpcLabel:'https://sepolia.infura.io / private endpoint'},music:{state:'SKIPPED'},ganache:{...state.ganache,privateKey:'0x'+'f'.repeat(64)}};
 for(const rows of [30,40]){
  const text=render(remote,{rows}).join('\n');
  assert.match(text,/ACTIVE SEPOLIA/);assert.match(text,/Chain 11155111/);
  assert.doesNotMatch(text,/Mnemonic|abandon|127\.0\.0\.1:8545/);
  assert.ok(!text.includes(remote.ganache.privateKey));
  assert.match(text,/no automatic remote mint/);
  assert.ok(!text.includes('[i]'));
  for(const s of [state,remote]){
   const hidden=render(s,{rows,showSecrets:false,color:true}).join('\n');
   for(const secret of ['listener-test','artist-test','abandon'])assert.ok(!hidden.includes(secret));
   assert.match(hidden,/HIDDEN/);
  }
 }
});

test('only trusted artwork bypasses ASCII data sanitization, including NO_COLOR rendering',()=>{
 const s={...state,phase:'READY\x1b[2J\x07',access:{...state.access,listener:'unsafe\x1b[2J'},ganache:{...state.ganache,source:'owned\x1b[31m',account:'account\u202ehidden'}};
 const lines=renderDashboard(s,{columns:150,rows:40,color:false,showSecrets:true});
 const text=lines.join('\n');
 assert.doesNotMatch(text,/[\x1b\x07\u202e]/);assert.match(text,/non-printable value/);
 assert.ok(text.includes('███░'));assert.ok(lines.every(line=>line.length<150));
});

test('decoration remains static apart from the existing animated rail and reduced motion is honored',()=>{
 const s={...state,startedAt:0,now:1000};
 const a=render(s,{color:true}),b=render({...s,now:1180},{color:true});
 const stable=lines=>lines.filter(line=>!/^ \[(?:[.#=-]{5})\]/.test(line));
 assert.notDeepEqual(a,b);assert.deepEqual(stable(a),stable(b));
 assert.deepEqual(render(s,{motion:false}),render({...s,now:1180},{motion:false}));
});

test('network approval and mnemonic overlays replace artwork and login panels completely',()=>{
 for(const rows of [30,40]){
  const network=render({...state,networkMenu:{network:'sepolia',current:'ganache',mode:'approval',lines:['Maximum spend: 0.01 Sepolia ETH'],characters:0}},{rows}).join('\n');
  assert.match(network,/DEPLOY SEPOLIA/);assert.match(network,/Maximum spend/);
  assert.doesNotMatch(network,/listener-test|artist-test|abandon|\[i\]/);
  assert.ok(!network.includes(FRAMED_YBR[0]));
 }
});
