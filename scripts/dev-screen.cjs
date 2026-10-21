'use strict';
/** Pure terminal renderer. Motion is decoration, never invented telemetry. */
const {stripVTControlCharacters:strip}=require('node:util');
const URLS={web:'http://127.0.0.1:5173',player:'http://127.0.0.1:4173',ipfs:'http://127.0.0.1:8791',ganache:'http://127.0.0.1:8545'};
const clean=v=>strip(String(v??'')).replace(/[\t\r\n]+/g,' ').replace(/[^\x20-\x7e]/g,'?');
const clip=(v,w)=>{const s=clean(v);return s.length<=w?s:s.slice(0,Math.max(0,w-3))+'...';};
function wrap(v,w){
 let s=clean(v);const out=[];w=Math.max(1,w);
 while(s.length>w){const p=s.lastIndexOf(' ',w),n=p>w/2?p:w;out.push(s.slice(0,n));s=s.slice(n).trimStart();}
 return [...out,s];
}
function secret(v,visible,fallback='waiting for Player'){
 if(!v)return fallback;
 if(!visible)return '[hidden]';
 return /^[\x20-\x7e]+$/.test(v)?v:'[configured non-printable value]';
}
function renderDashboard(state,{columns=100,rows=32,color=false,showSecrets=false,view='home',offset=0,motion=true}={}){
 const w=Math.max(5,Math.min(144,columns-1)),h=Math.max(3,rows-1);
 const p=(n,s)=>color?'\x1b['+n+'m'+s+'\x1b[0m':s;
 const gold=s=>p('38;5;220',s),cyan=s=>p('38;5;51',s),pink=s=>p('38;5;201',s),dim=s=>p('38;5;244',s);
 const status=k=>(state.services?.[k]||'WAIT').padEnd(5);
 const phase=clean(state.phase||'BOOTING'),g=state.ganache||{},a=state.access||{};
 const elapsed=Math.max(0,(state.now??Date.now())-(state.startedAt??Date.now()));
 const tick=motion?Math.floor(elapsed/180):0;
 const seconds=Math.floor(elapsed/1000),uptime=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
 function box(title,content,width=w,tint=cyan){
  const inner=width-4,top='┌─ '+clip(title,width-6)+' ';
  return [tint(top+'─'.repeat(Math.max(0,width-top.length-1))+'┐'),...content.map(s=>{
   const text=clip(s,inner).padEnd(inner).replace(/\b(UP|DOWN|WAIT|START)\b/g,v=>p(v==='UP'?'92':v==='DOWN'?'91':'33',v));
   return tint('│ ')+text+tint(' │');
  }),tint('└'+'─'.repeat(width-2)+'┘')];
 }
 function bricks(){
  const count=Math.floor((w-2)/7),head=tick%count;
  let line=' ';
  for(let i=0;i<count;i++){
   const distance=(head-i+count)%count;
   line+=(distance===0?gold('[#####]'):distance===1?pink('[=====]'):distance===2?cyan('[-----]'):dim('[.....]'));
  }
  return line;
 }
 const buttons=gold(clip('[d] details [l] logs [s] secrets [p] pause [a] FX [r] player [q] stop',w));
 const warning=state.restartConfirm?p('91',clip('Restart this checkout\'s Player? [r] confirm / [Esc] cancel. Sessions reset.',w)):
  dim(clip('LOCAL TEST KEYS ONLY / Never send real funds / '+(showSecrets?'SECRETS VISIBLE':'SECRETS HIDDEN'),w));
 if(w<70||h<22){
  return [gold(clip('YBR // YELLOW BRICK ROAD',w)),cyan(clip(phase+' / Node '+(state.nodeVersion||process.version),w)),
   ...Object.entries(URLS).map(([key,url])=>clip(key+' '+status(key)+url,w)),
   dim(clip('Resize to 80x24 for access + wallet panels.',w)),buttons].slice(0,h);
 }
 const logo=[' __   __ ____   ____  ',' \\ \\ / /| __ ) |  _ \\ ','  \\ V / |  _ \\ | |_) |','   |_|  |____/ |_| \\_\\'];
 const labels=['YELLOW BRICK ROAD // DEV CONTROL',phase+' / Node '+(state.nodeVersion||process.version)+' / '+uptime,
  'LOCAL CHAIN 1337 / ENCRYPTED IPFS',motion?'[ LIVE ] // FOLLOW THE BRICKS':'[ STILL ] // MOTION OFF'];
 const head=logo.map((l,i)=>gold(l.padEnd(25))+(i===0?pink:p.bind(null,'38;5;51'))(clip(labels[i],w-25)));
 const unknown=g.source==='reused'?'reused node; see original terminal':'verifying local Ganache';
 const mnemonic=secret(g.mnemonic,showSecrets,unknown);
 const login=name=>secret(a[name],showSecrets,a.source==='reused'?'[r] restart Player here':'waiting for Player');
 const services=['Explorer '+status('web')+URLS.web,'Player   '+status('player')+URLS.player,'IPFS     '+status('ipfs')+URLS.ipfs];
 const chain=[status('ganache')+' RPC '+URLS.ganache+' | Chain 1337',
  'Account 0 '+(g.account||'waiting for RPC'),
  'Balance   '+(g.balance||'--')+' ETH | Block '+(g.block??'--'),
  'Factory   '+(state.factory||'waiting for deployment')];
 if(view==='details'){
  const detail=[...box('ACCESS // '+(a.verified?'LOGIN VERIFIED':a.source||'STARTING'),[
   ...wrap('listener / '+login('listener'),w-4),...wrap('artist   / '+login('artist'),w-4),
   ...wrap('Mnemonic: '+mnemonic,w-4),...wrap('Account 0 key: '+secret(g.privateKey,showSecrets,unknown),w-4),
   "HD path: m/44'/60'/0'/0/0 | ETH | Chain 1337",
   'Wallet: '+(g.source||'pending')+' | Player: '+(a.source||'pending'),
   ...wrap(a.notice||'Player passwords: private .road-local/player-access.json',w-4)],w,gold),
   ...box('CONNECTION REFERENCE',[
    ...wrap('Factory: '+(state.factory||'pending'),w-4),...wrap('IPFS peer: '+(state.peerId||'pending'),w-4),
    'Kubo RPC: '+(state.kuboRpc||'http://127.0.0.1:5001'),
    'Ciphertext: http://127.0.0.1:8080/ipfs/<CID>',
    'Public music: '+URLS.web+'/road/api/music','Health: '+URLS.web+'/api/road-ipfs/health',
    'Logs: .road-local/dev-stack.log (redacted)',
    'Start: npm run dev | Recovery: npm run dev -- --restart-player',
    'Kubo stop: npm run ipfs:down | NEVER down -v',
    'q stops owned processes only. Kubo and its pins remain.'])];
  const room=h-head.length-3,start=Math.min(Math.max(0,offset),Math.max(0,detail.length-room));
  return [...head,bricks(),...detail.slice(start,start+room),warning,buttons];
 }
 if(view==='logs'){
  const room=Math.max(1,h-head.length-5),logs=state.logs||[],end=Math.max(room,logs.length-Math.max(0,offset));
  return [...head,bricks(),...box('ACTIVITY BUS // '+(offset?'SCROLLED':'LIVE'),logs.slice(Math.max(0,end-room),end)),warning,buttons];
 }
 let panels;
 if(w>=112){
  const leftWidth=44,rightWidth=w-leftWidth-1;
  const left=box('SERVICES',services,leftWidth,cyan),right=box('GANACHE // '+(g.source||'BOOT'),chain,rightWidth,pink);
  while(left.length<right.length)left.splice(left.length-1,0,cyan('│ ')+' '.repeat(leftWidth-4)+cyan(' │'));
  panels=left.map((line,i)=>line+' '+right[i]);
 }else{
  // Compact layout keeps actual endpoints, addresses and credentials in 80x24.
  panels=box('SERVICES + GANACHE // '+(g.source||'BOOT'),[
   ...services,status('ganache')+' RPC '+URLS.ganache+' | Chain 1337 | Block '+(g.block??'--'),
   'A0 '+(g.account||'waiting for RPC')+' | '+(g.balance||'--')+' ETH',
   'Factory '+(state.factory||'waiting for deployment')],w,cyan);
 }
 let access=['listener / '+login('listener')+'    artist / '+login('artist')];
 if(access[0].length>w-4)access=['listener / '+clip(login('listener'),w-15),'artist   / '+clip(login('artist'),w-15)];
 access.push(...wrap('Mnemonic: '+mnemonic,w-4));
 const lines=[...head,bricks(),...panels,...box('YBR ACCESS // '+(a.verified?'VERIFIED':'LOCAL')+' // '+(showSecrets?'VISIBLE':'HIDDEN'),access,w,gold)];
 const room=h-lines.length-2;
 if(room>=3)lines.push(...box('ACTIVITY // [l] EXPAND',(state.logs||[]).slice(-Math.min(room-2,4)),w,pink));
 else if(room>0)lines.push(dim(clip(state.error||(state.logs||[]).at(-1)||'Bringing local services online...',w)));
 return [...lines.slice(0,h-2),warning,buttons];
}
module.exports={renderDashboard,URLS,wrap};
