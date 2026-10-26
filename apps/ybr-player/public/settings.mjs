import {BASE_COLORS,COLOR_FIELDS,ICON_OPTIONS,PRESETS,MAX_IMPORT_BYTES,defaultTheme,validateTheme,decodeTheme,encodeTheme,saveNamedTheme,contrastRatio} from './appearance/appearance.js';
import {normalizeImportedGraphics,prepareWorkspaceGraphic} from './appearance/appearance-graphics.js';
import {PLAYER_APPEARANCE_KEY,PLAYER_ICON_FIELDS,loadPlayerAppearance,savePlayerAppearance,playerThemeVariables,workspaceUrl} from './appearance/player-appearance.js';
import {playerIcon} from './settings-icons.mjs';

/** Presentation only. Never opens a vault, changes rights, signs, uploads or starts audio. */
function start(){
 const $=id=>document.getElementById(id),root=$('playerSettings'),audio=$('audio');
 const storage=()=>{try{return window.localStorage;}catch{return null;}};
 let saved=loadPlayerAppearance(storage()),theme=saved.active,tab='tools',generation=0,controller=null,busy=false;
 const defaultMark=document.querySelector('.brand-graphic').innerHTML;
 root.innerHTML=`
  <div class="ps-intro"><div><span class="eyebrow">PLAYER / PERSONALIZE</span><h1 id="playerSettingsTitle" tabindex="-1">Set the <em>tone.</em></h1><p>Your palette. Your mark. Your listening room.</p></div><button type="button" id="settingsBack" class="ps-subtle">← Back to music</button></div>
  <p class="ps-boundary">Appearance is local to this Player browser. Import a workspace theme to carry over its colors and logo. Your Bricks, published covers, rights and audio stay unchanged.</p>
  <div class="ps-tabs" role="tablist" aria-label="Player settings sections">
   <button type="button" role="tab" id="ps-tab-tools" aria-controls="ps-panel-tools" aria-selected="true">Playback & tools</button>
   <button type="button" role="tab" id="ps-tab-themes" aria-controls="ps-panel-themes" aria-selected="false" tabindex="-1">Colors & themes</button>
   <button type="button" role="tab" id="ps-tab-graphics" aria-controls="ps-panel-graphics" aria-selected="false" tabindex="-1">Icons & graphics</button>
  </div>
  <div class="ps-savebar"><span id="appearanceState">Saved appearance</span><div><button type="button" id="discardAppearance">Discard preview</button><button type="button" id="saveAppearance" class="gold-button">Save appearance</button><button type="button" id="restoreAppearance" class="ps-rescue">Restore default preview</button></div></div>
  <p id="appearanceError" class="ps-error" role="alert" hidden></p><p id="appearanceMessage" class="ps-message" role="status"></p>
  <div class="ps-layout"><div class="ps-panels">
   <section id="ps-panel-tools" role="tabpanel" aria-labelledby="ps-tab-tools">
    <div class="ps-card"><span class="ps-kicker">MAKE YOURSELF AT HOME</span><h2>Playback preferences</h2><label class="ps-toggle"><span><b>Continuous play</b><small>Move to the next authorized track when one ends.</small></span><input id="settingsContinuous" type="checkbox" aria-label="Continuous play in settings"></label><label class="ps-volume"><span>Session volume <output id="settingsVolumeValue">75%</output></span><input id="settingsVolume" type="range" min="0" max="100" value="75" aria-label="Session volume"></label><p class="ps-help">Opening Settings or changing a theme never starts or interrupts playback.</p></div>
    <div class="ps-card"><h2>Common tools</h2><div class="ps-tools"><button type="button" id="settingsLibrary"><b>Open library ↗</b><small>Return to available tracks.</small></button><button type="button" id="settingsInspect"><b>Inspect this Brick ↗</b><small>Review provenance and file interactions.</small></button><button type="button" id="settingsRefresh"><b>Refresh library ↻</b><small>Check for newly playable releases.</small></button><a id="settingsWorkspace" target="_blank" rel="noopener noreferrer"><b>Creator workspace ↗</b><small>Mint Studio, Buildings and app settings.</small></a></div></div>
    <div class="ps-card"><h2>Connection & session</h2><dl class="ps-status"><dt>Transport</dt><dd id="settingsTransport"></dd><dt>Session</dt><dd id="settingsSession"></dd><dt>Network</dt><dd id="settingsNetwork">Not checked</dd><dt>Factory</dt><dd id="settingsFactory">Not checked</dd></dl><button type="button" id="settingsCheck">Check Player connection</button><p class="ps-help">Network switches and deployment spending approvals remain in Dev Control. HTTP and HTTPS keep separate browser storage. Export a theme before switching addresses.</p></div>
   </section>
   <section id="ps-panel-themes" role="tabpanel" aria-labelledby="ps-tab-themes" hidden>
    <div class="ps-card"><span class="ps-kicker">A DIFFERENT ATMOSPHERE</span><h2>Start with a theme</h2><div id="playerPresets" class="ps-presets"></div><p class="ps-help">The same four palettes as the creator workspace. Select one to preview it across the Player.</p></div>
    <div class="ps-card"><h2>Make it yours</h2><label class="ps-name">Theme name<input id="playerThemeName" maxlength="48" spellcheck="false" aria-label="Player theme name"></label><div id="playerColors" class="ps-colors"></div><label class="ps-check"><input id="playerReduceMotion" type="checkbox"> Reduce Player animation</label><p class="ps-help">These controls cover the Player interface, not uploaded media. Workspace-specific shade overrides are preserved in theme exports; the Player uses the shared palette.</p></div>
    <div class="ps-card"><h2>Your theme library <span id="playerThemeCount" class="ps-count"></span></h2><button type="button" id="saveNamedAppearance" class="gold-button">Save named theme</button><div id="playerNamedThemes" class="ps-named"></div><div class="ps-transfer"><button type="button" id="exportPlayerTheme">Export theme</button><label class="ps-file-button">Import theme<input id="importPlayerTheme" type="file" accept="application/json,.json" aria-label="Import Player theme JSON"></label></div><p class="ps-help">Workspace theme JSON imports here, including its logo. Player exports import back into Workspace Settings. Import is a preview until you save. Files contain appearance only.</p></div>
   </section>
   <section id="ps-panel-graphics" role="tabpanel" aria-labelledby="ps-tab-graphics" hidden>
    <div class="ps-card"><span class="ps-kicker">THE SAME ROAD, YOUR SIGNATURE</span><h2>Icons</h2><div id="playerIcons" class="ps-icons"></div><label class="ps-name">Icon line weight<select id="playerIconWeight" aria-label="Player icon line weight"><option value="1">Fine</option><option value="1.5">Light</option><option value="1.75">Regular</option><option value="2">Medium</option><option value="2.5">Bold</option></select></label></div>
    <div class="ps-card"><h2>Logo & display graphics</h2><p class="ps-help">The default logo matches the app. Your display copies stay in this browser. PNG, JPEG or WebP, up to 8 MiB; normalized to a bounded PNG. Nothing is uploaded or pinned.</p><div id="playerGraphics" class="ps-graphics"></div><label class="ps-volume"><span>Background intensity <output id="playerBackgroundValue"></output></span><input id="playerBackgroundOpacity" type="range" min="0" max="40" aria-label="Player background intensity"></label><p class="ps-help">A missing-artwork image is an interface placeholder, never a replacement for a published NFT cover.</p></div>
   </section>
  </div>
  <aside class="ps-preview" aria-label="Player theme preview"><span class="ps-kicker">LIVE PLAYER PREVIEW</span><div class="ps-preview-brand"><span id="previewLogo" class="brand-graphic"></span><strong>0x🟨 Road</strong></div><div class="ps-sleeve" id="previewArtwork"><span id="previewArtworkIcon"></span><span class="ps-sleeve-caption">YOUR LISTENING ROOM</span></div><h3>Your next favorite.</h3><p>Every sound has a source.</p><div class="ps-preview-transport"><span>01:23</span><i></i><span>03:45</span></div><button type="button" class="gold-button" disabled>▶ &nbsp; Primary action</button><small>Appearance preview only</small><div class="ps-contrast"><b>Readability check</b><span id="playerTextContrast"></span><span id="playerButtonContrast"></span><p id="playerContrastWarning" hidden>Low contrast. Adjust your text or background. This checks two pairs, not every element.</p></div></aside>
  </div>`;
 const message=text=>{$('appearanceMessage').textContent=text;};
 const error=text=>{$('appearanceError').textContent=text;$('appearanceError').hidden=!text;};
 const dirty=()=>JSON.stringify(theme)!==JSON.stringify(saved.active);
 const setBusy=value=>{busy=value;for(const id of ['saveAppearance','saveNamedAppearance','discardAppearance','exportPlayerTheme'])$(id).disabled=value;};
 function cancelPreparation(){generation++;controller?.abort();controller=null;setBusy(false);}
 function syncState(){const changed=dirty();$('appearanceState').textContent=changed?'Unsaved preview':'Saved appearance';$('appearanceState').classList.toggle('ps-dirty',changed);}
 function showGraphic(container,src,alt){
  const img=container.querySelector('img');
  if(src){if(img?.getAttribute('src')===src)return;const next=document.createElement('img');next.alt=alt;next.src=src;next.addEventListener('error',()=>{container.innerHTML=defaultMark;},{once:true});container.replaceChildren(next);}
  else if(img||!container.firstChild)container.innerHTML=defaultMark;
 }
 function apply(){
  for(const [key,value] of Object.entries(playerThemeVariables(theme)))document.documentElement.style.setProperty(key,value);
  document.documentElement.style.setProperty('--player-placeholder',theme.graphics.placeholder?'url("'+theme.graphics.placeholder+'")':'none');
  document.documentElement.dataset.playerMotion=theme.reduceMotion?'reduced':'system';
  document.documentElement.dataset.playerPlaceholder=theme.graphics.placeholder?'custom':'default';
  document.documentElement.style.colorScheme=parseInt(theme.colors.background.slice(1,3),16)>160?'light':'dark';
  document.querySelector('meta[name="theme-color"]').content=theme.colors.background;
  for(const box of document.querySelectorAll('.brand-graphic'))showGraphic(box,theme.graphics.logo,'Road logo');
  for(const el of document.querySelectorAll('[data-appearance-icon]'))el.replaceChildren(playerIcon(theme.icons[el.dataset.appearanceIcon],theme.iconWeight));
  $('previewArtworkIcon').replaceChildren(playerIcon(theme.icons.placeholder,theme.iconWeight));
  $('previewArtwork').style.backgroundImage=theme.graphics.placeholder?'url("'+theme.graphics.placeholder+'")':'none';
  $('previewArtwork').classList.toggle('ps-custom-art',Boolean(theme.graphics.placeholder));
  const text=contrastRatio(theme.colors.text,theme.colors.surface),button=contrastRatio(theme.colors.onAccent,theme.colors.accent);
  $('playerTextContrast').textContent='Text / panel: '+text.toFixed(2)+':1';$('playerButtonContrast').textContent='Button: '+button.toFixed(2)+':1';$('playerContrastWarning').hidden=text>=4.5&&button>=4.5;
  placeholderNote();syncState();
 }
 function syncControls(){
  if(document.activeElement!==$('playerThemeName'))$('playerThemeName').value=theme.name;
  for(const key of Object.keys(BASE_COLORS)){
   for(const type of ['color','hex']){const el=$('pc-'+key+'-'+type);if(document.activeElement!==el)el.value=theme.colors[key];}
  }
  $('playerReduceMotion').checked=theme.reduceMotion;$('playerIconWeight').value=String(theme.iconWeight);
  $('playerBackgroundOpacity').value=String(Math.round(theme.backgroundOpacity*100));$('playerBackgroundValue').value=Math.round(theme.backgroundOpacity*100)+'%';
  for(const key of Object.keys(PLAYER_ICON_FIELDS))$('pi-'+key).value=theme.icons[key];
  for(const key of ['logo','background','placeholder']){const img=$('pg-'+key+'-preview');img.hidden=!theme.graphics[key];if(theme.graphics[key]){if(img.getAttribute('src')!==theme.graphics[key])img.src=theme.graphics[key];}else img.removeAttribute('src');}
  for(const b of $('playerPresets').children)b.setAttribute('aria-pressed',String(b.dataset.name===theme.name));
 }
 function preview(next){cancelPreparation();try{theme=validateTheme(next);apply();syncControls();error('');}catch(e){error(e.message);}}
 function edit(key,value){preview({...theme,[key]:value});}
 function renderLibrary(){
  $('playerNamedThemes').replaceChildren();$('playerThemeCount').textContent=saved.themes.length+' / 8';
  if(!saved.themes.length){const p=document.createElement('p');p.className='ps-help';p.textContent='No named themes yet. Save your first mix of colors and graphics.';$('playerNamedThemes').append(p);}
  for(const item of saved.themes){const row=document.createElement('div'),load=document.createElement('button'),remove=document.createElement('button');row.className='ps-named-row';load.type=remove.type='button';load.textContent=item.name;load.setAttribute('aria-label','Load Player theme '+item.name);load.onclick=()=>preview(item);remove.textContent='Remove';remove.setAttribute('aria-label','Delete Player theme '+item.name);remove.onclick=()=>{
    try{const current=loadPlayerAppearance(storage());saved=savePlayerAppearance(storage(),{active:current.active,themes:current.themes.filter(t=>t.name!==item.name)});renderLibrary();syncState();error('');message('Named theme removed. Your current preview is unchanged.');}catch(e){error(e.message);}
   };row.append(load,remove);$('playerNamedThemes').append(row);}
 }
 function save(named=false){if(busy)return;try{const current=loadPlayerAppearance(storage());const themes=named?saveNamedTheme(current.themes,theme):current.themes;saved=savePlayerAppearance(storage(),{active:theme,themes});renderLibrary();syncState();error('');message(named?'Theme saved and applied in this Player.':'Appearance saved in this Player browser.');}catch(e){error(e.message);}}
 for(const preset of PRESETS){const b=document.createElement('button'),swatches=document.createElement('span'),name=document.createElement('b');b.type='button';b.className='ps-preset';b.dataset.name=preset.name;name.textContent=preset.name;swatches.className='ps-swatches';for(const color of ['background','surface','accent','secondary']){const dot=document.createElement('i');dot.style.backgroundColor=preset.colors[color];swatches.append(dot);}b.append(swatches,name);b.onclick=()=>preview(preset);$('playerPresets').append(b);}
 for(const [key,label] of Object.entries(COLOR_FIELDS)){
  const wrap=document.createElement('div'),caption=document.createElement('label'),controls=document.createElement('div'),color=document.createElement('input'),hex=document.createElement('input');wrap.className='ps-color';caption.textContent=label;caption.htmlFor='pc-'+key+'-color';color.type='color';color.id=caption.htmlFor;color.setAttribute('aria-label',label+' color');hex.type='text';hex.id='pc-'+key+'-hex';hex.maxLength=7;hex.spellcheck=false;hex.setAttribute('aria-label',label+' hex');
  const update=value=>{if(/^#[a-f\d]{6}$/i.test(value))edit('colors',{...theme.colors,[key]:value});};color.oninput=()=>update(color.value);hex.oninput=()=>update(hex.value);hex.onblur=()=>{hex.value=theme.colors[key];};controls.append(color,hex);wrap.append(caption,controls);$('playerColors').append(wrap);
 }
 for(const [key,label] of Object.entries(PLAYER_ICON_FIELDS)){
  const wrap=document.createElement('label'),select=document.createElement('select');wrap.className='ps-name';wrap.append(document.createTextNode(label));select.id='pi-'+key;select.setAttribute('aria-label',label+' icon');for(const name of ICON_OPTIONS){const option=document.createElement('option');option.value=name;option.textContent=name;select.append(option);}select.onchange=()=>edit('icons',{...theme.icons,[key]:select.value});wrap.append(select);$('playerIcons').append(wrap);
 }
 async function prepare(operation,success){
  cancelPreparation();const id=generation;controller=new AbortController();setBusy(true);error('');message('Preparing a local display preview…');
  try{const next=await operation(controller.signal);if(id!==generation)return;theme=validateTheme(next);apply();syncControls();message(success);}
  catch(e){if(id===generation){error(e.message);message('');}}
  finally{if(id===generation)setBusy(false);}
 }
 for(const [key,label] of [['logo','Player logo'],['background','Ambient background'],['placeholder','Missing-artwork placeholder']]){
  const row=document.createElement('div'),info=document.createElement('div'),name=document.createElement('b'),img=document.createElement('img'),input=document.createElement('input'),remove=document.createElement('button');row.className='ps-graphic';info.className='ps-graphic-controls';name.textContent=label;img.id='pg-'+key+'-preview';img.alt=label;img.hidden=true;input.type='file';input.accept='image/png,image/jpeg,image/webp';input.setAttribute('aria-label',label+' file');remove.type='button';remove.textContent='Use default';remove.setAttribute('aria-label','Remove '+label);remove.onclick=()=>edit('graphics',{...theme.graphics,[key]:null});input.onchange=()=>{const file=input.files?.[0];input.value='';if(file)void prepare(async signal=>({...theme,graphics:{...theme.graphics,[key]:await prepareWorkspaceGraphic(file,{signal})}}),'Display graphic ready. Save appearance to keep it.');};info.append(name,input,remove);row.append(img,info);$('playerGraphics').append(row);
 }
 $('playerThemeName').oninput=e=>{if(e.target.value.trim())edit('name',e.target.value);};$('playerThemeName').onblur=()=>{$('playerThemeName').value=theme.name;};
 $('playerReduceMotion').onchange=e=>edit('reduceMotion',e.target.checked);
 $('playerIconWeight').onchange=e=>edit('iconWeight',Number(e.target.value));
 $('playerBackgroundOpacity').oninput=e=>edit('backgroundOpacity',Number(e.target.value)/100);
 $('saveAppearance').onclick=()=>save();$('saveNamedAppearance').onclick=()=>save(true);
 $('restoreAppearance').onclick=()=>{preview(defaultTheme());message('Default preview restored. Save to keep it; named themes are retained.');};
 $('discardAppearance').onclick=()=>{cancelPreparation();saved=loadPlayerAppearance(storage());theme=saved.active;apply();syncControls();renderLibrary();error('');message(saved.notice||'Saved appearance restored.');};
 $('exportPlayerTheme').onclick=()=>{try{const url=URL.createObjectURL(new Blob([encodeTheme(theme)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='ybr-player-theme.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Export includes appearance only. It also imports in Workspace Settings.');}catch(e){error(e.message);}};
 $('importPlayerTheme').onchange=e=>{const file=e.target.files?.[0];e.target.value='';if(file)void prepare(async signal=>{if(file.size>MAX_IMPORT_BYTES)throw Error('Theme file exceeds 1 MiB.');return normalizeImportedGraphics(decodeTheme(await file.text()),{signal});},'Imported as a preview. Review it, then save.');};
 window.addEventListener('storage',e=>{if(e.key!==PLAYER_APPEARANCE_KEY)return;if(dirty()||busy){message('Another Player tab saved an appearance. Your unsaved preview is retained.');return;}saved=loadPlayerAppearance(storage());theme=saved.active;apply();syncControls();renderLibrary();message(saved.notice||'Appearance updated from another Player tab.');});
 function switchTab(next,focus=false){tab=next;for(const id of ['tools','themes','graphics']){const b=$('ps-tab-'+id);b.setAttribute('aria-selected',String(id===tab));b.tabIndex=id===tab?0:-1;$('ps-panel-'+id).hidden=id!==tab;}if(focus)$('ps-tab-'+tab).focus();}
 for(const id of ['tools','themes','graphics']){const b=$('ps-tab-'+id);b.onclick=()=>switchTab(id);b.onkeydown=e=>{const keys=['tools','themes','graphics'];let at=keys.indexOf(id);if(e.key==='ArrowRight')at=(at+1)%3;else if(e.key==='ArrowLeft')at=(at+2)%3;else if(e.key==='Home')at=0;else if(e.key==='End')at=2;else return;e.preventDefault();switchTab(keys[at],true);};}
 function showSettings(open,focus=true){root.hidden=!open;$('libraryPage').hidden=open;$('inspector').hidden=open;document.body.classList.toggle('player-settings-open',open);$('settingsNav').classList.toggle('selected',open);$('libraryNav').classList.toggle('selected',!open);$('playerContext').textContent=open?'Player settings':'Listening room';for(const id of ['settingsNav','settingsShortcut'])$(id).setAttribute('aria-expanded',String(open));if(open){syncPlayback();if(focus){$('playerSettingsTitle').focus({preventScroll:true});root.scrollIntoView({block:'start',behavior:'instant'});}}}
 const navigate=(view,focus=true)=>{showSettings(view==='settings',focus);const hash=view==='settings'?'#settings':'#library';if(location.hash!==hash)history.pushState(null,'',hash);};
 for(const id of ['settingsNav','settingsShortcut'])$(id).onclick=()=>navigate('settings');
 $('settingsBack').onclick=()=>{navigate('library');$('libraryNav').focus({preventScroll:true});$('libraryPage').scrollIntoView({block:'start',behavior:'instant'});};
 $('settingsLibrary').onclick=()=>{$('libraryNav').click();};$('settingsInspect').onclick=()=>{$('inspectorNav').click();};
 for(const id of ['libraryNav','inspectorNav'])$(id).addEventListener('click',()=>navigate('library',false),{capture:true});window.addEventListener('popstate',()=>showSettings(location.hash==='#settings'));window.addEventListener('hashchange',()=>showSettings(location.hash==='#settings'));
 $('settingsWorkspace').href=workspaceUrl(location.protocol);
 $('settingsRefresh').onclick=()=>{window.dispatchEvent(new Event('ybr:refresh-request'));message('Library refresh requested. Only playable tracks are shown.');};
 function syncPlayback(){const continuous=$('continuousPlay');if(continuous)$('settingsContinuous').checked=continuous.getAttribute('aria-pressed')==='true';$('settingsVolume').value=String(Math.round(audio.volume*100));$('settingsVolumeValue').value=Math.round(audio.volume*100)+'%';$('settingsSession').textContent=$('signedInAs').textContent;}
 $('settingsContinuous').onchange=()=>{const b=$('continuousPlay');if(b&&(b.getAttribute('aria-pressed')==='true')!==$('settingsContinuous').checked)b.click();syncPlayback();};
 $('continuousPlay')?.addEventListener('click',syncPlayback);audio.addEventListener('volumechange',syncPlayback);
 $('settingsVolume').oninput=e=>{audio.volume=Number(e.target.value)/100;$('volume').value=e.target.value;syncPlayback();};
 $('settingsTransport').textContent=location.protocol==='https:'?'HTTPS · local TLS':'HTTP · local development';
 $('settingsCheck').onclick=async()=>{const button=$('settingsCheck');button.disabled=true;button.textContent='Checking…';syncPlayback();try{const res=await fetch('/road/api/status',{signal:AbortSignal.timeout(5000),redirect:'error',credentials:'same-origin'});if(!res.ok)throw Error();const data=await res.json();$('settingsNetwork').textContent=data.ready?'Chain '+String(data.chainId)+' · ready':'Not ready / standalone demo';$('settingsFactory').textContent=typeof data.factoryAddress==='string'&&/^0x[\da-f]{40}$/i.test(data.factoryAddress)?data.factoryAddress:'No verified factory';message(data.ready?'Selected-network Player connection is ready.':'The local Player responded. Its blockchain connection is not ready.');}catch{message('Player connection check failed. Check Dev Control. No alternate network was used.');}finally{button.disabled=false;button.textContent='Check Player connection';}};
 // A cosmetic placeholder is explicitly marked, and never competes with authorized cover images.
 const note=document.createElement('small');note.id='appearancePlaceholderNote';note.textContent='Interface placeholder · not NFT artwork';note.className='ps-placeholder-note';$('inspectorCover').after(note);
 function placeholderNote(){const node=$('appearancePlaceholderNote');if(node)node.hidden=!theme.graphics.placeholder||$('inspectorCover').classList.contains('release-has-cover');}
 new MutationObserver(placeholderNote).observe($('inspectorCover'),{attributes:true,attributeFilter:['class']});
 window.addEventListener('ybr:library',syncPlayback);
 apply();syncControls();renderLibrary();syncPlayback();message(saved.notice||'');showSettings(location.hash==='#settings',false);
 document.documentElement.dataset.playerSettings='ready';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
