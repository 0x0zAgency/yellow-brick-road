'use strict';
const $ = (id) => document.getElementById(id);
const audio = $('audio');
let bricks = [];
let selected = null;
let toastTimeout;
let currentMediaBrick = null;
audio.volume = .75;

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
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}
const post=(url,body={})=>request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
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
  if (duration>0) $('seek').value=String(Math.round(audio.currentTime/duration*1000));
}
function updateInspector(brick) {
  $('brickTitle').textContent=brick?.title || 'Select a brick';
  $('brickArtist').textContent=brick?.creator || 'Its metadata will appear here.';
  $('brickId').textContent=brick?.id || '—';
  $('copyId').disabled=!brick;
  $('brickRights').textContent=brick?(brick.streamAllowed?'AUTHORIZED':'ACCESS RESTRICTED'):'—';
  $('brickRights').className=brick?(brick.streamAllowed?'authorized':'denied'):'';
  $('brickFormat').textContent=brick?.media?.mimeType || '—';
  $('brickHash').textContent=brick?.media?.sha256 ? brick.media.sha256.slice(0,13)+'…' : '—';
  $('brickHash').title=brick?.media?.sha256 || 'SHA-256 hash';
  $('brickProvenance').textContent=brick ? `${brick.provenance.agent} · ${brick.provenance.activity}. ${brick.rights.notes} SHA-256 binds this manifest to the original audio bytes.` : 'Select an audio brick to inspect its source and origin.';
  $('inspectorCover').classList.toggle('violet',brick?.theme==='violet');
}
function renderList() {
  const list=$('trackList'); list.replaceChildren();
  bricks.forEach((brick,i)=>{
    const row=document.createElement('div'); row.className='track-row'+(selected?.id===brick.id?' active':'');
    row.setAttribute('role','listitem');
    row.tabIndex=0;
    const ix=document.createElement('span');ix.className='track-index';ix.textContent=String(i+1).padStart(2,'0');
    const cover=document.createElement('span');cover.className=`track-thumbnail ${brick.theme==='violet'?'violet':'gold'}`;cover.textContent='◆';
    const info=document.createElement('div');info.className='track-info';
    const name=document.createElement('strong');name.textContent=brick.title;
    const creator=document.createElement('small');creator.textContent=brick.creator+' · '+(brick.source==='road'?'GANACHE · '+brick.id.slice(0,12)+'…':brick.id);
    info.append(name,creator);
    const tag=document.createElement('span');tag.className='track-tag'+(brick.streamAllowed?'':' locked');tag.textContent=brick.source==='road'?'◈ ROAD OPEN':brick.streamAllowed?'◈ DEMO READY':'⌁ RESTRICTED';
    const duration=document.createElement('span');duration.className='track-duration';duration.textContent=stamp(brick.durationSeconds);
    const play=document.createElement('button');play.className='track-action';play.type='button';play.setAttribute('aria-label',`${brick.streamAllowed?'Play':'Inspect restricted'} ${brick.title}`);play.textContent=brick.streamAllowed?'▶':'⌁';
    const action=()=>choose(brick,true);
    play.addEventListener('click',(e)=>{e.stopPropagation();action();});
    row.addEventListener('click',action);
    row.addEventListener('keydown',(e)=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();action();}});
    row.append(ix,cover,info,tag,duration,play);
    list.append(row);
  });
  $('trackCount').textContent=`${bricks.length} audio bricks · ${bricks.filter(b=>b.source==='road').length} from Ganache`;
}
async function choose(brick, playNow=true) {
  if (!brick) return;
  if (selected?.id===brick.id && currentMediaBrick===brick.id && playNow) return togglePlay();
  audio.pause();audio.removeAttribute('src');audio.load();currentMediaBrick=null;
  selected=brick;
  $('nowTitle').textContent=brick.title;
  $('nowArtist').textContent=brick.creator;
  $('miniCover').classList.toggle('violet',brick.theme==='violet');
  $('elapsed').textContent='0:00';$('duration').textContent=stamp(brick.durationSeconds);$('seek').value=0;
  updateInspector(brick);renderList();updatePlayback();
  if (!playNow) return;
  if (!brick.streamAllowed) {toast(`Access denied: ${brick.title} is not licensed to this account.`);return;}
  try {
    const grant=await post(`/api/bricks/${encodeURIComponent(brick.id)}/authorize`);
    if (selected?.id!==brick.id) return;
    if (!grant.authorized) throw new Error('Authorization refused');
    audio.src=grant.mediaUrl;
    currentMediaBrick=brick.id;
    audio.load();
    await audio.play();
  } catch(err) {
    toast(err.name==='NotAllowedError'?'Authorized. Click Play to begin playback.':err.message);
  }
}
async function togglePlay() {
  if (!selected) return choose(bricks.find(b=>b.streamAllowed),true);
  if (!currentMediaBrick || currentMediaBrick!==selected.id) return choose(selected,true);
  if (audio.paused) {
    try {await audio.play();} catch(e) {toast(e.message);} return;
  }
  audio.pause();
}
async function refreshSession() {
  const session=await request('/api/session');
  if (!session.authenticated) { $('loginOverlay').hidden=false;return; }
  $('loginOverlay').hidden=true;
  $('signedInAs').textContent=`Signed in as ${session.user}`;
  const library=await request('/api/bricks');
  bricks=library.bricks;
  if(library.network?.ready===false) toast('Road offline: '+library.network.reason+' · local demo music remains available');
  const previous=selected?.id;
  selected=bricks.find(b=>b.id===previous) || bricks[0] || null;
  if (selected) {
    updateInspector(selected);
    $('nowTitle').textContent=selected.title;
    $('nowArtist').textContent=selected.creator;
    $('miniCover').classList.toggle('violet',selected.theme==='violet');
    $('duration').textContent=stamp(selected.durationSeconds);
  }
  renderList();updatePlayback();
}
async function recordEvent(event) {
  if (!currentMediaBrick || !selected || currentMediaBrick!==selected.id) return;
  try {
    await post('/api/events',{event,brickId:currentMediaBrick,positionSeconds:Number(audio.currentTime)||0});
  } catch { /* Playback remains possible if demo telemetry fails. */ }
}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const button=e.target.querySelector('button[type=submit]');
  button.disabled=true;
  $('loginError').textContent='';
  try {
    await post('/api/session',{username:$('username').value.trim(),password:$('password').value});
    $('password').value='';
    await refreshSession();
    toast('Session authorized. Select a Brick to begin.');
  } catch(err) { $('loginError').textContent=err.message; }
  finally {button.disabled=false;}
});
$('logout').addEventListener('click',async()=>{
  audio.pause();audio.removeAttribute('src');audio.load();currentMediaBrick=null;selected=null;bricks=[];
  await post('/api/logout');
  $('loginOverlay').hidden=false;
  $('signedInAs').textContent='Not connected';
  $('nowTitle').textContent='Nothing playing';$('nowArtist').textContent='Pick a brick to begin';
  updateInspector(null);$('trackList').replaceChildren();$('trackCount').textContent='Sign in to see bricks';updatePlayback();
});
$('featurePlay').addEventListener('click',()=>choose(bricks[0],true));
$('playPause').addEventListener('click',togglePlay);
$('next').addEventListener('click',()=>{if(!bricks.length)return;choose(bricks[(selectedIndex()+1)%bricks.length],true);});
$('previous').addEventListener('click',()=>{if(!bricks.length)return;choose(bricks[(selectedIndex()+bricks.length-1)%bricks.length],true);});
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
for(const event of ['play','pause','ended']) audio.addEventListener(event,()=>recordEvent(event));
audio.addEventListener('error',()=>{if(audio.getAttribute('src'))toast('Audio could not be loaded. Your authorization may have expired. Click the track to retry.');});
refreshSession().catch(e=>toast(e.message));
