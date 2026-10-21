'use strict';
/** Dependency-free local terminal dashboard. Logs never contain credentials. */
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
const {stripVTControlCharacters}=require('node:util');
const {StringDecoder}=require('node:string_decoder');
const crypto=require('node:crypto');
const {renderDashboard,URLS}=require('./dev-screen.cjs');
const {MnemonicEditor}=require('./dev-mnemonic-menu.cjs');
const LOG_LIMIT=1024*1024;
const clean=value=>stripVTControlCharacters(String(value??'')).replace(/[\t\r\n]+/g,' ').replace(/[\x00-\x1f\x7f]/g,'').replace(/[^\x20-\x7e]/g,'?');
const clip=(text,width)=>{text=clean(text);return text.length<=width?text:text.slice(0,Math.max(0,width-3))+'...';};
function playerCredentials(env=process.env){
 return {listener:env.YBR_LISTENER_PASSWORD||crypto.randomBytes(12).toString('base64url'),artist:env.YBR_ARTIST_PASSWORD||crypto.randomBytes(12).toString('base64url')};
}
function redact(text,secrets=[]){
 let result=stripVTControlCharacters(String(text));
 for(const secret of [...secrets].flatMap(value=>[value,...stripVTControlCharacters(String(value)).split(/[\r\n]+/)]).filter(Boolean).sort((a,b)=>b.length-a.length))result=result.split(secret).join('[redacted]');
 result=result.replace(/(Mnemonic\s*:\s*).*/ig,'$1[redacted]').replace(/(\(\d+\)\s+)0x[a-f\d]{64}\b/ig,'$1[private key redacted]').replace(/((?:listener|artist)\s*\/\s*)\S+/ig,'$1[redacted]');
 return clean(result);
}
class DevDashboard{
 constructor({root,output=process.stdout,input=process.stdin,env=process.env,args=process.argv.slice(2),onQuit=()=>{},onRestartPlayer=async()=>{},mnemonicControl=null}){
  this.output=output;this.input=input;this.env=env;this.onQuit=onQuit;this.onRestartPlayer=onRestartPlayer;this.mnemonicControl=mnemonicControl;
  this.interactive=!!(output.isTTY&&input.isTTY&&env.TERM!=='dumb'&&!env.CI&&env.YBR_DEV_PLAIN!=='1'&&!args.includes('--plain'));
  this.showSecrets=this.interactive&&env.YBR_DEV_HIDE_SECRETS!=='1';
  this.color=this.interactive&&env.NO_COLOR===undefined;this.motion=env.YBR_DEV_REDUCED_MOTION!=='1';
  this.view='home';this.offset=0;this.secrets=new Set();this.closed=false;this.paused=false;this.lastFrame=[];
  this.state={startedAt:Date.now(),phase:'STARTING',nodeVersion:process.version,services:{},ganache:{},access:{},logs:[]};
  this.logFile=path.join(root,'.road-local','dev-stack.log');
  const dir=path.dirname(this.logFile);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const st=fs.lstatSync(dir);
  if(st.isSymbolicLink()||!st.isDirectory()||process.getuid&&st.uid!==process.getuid())throw Error('Unsafe .road-local directory.');
  fs.chmodSync(dir,0o700);
  // Do not follow symlinks into arbitrary files when opening the local log.
  for(const file of [this.logFile,this.logFile+'.1']){
   try{if(!fs.lstatSync(file).isFile())throw Error('Unsafe dev log file.');}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  this.rotate();fs.closeSync(fs.openSync(this.logFile,fs.constants.O_CREAT|fs.constants.O_APPEND|fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600));fs.chmodSync(this.logFile,0o600);
  this.logBytes=fs.statSync(this.logFile).size;
  this.keyHandler=(_text,key={})=>{
   if(this.mnemonicEditor){this.mnemonicEditor.handle(_text,key);return;}
   if(key.name==='m'&&this.interactive){
    try{
     if(!this.mnemonicControl)throw Error('Mnemonic control is unavailable in this session.');
     this.mnemonicControl.check();
     this.state.restartConfirm=false;
     this.mnemonicEditor=new MnemonicEditor({...this.mnemonicControl,current:this.mnemonicControl.current(),
      onSecret:value=>this.addSecrets(value),
      onChange:menu=>{this.state.mnemonicMenu=menu;if(!menu)this.mnemonicEditor=null;this.draw(true);}});
     this.mnemonicEditor.publish();
    }catch(error){this.state.error=redact(error.message,this.secrets);this.log('launcher',error.message);this.draw(true);}
    return;
   }
   if(key.name==='q'||key.ctrl&&key.name==='c'){this.onQuit();return;}
   if(key.name==='s')this.showSecrets=!this.showSecrets;
   if(key.name==='a')this.motion=!this.motion;
   if(key.name==='p')this.paused=!this.paused;
   if(key.name==='d'){this.view=this.view==='details'?'home':'details';this.offset=0;}
   if(key.name==='l'){this.view=this.view==='logs'?'home':'logs';this.offset=0;}
   if(key.name==='r'&&!this.restarting){
    if(!this.state.restartConfirm)this.state.restartConfirm=true;
    else{
     this.state.restartConfirm=false;this.restarting=true;
     Promise.resolve().then(()=>this.onRestartPlayer()).catch(e=>{this.state.error=redact(e.message,this.secrets);this.log('launcher',e.message);})
      .finally(()=>{this.restarting=false;this.draw(true);});
    }
   }else if(key.name!=='r')this.state.restartConfirm=false;
   if(key.name==='escape'){this.view='home';this.offset=0;}
   if(key.name==='up')this.offset=this.view==='logs'?Math.min(this.state.logs.length,this.offset+1):Math.max(0,this.offset-1);
   if(key.name==='down')this.offset=this.view==='logs'?Math.max(0,this.offset-1):this.offset+1;
   this.draw(true);
  };
  this.resizeHandler=()=>{this.lastFrame=[];this.draw(true);};
 }
 rotate(){
  if(fs.existsSync(this.logFile)&&fs.statSync(this.logFile).size>=LOG_LIMIT){
   fs.rmSync(this.logFile+'.1',{force:true});fs.renameSync(this.logFile,this.logFile+'.1');fs.chmodSync(this.logFile+'.1',0o600);this.logBytes=0;
  }
 }
 start(){
  if(this.interactive){
   this.wasRaw=!!this.input.isRaw;this.wasFlowing=this.input.readableFlowing===true;
   readline.emitKeypressEvents(this.input);this.input.setRawMode(true);this.input.resume();
   this.input.on('keypress',this.keyHandler);this.output.on('resize',this.resizeHandler);
   this.output.write('\x1b[?1049h\x1b[?25l\x1b[?2004h\x1b[2J');
   this.timer=setInterval(()=>this.draw(),180);this.timer.unref();this.draw();
  }else this.output.write('[YBR] Local dev dashboard: plain output; credentials are not printed to logs.\n');
 }
 draw(force=false){
  if(!this.interactive||this.closed||this.paused&&!force)return;
  this.state.now=Date.now();
  const lines=renderDashboard(this.state,{columns:this.output.columns||100,rows:this.output.rows||32,color:this.color,showSecrets:this.showSecrets,view:this.view,offset:this.offset,motion:this.motion});
  if(this.paused&&!this.state.mnemonicMenu)lines[1]=clip('  DISPLAY PAUSED / [p] resume live updates',Math.max(5,(this.output.columns||100)-1));
  // Repaint only changed rows; passwords and wallet text do not flicker with FX.
  let output='';
  for(let i=0;i<Math.max(lines.length,this.lastFrame.length);i++){
   if(lines[i]!==this.lastFrame[i])output+='\x1b['+(i+1)+';1H\x1b[2K'+(lines[i]||'');
  }
  if(output)this.output.write(output);
  this.lastFrame=lines;
 }
 update(patch){Object.assign(this.state,patch);this.draw();}
 service(name,status){this.state.services[name]=status;this.draw();}
 addSecrets(...values){for(const value of values)if(value)this.secrets.add(value);}
 log(label,text){
  if(this.closed)return;
  const safe=redact(text,this.secrets).trim();if(!safe)return;
  const line=new Date().toISOString().slice(11,19)+' '+clean(label)+' | '+safe;
  if(!/^(eth_|net_|web3_)/.test(safe)){this.state.logs.push(line);if(this.state.logs.length>200)this.state.logs.shift();}
  try{if(this.logBytes>=LOG_LIMIT)this.rotate();fs.appendFileSync(this.logFile,line+'\n',{mode:0o600});this.logBytes+=Buffer.byteLength(line)+1;}
  catch{this.state.error='Cannot write local log file; terminal output remains available.';}
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
  this.state.phase='READY';this.log('launcher','INTEGRATED ROAD READY');
  if(!this.interactive)this.output.write(renderDashboard(this.state,{columns:100,rows:40,showSecrets:false,motion:false}).join('\n')+'\n');
  this.draw();
 }
 close(reason='Stopped'){
  if(this.closed)return;this.closed=true;clearInterval(this.timer);
  if(this.mnemonicEditor){this.mnemonicEditor.value='';this.mnemonicEditor.candidate=null;this.mnemonicEditor=null;}this.state.mnemonicMenu=null;
  if(this.interactive){
   this.input.off('keypress',this.keyHandler);this.output.off('resize',this.resizeHandler);
   this.input.setRawMode(this.wasRaw);if(!this.wasFlowing)this.input.pause();
   this.output.write('\x1b[?2004l\x1b[?25h\x1b[?1049l');
  }
  this.output.write('[YBR] '+redact(reason,this.secrets)+'\n[YBR] Redacted logs: .road-local/dev-stack.log\n');
 }
}
module.exports={DevDashboard,renderDashboard,playerCredentials,redact,clean,URLS};
