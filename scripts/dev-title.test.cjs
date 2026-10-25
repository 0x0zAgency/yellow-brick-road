'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {stripVTControlCharacters:strip}=require('node:util');
const {blockTitle}=require('./dev-title.cjs');
const {renderDashboard}=require('./dev-screen.cjs');
const state={startedAt:0,now:0,phase:'READY',services:{web:'UP',player:'UP',ipfs:'UP',ganache:'UP'},ganache:{account:'0x'+'1'.repeat(40),balance:'1000',block:0,mnemonic:'abandon '.repeat(11)+'about'},factory:'0x'+'2'.repeat(40),access:{verified:true,listener:'listener-test',artist:'artist-test'}};
test('full title spells the project name with solid fixed glyphs and honest status',()=>{
 const lines=renderDashboard(state,{columns:150,rows:40,color:true,showSecrets:true}).map(strip),art=blockTitle();
 for(const row of art)assert.ok(lines.some(line=>line.trim()===row.trim()));
 const out=lines.join('\n');for(const text of ['YELLOW BRICK ROAD // DEVELOPMENT CONTROL','CREATOR TOOLS / IP PROTOCOL','FOLLOW THE YELLOW BRICK ROAD','Chain 1337','listener-test','artist-test','about',state.factory])assert.ok(out.includes(text),text);
});
test('larger masthead never hides credentials, footer or selected remote identity',()=>{
 for(const columns of [40,60,70,80,100,113,144,180])for(const rows of [14,24,30,40]){
  const lines=renderDashboard(state,{columns,rows,showSecrets:true});assert.ok(lines.length<rows);assert.ok(lines.every(l=>strip(l).length<columns));
  if(columns>=80&&rows>=24)for(const text of ['listener-test','artist-test','about',state.factory])assert.ok(lines.join('\n').includes(text),columns+'x'+rows+': '+text);
 }
 const remote={...state,activeNetwork:{network:'sepolia',label:'Sepolia',chainId:11155111,rpcLabel:'sepolia.infura.io'},music:{state:'SKIPPED'}};
 const text=renderDashboard(remote,{columns:150,rows:40,showSecrets:true}).join('\n');assert.match(text,/ACTIVE SEPOLIA/);assert.doesNotMatch(text,/Mnemonic|127\.0\.0\.1:8545/);
});
