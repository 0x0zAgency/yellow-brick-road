'use strict';
/** Dependency-free, local-only terminal dashboard. Never persists credentials. */
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
const {stripVTControlCharacters}=require('node:util');
const {StringDecoder}=require('node:string_decoder');
const crypto=require('node:crypto');

const URLS={web:'http://127.0.0.1:5173',player:'http://127.0.0.1:4173',
 ipfs:'http://127.0.0.1:8791',ganache:'http://127.0.0.1:8545'};
const LOG_LIMIT=1024*1024;
// Data cannot inject terminal commands or misleading bidi/zero-width text.
const clean=value=>stripVTControlCharacters(String(value??'')).replace(/[\t\r\n]+/g,' ').replace(/[\x00-\x1f\x7f]/g,'').replace(/[^\x20-\x7e]/g,'?');
const clip=(text,width)=>{text=clean(text);return text.length<=width?text:text.slice(0,Math.max(0,width-3))+'...';};
function wrap(text,width){
 text=clean(text);const lines=[];
 while(text.length>width){
  const space=text.lastIndexOf(' ',width);
  const end=space>width/2?space:width;
  lines.push(text.slice(0,end));text=text.slice(end).trimStart();
 }
 return [...lines,text];
}
function playerCredentials(env=process.env){
 return {listener:env.YBR_LISTENER_PASSWORD||crypto.randomBytes(12).toString('base64url'),
  artist:env.YBR_ARTIST_PASSWORD||crypto.randomBytes(12).toString('base64url')};
}
function secretText(value,visible,fallback='not available yet'){
 if(!value)return fallback;
 if(!visible)return '[hidden]';
 if(!/^[\x20-\x7e]+$/.test(value))return '[non-printable value; see your local configuration]';
 return value;
}
function redact(text,secrets=[]){
 let result=stripVTControlCharacters(String(text));
 for(const secret of [...secrets].flatMap(value=>[value,...stripVTControlCharacters(String(value)).split(/[\r\n]+/)]).filter(Boolean).sort((a,b)=>b.length-a.length)){
  result=result.split(secret).join('[redacted]');
 }
 result=result.replace(/(Mnemonic\s*:\s*).*/ig,'$1[redacted]')
  .replace(/(\(\d+\)\s+)0x[a-f\d]{64}\b/ig,'$1[private key redacted]')
  .replace(/((?:listener|artist)\s*\/\s*)\S+/ig,'$1[redacted]');
 return clean(result);
}
function renderDashboard(state,{columns=100,rows=32,color=false,showSecrets=false,view='home',offset=0}={}){
 const width=Math.max(5,Math.min(120,columns-1));
 const height=Math.max(4,rows-1);
 const paint=(code,text)=>color?'\x1b['+code+'m'+text+'\x1b[0m':text;
 const gold=text=>paint('38;5;220',text);
 const muted=text=>paint('90',text);
 function box(title,content,w=width){
  const inner=w-4;
  const top='╭─ '+clip(title,w-6)+' ';
  return [gold(top+'─'.repeat(Math.max(0,w-top.length-1))+'╮'),
   ...content.map(line=>gold('│ ')+clip(line,inner).padEnd(inner).replace(/\b(UP|DOWN|WAIT|START)\b/,value=>paint(value==='UP'?'92':value==='DOWN'?'91':'33',value))+gold(' │')),
   gold('╰'+'─'.repeat(w-2)+'╯')];
 }
 const status=key=>(state.services[key]||'WAIT').padEnd(5);
 const g=state.ganache||{},a=state.access||{};
 const uptime=Math.max(0,Math.floor(((state.now||Date.now())-state.startedAt)/1000));
 const clock=Math.floor(uptime/60)+':'+String(uptime%60).padStart(2,'0');
 const head=[gold('  ▰ ▰  ')+paint('1',clip('YELLOW BRICK ROAD',width-8)),
  muted(clip('  LOCAL DEV  /  '+state.phase+'  /  '+clock,width))];
 const warning=muted(clip('LOCAL TEST KEYS ONLY. Never send real funds. [s] '+(showSecrets?'hides':'shows')+' credentials.',width));
 const controls=gold(clip('[d] details  [l] logs  [s] secrets  [p] pause  [q] stop  | arrows',width));
 if(width<60||height<18){
  const lines=[gold(clip('YELLOW BRICK ROAD',width)),muted(clip(state.phase,width)),muted(clip('Enlarge to 80 x 24 for the dashboard.',width)),
   ...Object.entries(URLS).map(([name,url])=>clip(name+' '+status(name)+' '+url,width)),
   clip(state.error||'Logs: .road-local/dev-stack.log',width),controls];
  return lines.slice(0,height);
 }
 const unavailable=g.source==='reused'?'reused node; see original terminal':'waiting for owned Ganache';
 const mnemonic=secretText(g.mnemonic,showSecrets,unavailable);
 const reused=a.source==='reused';
 const login=(name)=>reused?'reused player; see original terminal':secretText(a[name],showSecrets);
 const services=[
  'Explorer  '+status('web')+' '+URLS.web,
  'Player    '+status('player')+' '+URLS.player,
  'IPFS      '+status('ipfs')+' '+URLS.ipfs
 ];
 const chain=[
  status('ganache')+' RPC '+URLS.ganache+'  | Chain 1337',
  'Account 0  '+(g.account||'waiting for RPC'),
  'Balance    '+(g.balance||'--')+' ETH  | Block '+(g.block??'--'),
  'Factory    '+(state.factory||'waiting for deployment')
 ];
 const access=[
  'listener / '+login('listener')+'    artist / '+login('artist'),
  ...wrap('Mnemonic: '+mnemonic,width-4)
 ];
 if(view==='details'){
  const detail=[
   ...box('LOCAL ACCESS / '+(showSecrets?'VISIBLE':'HIDDEN'),[
    ...wrap('listener / '+login('listener'),width-4),
    ...wrap('artist   / '+login('artist'),width-4),
    ...wrap('Mnemonic: '+mnemonic,width-4),
    ...wrap('Account 0 key: '+secretText(g.privateKey,showSecrets,unavailable),width-4),
    "HD path: m/44'/60'/0'/0/0  | ETH  | Chain ID: 1337",
    'Wallet: '+(g.source||'pending')+'  | Player: '+(a.source||'pending')]),
   ...box('REFERENCE',[
    ...wrap('Factory: '+(state.factory||'pending'),width-4),
    ...wrap('IPFS peer: '+(state.peerId||'pending'),width-4),
    'Kubo RPC: '+(state.kuboRpc||'http://127.0.0.1:5001'),
    'Ciphertext gateway: http://127.0.0.1:8080/ipfs/<CID>',
    'Public music: '+URLS.web+'/road/api/music',
    'Health: '+URLS.web+'/api/road-ipfs/health',
    'Logs: .road-local/dev-stack.log (rotated, redacted)',
    'Kubo stop: npm run ipfs:down  | NEVER down -v',
    'Ctrl+C / q stops owned processes, not persistent Kubo.'])
  ];
  const room=height-head.length-2;
  const start=Math.min(Math.max(0,offset),Math.max(0,detail.length-room));
  return [...head,...detail.slice(start,start+room),warning,controls];
 }
 if(view==='logs'){
  const room=Math.max(1,height-head.length-4);
  const logs=state.logs||[];
  const end=Math.max(room,logs.length-Math.max(0,offset));
  return [...head,...box('LIVE LOG / newest at bottom / '+(offset?'SCROLLED':'FOLLOWING'),
   logs.slice(Math.max(0,end-room),end).map(line=>clip(line,width-4))),warning,controls];
 }
 // Wide terminals get a two-column service/network layout. At 80x24 the
 // essential panels still fit, with the log tail reduced rather than scrolling.
 let panels;
 if(width>=112){
  const left=box('SERVICES',services,47);
  const right=box('GANACHE / '+(g.source||'starting'),chain,width-48);
  while(left.length<right.length)left.splice(left.length-1,0,gold('│ ')+' '.repeat(43)+gold(' │'));
  panels=left.map((line,i)=>line+' '+right[i]);
 }else panels=[...box('SERVICES',services),...box('GANACHE / '+(g.source||'starting'),chain)];
 const accessRoom=width-4;
 if(access[0].length>accessRoom){
  access.splice(0,1,'listener / '+clip(login('listener'),accessRoom-11),
   'artist   / '+clip(login('artist'),accessRoom-11));
 }
 let lines=[...head,...panels,...box('YBR ACCESS / '+(showSecrets?'VISIBLE':'HIDDEN')+' / [d] full details',access)];
 const remaining=height-lines.length-2;
 if(remaining>=3){
  const tail=(state.logs||[]).slice(-Math.min(remaining-2,4));
  lines.push(...box('ACTIVITY',tail.length?tail:['Preparing local services...']));
 }else if(remaining>=1){
  lines.push(muted(clip(state.error||(state.logs||[]).at(-1)||'Starting services...',width)));
 }
 return [...lines.slice(0,height-2),warning,controls];
}

class DevDashboard{
 constructor({root,output=process.stdout,input=process.stdin,env=process.env,args=process.argv.slice(2),onQuit=()=>{}}){
  this.output=output;this.input=input;this.env=env;this.onQuit=onQuit;
  this.interactive=!!(output.isTTY&&input.isTTY&&env.TERM!=='dumb'&&!env.CI&&env.YBR_DEV_PLAIN!=='1'&&!args.includes('--plain'));
  this.showSecrets=this.interactive&&env.YBR_DEV_HIDE_SECRETS!=='1';
  this.color=this.interactive&&env.NO_COLOR===undefined;
  this.view='home';this.offset=0;this.secrets=new Set();this.closed=false;this.paused=false;
  this.state={startedAt:Date.now(),phase:'STARTING',services:{},ganache:{},access:{},logs:[]};
  this.logFile=path.join(root,'.road-local','dev-stack.log');
  fs.mkdirSync(path.dirname(this.logFile),{recursive:true,mode:0o700});
  this.rotate();fs.closeSync(fs.openSync(this.logFile,'a',0o600));fs.chmodSync(this.logFile,0o600);
  this.logBytes=fs.statSync(this.logFile).size;
  this.keyHandler=(_text,key={})=>{
   if(key.name==='q'||key.ctrl&&key.name==='c'){this.onQuit();return;}
   if(key.name==='s')this.showSecrets=!this.showSecrets;
   if(key.name==='p')this.paused=!this.paused;
   if(key.name==='d'){this.view=this.view==='details'?'home':'details';this.offset=0;}
   if(key.name==='l'){this.view=this.view==='logs'?'home':'logs';this.offset=0;}
   if(key.name==='escape'){this.view='home';this.offset=0;}
   if(key.name==='up')this.offset=this.view==='logs'?Math.min(this.state.logs.length,this.offset+1):Math.max(0,this.offset-1);
   if(key.name==='down')this.offset=this.view==='logs'?Math.max(0,this.offset-1):this.offset+1;
   this.draw(true);
  };
  this.resizeHandler=()=>this.draw();
 }
 rotate(){
  if(fs.existsSync(this.logFile)&&fs.statSync(this.logFile).size>=LOG_LIMIT){
   fs.rmSync(this.logFile+'.1',{force:true});fs.renameSync(this.logFile,this.logFile+'.1');
   fs.chmodSync(this.logFile+'.1',0o600);this.logBytes=0;
  }
 }
 start(){
  if(this.interactive){
   this.wasRaw=!!this.input.isRaw;this.wasFlowing=this.input.readableFlowing===true;
   readline.emitKeypressEvents(this.input);this.input.setRawMode(true);this.input.resume();
   this.input.on('keypress',this.keyHandler);this.output.on('resize',this.resizeHandler);
   this.output.write('\x1b[?1049h\x1b[?25l');
   this.timer=setInterval(()=>this.draw(),500);this.timer.unref();this.draw();
  }else this.output.write('[YBR] Local dev dashboard: plain output; credentials are not printed to logs.\n');
 }
 draw(force=false){
  if(!this.interactive||this.closed||this.paused&&!force)return;
  this.state.now=Date.now();
  const lines=renderDashboard(this.state,{columns:this.output.columns||100,rows:this.output.rows||32,
   color:this.color,showSecrets:this.showSecrets,view:this.view,offset:this.offset});
  if(this.paused)lines[1]=clip('  DISPLAY PAUSED / [p] resume live updates',Math.max(5,(this.output.columns||100)-1));
  this.output.write('\x1b[H'+lines.map(line=>'\x1b[2K'+line).join('\r\n')+'\x1b[J');
 }
 update(patch){Object.assign(this.state,patch);this.draw();}
 service(name,status){this.state.services[name]=status;this.draw();}
 addSecrets(...values){for(const value of values)if(value)this.secrets.add(value);}
 log(label,text){
  if(this.closed)return;
  const safe=redact(text,this.secrets).trim();if(!safe)return;
  const line=new Date().toISOString().slice(11,19)+' '+clean(label)+' | '+safe;
  // Routine RPC traffic stays in the file, not in the compact activity panel.
  if(!/^(eth_|net_|web3_)/.test(safe)){
   this.state.logs.push(line);if(this.state.logs.length>200)this.state.logs.shift();
  }
  try{
   if(this.logBytes>=LOG_LIMIT)this.rotate();
   fs.appendFileSync(this.logFile,line+'\n',{mode:0o600});this.logBytes+=Buffer.byteLength(line)+1;
  }catch{this.state.error='Cannot write local log file; terminal output remains available.';}
  if(!this.interactive)this.output.write(line+'\n');
 }
 attach(label,child){
  for(const stream of [child.stdout,child.stderr]){
   if(!stream)continue;
   const decoder=new StringDecoder('utf8');let pending='',dropping=false;
   const consume=text=>{
    for(const fragment of text.split(/(?<=[\r\n])/)){
     if(!fragment)continue;
     const complete=/[\r\n]$/.test(fragment);
     if(!dropping)pending+=fragment;
     if(pending.length>8192){pending='';dropping=true;}
     if(complete){
      if(dropping)this.log(label,'[oversized output line omitted]');
      else{
       const raw=stripVTControlCharacters(pending).trim();
       if(label==='ganache'){
        const match=/^Mnemonic:\s+([a-z]+(?: [a-z]+){11,23})$/.exec(raw);
        if(match){this.candidateMnemonic=match[1];this.addSecrets(match[1]);}
       }
       this.log(label,pending);
      }
      pending='';dropping=false;
     }
    }
   };
   stream.on('data',chunk=>consume(decoder.write(chunk)));
   stream.on('end',()=>{consume(decoder.end());if(pending&&!dropping)this.log(label,pending);});
  }
 }
 ready(){
  this.state.phase='READY';
  this.log('launcher','INTEGRATED ROAD READY');
  if(!this.interactive){
   this.output.write(renderDashboard(this.state,{columns:100,rows:40,showSecrets:false}).join('\n')+'\n');
  }
  this.draw();
 }
 close(reason='Stopped'){
  if(this.closed)return;this.closed=true;clearInterval(this.timer);
  if(this.interactive){
   this.input.off('keypress',this.keyHandler);this.output.off('resize',this.resizeHandler);
   this.input.setRawMode(this.wasRaw);if(!this.wasFlowing)this.input.pause();
   this.output.write('\x1b[?25h\x1b[?1049l');
  }
  this.output.write('[YBR] '+redact(reason,this.secrets)+'\n[YBR] Redacted logs: .road-local/dev-stack.log\n');
 }
}
module.exports={DevDashboard,renderDashboard,playerCredentials,redact,clean,URLS};
