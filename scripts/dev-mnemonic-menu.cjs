'use strict';
/** Secret input never enters render state, logs, shell history or command arguments. */
const {stripVTControlCharacters}=require('node:util');
class MnemonicEditor{
 constructor({current,generate,validate,onApply,onChange=()=>{},onSecret=()=>{}}){
  Object.assign(this,{current,generate,validate,onApply,onChange,onSecret});
  this.value='';this.confirm='';this.candidate=null;this.pasting=false;this.state={stage:'menu',current:current.id};
 }
 publish(){this.onChange({...this.state});}
 cancel(){if(this.state.stage==='applying')return;this.value='';this.confirm='';this.candidate=null;this.onChange(null);}
 review(candidate){
  this.candidate=candidate;if(candidate.mnemonic)this.onSecret(candidate.mnemonic);
  this.value='';this.confirm='';this.state={stage:'review',current:this.current.id,account:candidate.account,profile:candidate.id,same:candidate.id===this.current.id,confirmation:''};this.publish();
 }
 handle(text,key={}){
  if(key.sequence==='\x1b[200~'){this.pasting=true;return;}
  if(key.sequence==='\x1b[201~'){this.pasting=false;return;}
  if(this.state.stage==='applying')return;
  if(key.name==='escape'||key.ctrl&&key.name==='c'){this.cancel();return;}
  if(this.state.stage==='menu'){
   try{
    if(key.name==='g')this.review(this.generate());
    if(key.name==='i'){this.state={stage:'input',current:this.current.id,words:0,characters:0};this.publish();}
    if(key.name==='d')this.review({kind:'default',id:'default',account:'0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1'});
   }catch{this.state.error='Cannot prepare this wallet. No settings were changed.';this.publish();}
   return;
  }
  if(this.state.stage==='input'){
   if(!this.pasting&&(key.name==='return'||key.name==='enter')){
    try{this.review(this.validate(this.value));}catch{this.state.error='Invalid English BIP-39 words or checksum. Edit and try again.';this.publish();}return;
   }
   if(key.name==='backspace')this.value=this.value.slice(0,-1);
   else if(key.ctrl&&key.name==='u')this.value='';
   else if(!key.ctrl&&!key.meta&&typeof text==='string'&&/^[a-zA-Z\s]+$/.test(text)){
    if(this.value.length+text.length>512){this.state.error='Input is limited to 512 characters.';this.publish();return;}
    this.value+=text.replace(/\s/g,' ');
   }
   this.state.words=this.value.trim()?this.value.trim().split(/\s+/).length:0;
   this.state.characters=this.value.length;this.publish();return;
  }
  if(this.state.stage==='review'){
   // Pasted text cannot confirm a profile switch, even if it contains SWITCH.
   if(this.pasting)return;
   if(key.name==='backspace')this.confirm=this.confirm.slice(0,-1);
   else if(key.ctrl&&key.name==='u')this.confirm='';
   else if(key.name==='return'||key.name==='enter'){
    if(this.state.same){this.cancel();return;}
    if(this.confirm!=='SWITCH'){this.state.error='Type SWITCH, then press Enter to confirm.';this.publish();return;}
    const selected=this.candidate;this.state.stage='applying';this.state.error='';this.confirm='';this.publish();
    Promise.resolve().then(()=>this.onApply(selected,this.current.id)).then(()=>{this.candidate=null;this.onChange(null);})
     .catch(()=>{this.candidate=null;this.state={stage:'menu',current:this.current.id,error:'Switch failed. Check the launcher status. No seed is printed here.'};this.publish();});
    return;
   }else if(!key.ctrl&&!key.meta&&typeof text==='string'&&/^[A-Z]+$/.test(text))this.confirm=(this.confirm+text).slice(0,12);
   this.state.confirmation=this.confirm;this.publish();
  }
 }
}
function renderMnemonicMenu(state,{columns=80,rows=24,color=false}={}){
 const width=Math.max(5,Math.min(144,columns-1)),height=Math.max(3,rows-1);
 const clean=s=>stripVTControlCharacters(String(s||'')).replace(/[^\x20-\x7e]/g,' ');
 const clip=s=>clean(s).slice(0,width);
 const menu=state.mnemonicMenu||{},lines=[];
 const paint=(code,s)=>color?'\x1b['+code+'m'+s+'\x1b[0m':s;
 const add=s=>lines.push(clip(s));
 add('YBR // GANACHE WALLET CONTROL');add('FOLLOW THE YELLOW BRICK ROAD');add('');
 add('DISPOSABLE TEST SEEDS ONLY. Never enter a real-funded wallet seed.');
 add('Ganache unlocks accounts. Saved seeds are local plaintext, mode 600.');
 add('');
 if(menu.stage==='menu'){
  add('[g] Generate a new 24-word test mnemonic');add('[i] Enter an existing test mnemonic (hidden input)');
  add('[d] Return to the original deterministic Ganache wallet');add('');
  add('Each mnemonic uses a separate persistent chain and factory.');
  add('Old Bricks, contracts, IPFS pins and Player uploads are retained.');
 }else if(menu.stage==='input'){
  add('Paste or type your English BIP-39 test mnemonic. Input is hidden.');
  add('Words: '+(menu.words||0)+' | Characters: '+(menu.characters||0));
  add('');add('[Enter] Validate   [Backspace] Edit   [Ctrl+U] Clear');
 }else if(menu.stage==='review'){
  add('New account 0: '+menu.account);add('Profile: '+menu.profile);add('');
  if(menu.same)add('This wallet profile is already selected. Enter returns unchanged.');
  else{
   add('This stops the managed stack; restart with: npm run dev');
   add('A new seed starts a separate chain. Re-enter an old seed to return.');
   add('No pending mint? Save browser recovery backups before switching.');
   add('Reconnect MetaMask and check the factory address after restart.');
   add('');add('Type SWITCH and press Enter: '+(menu.confirmation||''));
  }
 }else{add('Stopping owned services before saving the wallet selection...');add('Existing databases and IPFS pins are not removed.');}
 if(menu.error){add('');add(menu.error);}
 const footer=menu.stage==='applying'?'Applying confirmed change...':'[Esc / Ctrl+C] Cancel without changing the wallet';
 const result=lines.slice(0,Math.max(0,height-1));result.push(clip(footer));
 return result.map((line,i)=>i===0?paint('38;5;220',line):i===1?paint('38;5;51',line):i===3?paint('91',line):line);
}
module.exports={MnemonicEditor,renderMnemonicMenu};
