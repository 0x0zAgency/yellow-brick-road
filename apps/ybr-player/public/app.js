'use strict';
const $ = (id) => document.getElementById(id);
const audio = $('audio');
const {playableNewest,selectionFor,isPlayable,continuationQueue}=window.YBRLibrary;
let bricks = [], catalogBricks = [], savedUploads = [];
const unavailable = new Set();
let selectionPinned = false, selectionRevision = 0, sessionRevision = 0, currentUser = null;
let selected = null;
let registryPartial = false;
let toastTimeout;
let currentMediaBrick = null;
let signedIn = false, refreshing = false, librarySignature = '', lastRoadState = '';
audio.volume = .75;
let continuousPlay=true,playIntent=0,interactionRun=null,eventQueue=Promise.resolve(),pendingEvents=0;
try{continuousPlay=localStorage.getItem('ybr:continuous-play')!=='off';}catch{}
const continuous=document.createElement('button');continuous.id='continuousPlay';continuous.type='button';continuous.className='text-button';
const paintContinuous=()=>{continuous.textContent='Continuous play: '+(continuousPlay?'ON':'OFF');continuous.setAttribute('aria-pressed',String(continuousPlay));};
paintContinuous();document.querySelector('.top-actions').prepend(continuous);
continuous.addEventListener('click',()=>{continuousPlay=!continuousPlay;playIntent++;paintContinuous();try{localStorage.setItem('ybr:continuous-play',continuousPlay?'on':'off');}catch{}});
async function continuePlayback(){
 if(!continuousPlay||!signedIn||!currentMediaBrick)return;
 const intent=playIntent,queue=continuationQueue(bricks,currentMediaBrick);
 for(const id of queue){
  if(!continuousPlay||!signedIn||intent!==playIntent)return;
  const brick=bricks.find(item=>item.id===id);if(!brick)continue;
  const result=await choose(brick,true,{automatic:true});
  if(result!=='unavailable')return;
 }
 toast('No further playable tracks are available.');
}

// The server issues the ordinary HttpOnly session. No password is embedded here.
const demoArtistLogin=document.createElement('button');
demoArtistLogin.id='demoArtistLogin';demoArtistLogin.type='button';
demoArtistLogin.className='gold-button';
demoArtistLogin.textContent='Continue as artist (demo)';

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),3500);
}
async function request(url, options={}) {
  let res;
  try { res = await fetch(url, { credentials:'same-origin', ...options }); }
  catch { throw new Error('Could not reach the local YBR Player server'); }
  const body = await res.json().catch(()=>({error:`HTTP ${res.status}`}));
  if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`),{status:res.status});
  return body;
}
const post=(url,body={})=>request(url,{signal:AbortSignal.timeout(10000),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const stamp= (sec) => {
  const v=Number.isFinite(sec)?Math.max(0,Math.floor(sec)):0;
  return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;
};
function selectedIndex() { return bricks.findIndex(b=>b.id===selected?.id); }
function updatePlayback() {
  const playing = !audio.paused && !audio.ended;
  $('playGlyph').textContent=playing?'Ⅱ':'▶';
  $('playPause').setAttribute('aria-label',playing?'Pause':'Play');
  $('nowStatus').classList.toggle('on',playing);
  const duration=Number.isFinite(audio.duration)?audio.duration:(selected?.durationSeconds || 0);
  $('duration').textContent=stamp(duration);
  $('elapsed').textContent=stamp(audio.currentTime);
  $('seek').value=duration>0?String(Math.round(audio.currentTime/duration*1000)):'0';
}
function updateInspector(brick) {
  $('brickTitle').textContent=brick?.title || 'Select a brick';
  $('brickArtist').textContent=brick?.creator || 'Its metadata will appear here.';
  $('brickId').textContent=brick?.id || '—';
  $('copyId').disabled=!brick;
  $('brickRights').textContent=brick?(brick.streamAllowed?'AUTHORIZED':brick.source==='road-registry'?'REGISTERED / NOT PUBLISHED':'ACCESS RESTRICTED'):'—';
  $('brickRights').className=brick?(brick.streamAllowed?'authorized':'denied'):'';
  $('brickFormat').textContent=brick?.media?.mimeType || '—';
  const digest=brick?.media?.sha256||brick?.registration?.contentHash;
  $('brickHash').textContent=digest?digest.slice(0,13)+'…':'—';
  $('brickHash').title=digest||'SHA-256 commitment';
  $('brickProvenance').textContent=brick ? `${brick.provenance.agent} · ${brick.provenance.activity}. ${brick.rights.notes} SHA-256 binds this manifest to the original audio bytes.` : 'Select an audio brick to inspect its source and origin.';
  if(brick?.source==='road-registry'){
    const r=brick.registration;
    $('brickFormat').textContent='Not published';
    $('brickProvenance').textContent=`Registered on chain ${r.chainId}. Contract: ${r.brickAddress}. Metadata reference: ${r.metadataURI}. Registration does not publish files or grant playback. Use Add release to Player in Mint Studio to share selected preview copies.`;
  }
  $('inspectorCover').classList.toggle('violet',brick?.theme==='violet');
  window.dispatchEvent(new CustomEvent('ybr:selection',{detail:{brick}}));
}
function renderList() {
  const list=$('trackList'); list.replaceChildren();
  bricks.forEach((brick,i)=>{
    const row=document.createElement('div'); row.className='track-row'+(selected?.id===brick.id?' active':'');
    row.setAttribute('role','listitem');row.dataset.brickId=brick.id;
    row.tabIndex=0;
    const ix=document.createElement('span');ix.className='track-index';ix.textContent=String(i+1).padStart(2,'0');
    const cover=document.createElement('span');cover.className=`track-thumbnail ${brick.theme==='violet'?'violet':'gold'}`;cover.textContent='◆';
    const info=document.createElement('div');info.className='track-info';
    const name=document.createElement('strong');name.textContent=brick.title;
    const creator=document.createElement('small');creator.textContent=brick.creator+' · '+((brick.source==='road'||brick.source==='road-registry')?'CHAIN '+(brick.road?.chainId||brick.registration?.chainId||'?')+' · '+brick.id.slice(0,12)+'…':brick.source==='studio-demo'?'UPLOADED DEMO':brick.id);
    info.append(name,creator);
    const tag=document.createElement('span');tag.className='track-tag'+(brick.streamAllowed?'':' locked');tag.textContent=brick.source==='road-registry'?'⌁ ON CHAIN':brick.source==='studio-demo'?'◈ DEMO UPLOAD':brick.source==='road'?'◈ ROAD OPEN':brick.streamAllowed?'◈ DEMO READY':'⌁ RESTRICTED';
    const duration=document.createElement('span');duration.className='track-duration';duration.textContent=brick.source==='road-registry'?'—':stamp(brick.durationSeconds);
    const play=document.createElement('button');play.className='track-action';play.type='button';play.setAttribute('aria-label',`${brick.streamAllowed?'Play':'Inspect restricted'} ${brick.title}`);play.textContent=brick.streamAllowed?'▶':'⌁';
    const action=()=>{if(currentMediaBrick&&currentMediaBrick!==brick.id)recordEvent('skip');void choose(brick,true);};
    play.addEventListener('click',(e)=>{e.stopPropagation();action();});
    row.addEventListener('click',action);
    row.addEventListener('keydown',(e)=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();action();}});
    row.append(ix,cover,info,tag,duration,play);
    list.append(row);
  });
  $('libraryEmpty').hidden=bricks.length>0;
  $('trackList').hidden=bricks.length===0;
  for(const id of ['featurePlay','playPause','next','previous','seek'])$(id).disabled=bricks.length===0;
  const newest=bricks[0];
  document.querySelector('.feature h2').textContent=newest?.title||'Your next release starts here.';
  document.querySelector('.feature-copy > p').textContent=newest?newest.creator+' · Newest playable release':'Share an Audio Preview from Mint Studio to start listening.';
  $('featurePlay').title=newest?'Play '+newest.title:'No playable tracks available';
  $('trackCount').textContent=`${bricks.length} playable track${bricks.length===1?'':'s'} · newest first${registryPartial?' · partial registry scan':''}`;
  window.dispatchEvent(new CustomEvent('ybr:library',{detail:{bricks,uploads:savedUploads}}));
}
function stopMedia() {
  interactionRun=null;
  selectionRevision++;
  currentMediaBrick=null;
  audio.pause();audio.removeAttribute('src');audio.load();
}
function renderSelection() {
  updateInspector(selected);
  $('nowTitle').textContent=selected?.title||'Nothing playing';
  $('nowArtist').textContent=selected?.creator||'No playable tracks available';
  $('miniCover').classList.toggle('violet',selected?.theme==='violet');
  updatePlayback();
}
function applyLibrary() {
  bricks=playableNewest(catalogBricks,{canPlayType:mime=>audio.canPlayType(mime),unavailable});
  if(currentMediaBrick&&!bricks.some(brick=>brick.id===currentMediaBrick)){playIntent++;stopMedia();}
  const previous=selected?.id;
  selected=selectionFor(bricks,previous,selectionPinned||!!currentMediaBrick);
  if(!selected||selected.id!==previous)selectionPinned=false;
  renderSelection();renderList();
}
function hideUnavailable(id,message) {
  unavailable.add(id);librarySignature='';applyLibrary();toast(message);
}
async function choose(brick, playNow=true, {automatic=false}={}) {
  if(!automatic)playIntent++;
  if (!brick||!bricks.some(item=>item.id===brick.id)||!isPlayable(brick,mime=>audio.canPlayType(mime))) return;
  selectionPinned=true;
  if (selected?.id===brick.id && currentMediaBrick===brick.id && playNow && !automatic) return togglePlay();
  stopMedia();const revision=selectionRevision,intent=playIntent;
  selected=brick;
  $('nowTitle').textContent=brick.title;
  $('nowArtist').textContent=brick.creator;
  $('miniCover').classList.toggle('violet',brick.theme==='violet');
  $('elapsed').textContent='0:00';$('duration').textContent=stamp(brick.durationSeconds);$('seek').value=0;
  updateInspector(brick);renderList();updatePlayback();
  if (!playNow) return;
  if (!brick.streamAllowed) {toast(brick.source==='road-registry'?'This Brick is registered. Share a preview through Add release to Player in Mint Studio to enable local playback.':`Access denied: ${brick.title} is not licensed to this account.`);return;}
  try {
    const grant=await post(`/api/bricks/${encodeURIComponent(brick.id)}/authorize`);
    if (revision!==selectionRevision||intent!==playIntent||!signedIn||selected?.id!==brick.id) return;
    if (!grant.authorized) throw Object.assign(new Error('Authorization refused'),{status:403});
    audio.src=grant.mediaUrl;
    currentMediaBrick=brick.id;
    interactionRun={id:crypto.randomUUID(),brickId:brick.id,sha256:brick.media.sha256};
    audio.load();
    await audio.play();
    return 'playing';
  } catch(err) {
    if(revision!==selectionRevision||intent!==playIntent||!signedIn||selected?.id!==brick.id)return;
    if([403,404,409,410].includes(err.status)||err.name==='NotSupportedError'){
      hideUnavailable(brick.id,'This track is no longer playable and has been hidden.');return 'unavailable';
    }
    if(err.name==='AbortError')return;
    toast(err.name==='NotAllowedError'?'Authorized. Click Play to begin playback.':err.message);
  }
}
async function togglePlay() {
  playIntent++;
  if (!selected) return choose(bricks.find(b=>b.streamAllowed),true);
  if (!currentMediaBrick || currentMediaBrick!==selected.id) return choose(selected,true);
  if (audio.paused) {
    try {await audio.play();} catch(e) {toast(e.message);} return;
  }
  audio.pause();
}
async function refreshSession() {
  const revision=sessionRevision;
  let session=await request('/api/session');
  if(revision!==sessionRevision)return;
  const demo=session.demoAutoLogin==='artist';
  if(demo)$('loginForm').querySelector('.login-footnote').before(demoArtistLogin);
  else demoArtistLogin.remove();
  $('logout').textContent=demo?'Switch account ↗':'Sign out ↗';
  if(!session.authenticated&&demo&&!session.demoAutoLoginPaused){
    try{session={...session,...await post('/api/session/demo')};}
    catch(error){if(revision===sessionRevision)$('loginError').textContent=error.message;}
    if(revision!==sessionRevision)return;
  }
  signedIn=!!session.authenticated;
  if (!signedIn) {
    playIntent++;stopMedia();currentUser=null;selected=null;selectionPinned=false;catalogBricks=[];savedUploads=[];
    unavailable.clear();librarySignature='';applyLibrary();$('signedInAs').textContent='Not connected';$('loginOverlay').hidden=false;return;
  }
  if(currentUser!==session.user){
    playIntent++;stopMedia();selected=null;selectionPinned=false;unavailable.clear();librarySignature='';
    currentUser=session.user;
  }
  $('loginOverlay').hidden=true;
  $('signedInAs').textContent=`Signed in as ${session.user}${demo?' · local demo':''}`;
  const library=await request('/api/bricks');
  if(revision!==sessionRevision)return;
  const signature=JSON.stringify([library.bricks,library.network,library.registry,library.uploads]);
  registryPartial=!!(library.registry?.limited||library.registry?.limitReached);
  $('activeNetwork').textContent=(library.network?.label||'Chain '+(library.network?.chainId||'?'))+(library.network?.ready?'':' · offline');
  if(signature===librarySignature)return;
  librarySignature=signature;
  catalogBricks=library.bricks;savedUploads=Array.isArray(library.uploads)?library.uploads:[];
  const roadState=JSON.stringify(library.network);
  if(library.network?.ready===false&&roadState!==lastRoadState)toast('Road offline: '+library.network.reason+' · no alternate network selected');
  lastRoadState=roadState;
  applyLibrary();
}
function sendInteraction(body){
 const session=sessionRevision,user=currentUser;
 // Capture each event's identity immediately, then preserve its ordering across
 // end-to-next transitions. Failed telemetry never blocks listening.
 if(pendingEvents>=64){window.dispatchEvent(new Event('ybr:interaction-error'));return;}
 pendingEvents++;
 eventQueue=eventQueue.then(()=>{if(session!==sessionRevision||user!==currentUser||!signedIn)return null;return post('/api/interactions',body);}).then(result=>{if(result)window.dispatchEvent(new Event('ybr:interaction-recorded'));}).catch(()=>window.dispatchEvent(new Event('ybr:interaction-error'))).finally(()=>{pendingEvents--;});
}
function recordEvent(event){
 const run=interactionRun;
 if(!run||!currentMediaBrick||run.brickId!==currentMediaBrick||!selected||currentMediaBrick!==selected.id)return;
 sendInteraction({event,brickId:run.brickId,sha256:run.sha256,playbackId:run.id,eventId:crypto.randomUUID(),positionSeconds:Number(audio.currentTime)||0});
}
let displaySelection=null,displayed=new Set();
window.addEventListener('ybr:selection',event=>{const id=event.detail?.brick?.id;if(id!==displaySelection){displaySelection=id;displayed.clear();}});
window.addEventListener('ybr:file-display',event=>{
 const value=event.detail;if(!signedIn||value?.brickId!==selected?.id||!['artwork','lyrics'].includes(value.role))return;
 const key=value.role+':'+value.sha256;if(displayed.has(key))return;displayed.add(key);
 sendInteraction({event:value.role+'-view',brickId:value.brickId,sha256:value.sha256,playbackId:crypto.randomUUID(),eventId:crypto.randomUUID(),positionSeconds:0});
});
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();sessionRevision++;
  const button=e.target.querySelector('button[type=submit]');
  button.disabled=true;demoArtistLogin.disabled=true;
  $('loginError').textContent='';
  try {
    await post('/api/session',{username:$('username').value.trim(),password:$('password').value});
    $('password').value='';
    await refreshSession();
    toast('Session authorized. Select a Brick to begin.');
  } catch(err) { $('loginError').textContent=err.message; }
  finally {button.disabled=false;demoArtistLogin.disabled=false;}
});
demoArtistLogin.addEventListener('click',async()=>{
  if(demoArtistLogin.disabled)return;
  sessionRevision++;demoArtistLogin.disabled=true;
  const button=$('loginForm').querySelector('button[type=submit]');button.disabled=true;
  $('loginError').textContent='';
  try{await post('/api/session/demo',{resume:true});await refreshSession();}
  catch(error){$('loginError').textContent=error.message;}
  finally{demoArtistLogin.disabled=false;button.disabled=false;}
});
$('logout').addEventListener('click',async()=>{
  playIntent++;sessionRevision++;signedIn=false;librarySignature='';stopMedia();selected=null;bricks=[];catalogBricks=[];savedUploads=[];
  selectionPinned=false;currentUser=null;unavailable.clear();
  await post('/api/logout');
  $('loginOverlay').hidden=false;
  $('signedInAs').textContent='Not connected';
  $('nowTitle').textContent='Nothing playing';$('nowArtist').textContent='Pick a brick to begin';
  renderSelection();renderList();$('trackCount').textContent='Sign in to see tracks';
});
$('featurePlay').addEventListener('click',()=>choose(bricks[0],true));
$('playPause').addEventListener('click',togglePlay);
$('next').addEventListener('click',()=>{if(!bricks.length)return;recordEvent('skip');choose(bricks[(selectedIndex()+1)%bricks.length],true);});
$('previous').addEventListener('click',()=>{if(!bricks.length)return;recordEvent('skip');choose(bricks[(selectedIndex()+bricks.length-1)%bricks.length],true);});
$('volume').addEventListener('input',e=>{audio.volume=Number(e.target.value)/100;});
$('seek').addEventListener('input',e=>{
  if (Number.isFinite(audio.duration) && audio.duration>0) audio.currentTime=Number(e.target.value)/1000*audio.duration;
});
$('copyId').addEventListener('click',async()=>{
  if (!selected) return;
  try {await navigator.clipboard.writeText(selected.id);toast('Brick ID copied');}catch{toast(`Brick ID: ${selected.id}`);}
});
$('inspectorNav').addEventListener('click',()=>{$('inspector').scrollIntoView({behavior:'smooth',block:'start'});});
$('libraryNav').addEventListener('click',()=>{$('trackList').scrollIntoView({behavior:'smooth',block:'center'});});
for(const event of ['timeupdate','durationchange','play','pause','ended','loadedmetadata']) audio.addEventListener(event,updatePlayback);
for(const event of ['play','pause','ended']) audio.addEventListener(event,()=>{if(event!=='pause'||!audio.ended)recordEvent(event);});
audio.addEventListener('seeked',()=>recordEvent('seek'));
audio.addEventListener('ended',()=>{void continuePlayback();});
audio.addEventListener('error',()=>{
  if(!audio.getAttribute('src')||!currentMediaBrick)return;
  const id=currentMediaBrick;
  // Decode/unsupported-source failures are definitive for this browser session.
  // Network interruptions are not: keep those tracks available for retry.
  playIntent++;
  if([3,4].includes(audio.error?.code))hideUnavailable(id,'This audio cannot be played and has been hidden. Refresh the library to retry after fixing it.');
  else {stopMedia();toast('Playback was interrupted. Click Play to retry.');}
});
refreshSession().catch(e=>toast(e.message));

async function refreshLibrary(){
  if(!signedIn||refreshing)return;
  refreshing=true;
  try{await refreshSession();}catch{window.dispatchEvent(new Event('ybr:library-error'));}
  finally{refreshing=false;}
}
window.addEventListener('ybr:refresh-request',()=>{unavailable.clear();librarySignature='';void refreshLibrary();});
window.addEventListener('ybr:select-release',event=>{const found=bricks.find(brick=>brick.id===event.detail?.id);if(found)void choose(found,false);});
setInterval(()=>{if(!document.hidden)void refreshLibrary();},5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshLibrary();});
