'use strict';
/** Disposable local Player fixture. No blockchain writes, source media or user credentials. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const {createApp}=require('../apps/ybr-player/server');
const {chromium}=require(process.env.YBR_BROWSER_MODULE||require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const output=path.resolve(__dirname,'../.road-local/player-browser-results');
async function main(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-player-settings-'));let browser,server,page;
 const errors=[],violations=[],writes=[];
 try{
  ({server}=createApp({accounts:{artist:'settings-fixture'},demoAutoLogin:'artist',interactionFile:path.join(tmp,'interactions.ndjson'),studioLibrary:{list:()=>[],get:()=>null},roadGateway:{ready:async()=>({ready:false,chainId:1337}),list:async()=>({status:{ready:false},tracks:[]}),track:async()=>null}}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.YBR_BROWSER_EXECUTABLE?{executablePath:process.env.YBR_BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1480,height:1080}});page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy/.test(m.text()))violations.push(m.text());});
  page.on('request',r=>{if(r.method()==='POST')writes.push(new URL(r.url()).pathname);});
  await page.goto(base);await page.waitForFunction(()=>document.documentElement.dataset.playerSettings==='ready'&&document.getElementById('signedInAs').textContent.includes('artist'));
  assert.equal(await page.locator('.sidebar .brand-grid i').count(),6);assert.match(await page.locator('.sidebar .brand-text').textContent(),/0x🟨 Road/);assert.equal(await page.locator('.breadcrumb').count(),0);
  assert.equal(await page.locator('#audio').evaluate(a=>a.paused&&!a.src),true,'Settings initialization does not autoplay');
  await page.evaluate(()=>{localStorage.setItem('road:appearance:v1','WORKSPACE-KEEP');localStorage.setItem('road:private-recovery','PRIVATE-SENTINEL');window.originalAudio=document.getElementById('audio');});
  await page.locator('[data-brick-id="BRK-AUD-001"] .track-action').click();await page.waitForFunction(()=>!document.getElementById('audio').paused);
  const src=await page.locator('#audio').getAttribute('src');
  await page.locator('#settingsNav').click();await page.getByRole('heading',{name:'Set the tone.'}).waitFor();
  assert.equal(await page.locator('#audio').evaluate(a=>a===window.originalAudio&&!a.paused),true);
  await page.getByRole('tab',{name:'Colors & themes'}).click();await page.getByRole('button',{name:'Neon Road',exact:true}).click();
  await page.getByLabel('Primary accent hex',{exact:true}).fill('#00ccff');await page.getByLabel('Player theme name',{exact:true}).fill('Artist Night');
  assert.equal(await page.locator('#audio').getAttribute('src'),src);assert.equal(await page.locator('#audio').evaluate(a=>a.paused),false,'Editing appearance preserves playback');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(9, 8, 22)');
  await page.getByRole('button',{name:'Save named theme',exact:true}).click();
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ybr:player:appearance:v1')));
  assert.equal((await stored()).themes.length,1);assert.equal((await stored()).active.colors.accent,'#00ccff');
  await page.locator('#playPause').click();
  await page.getByRole('tab',{name:'Icons & graphics'}).click();await page.getByLabel('Library icon',{exact:true}).selectOption('disc');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=128;c.height=128;const x=c.getContext('2d');x.fillStyle='#edcb80';x.fillRect(0,0,128,128);x.fillStyle='#102029';for(let i=0;i<3;i++)for(let j=0;j<2;j++)x.fillRect(17+i*33,33+j*33,28,28);return c.toDataURL('image/png').split(',')[1];});
  for(const label of ['Player logo','Ambient background','Missing-artwork placeholder']){await page.getByLabel(label+' file',{exact:true}).setInputFiles({name:'synthetic-display.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.getByAltText(label,{exact:true}).waitFor();}
  await page.locator('.sidebar .brand-graphic img').waitFor();assert.match(await page.evaluate(()=>getComputedStyle(document.querySelector('.app-shell'),'::before').backgroundImage),/^url\(/);
  await page.getByRole('button',{name:'Save appearance',exact:true}).click();
  fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'player-settings-graphics-desktop.png'),fullPage:true});
  await page.getByRole('tab',{name:'Colors & themes'}).click();await page.getByLabel('Reduce Player animation',{exact:true}).check();await page.getByRole('button',{name:'Save appearance',exact:true}).click();
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.playerSettings==='ready');assert.equal(await page.locator('#audio').evaluate(a=>a.paused&&!a.src),true);
  await page.getByRole('tab',{name:'Colors & themes'}).click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.playerMotion),'reduced');assert.equal((await stored()).active.icons.player,'disc');
  await page.locator('.sidebar .brand-graphic img').waitFor();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export theme',exact:true}).click();const exported=await download,text=fs.readFileSync(await exported.path(),'utf8');assert.doesNotMatch(text,/PRIVATE-SENTINEL|WORKSPACE-KEEP|privateKey|mnemonic/);
  const shared=await import(pathToFileURL(path.resolve(__dirname,'../web/src/appearance.js')).href);assert.equal(shared.decodeTheme(text).name,'Artist Night','Player exports validate in the workspace');
  const before=(await stored()).active,bad=JSON.parse(text);bad.theme.graphics.logo='https://example.invalid/tracker.png';
  await page.getByLabel('Import Player theme JSON',{exact:true}).setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await page.getByRole('alert').filter({hasText:'Graphics must be'}).waitFor();assert.deepEqual((await stored()).active,before);
  const incoming=shared.decodeTheme(text);incoming.name='Imported workspace theme';incoming.colors.accent='#f2c85d';
  await page.getByLabel('Import Player theme JSON',{exact:true}).setInputFiles({name:'workspace.json',mimeType:'application/json',buffer:Buffer.from(shared.encodeTheme(incoming))});await page.waitForFunction(()=>document.getElementById('playerThemeName').value==='Imported workspace theme');assert.deepEqual((await stored()).active,before,'Import previews without overwriting saved appearance');
  await page.getByRole('button',{name:'Discard preview',exact:true}).click();await page.getByLabel('Primary accent hex',{exact:true}).fill('#11aadd');await page.getByRole('button',{name:'Delete Player theme Artist Night',exact:true}).click();assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--road-accent').trim()),'#11aadd');assert.deepEqual((await stored()).active,before);
  await page.getByRole('button',{name:'Discard preview',exact:true}).click();await page.getByRole('button',{name:'Save named theme',exact:true}).click();
  await page.screenshot({path:path.join(output,'player-settings-themes-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Paper Studio',exact:true}).click();assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.sidebar')).backgroundColor),'rgb(234, 229, 216)');
  await page.screenshot({path:path.join(output,'player-settings-paper-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Back to music',exact:false}).click();assert.equal(await page.locator('#libraryPage').isVisible(),true);await page.screenshot({path:path.join(output,'player-library-paper-desktop.png'),fullPage:true});
  await page.locator('#settingsShortcut').click();await page.getByRole('tab',{name:'Playback & tools'}).click();await page.getByLabel('Continuous play in settings',{exact:true}).uncheck();assert.equal(await page.locator('#continuousPlay').getAttribute('aria-pressed'),'false');
  await page.getByLabel('Session volume',{exact:true}).evaluate(el=>{el.value='42';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await page.locator('#audio').evaluate(a=>a.volume),.42);
  await page.getByRole('button',{name:'Check Player connection',exact:true}).click();await page.locator('#appearanceMessage').filter({hasText:'local Player responded'}).waitFor();
  assert.equal(await page.locator('#settingsWorkspace').getAttribute('href'),'http://127.0.0.1:5173/');
  await page.getByRole('tab',{name:'Colors & themes'}).click();await page.getByRole('button',{name:'Discard preview',exact:true}).click();
  // Another Player tab may update saved state, but cannot wipe an in-progress preview.
  const other=await context.newPage();await other.goto(base+'/#settings');await other.waitForFunction(()=>document.documentElement.dataset.playerSettings==='ready');await other.getByRole('tab',{name:'Colors & themes'}).click();
  await page.getByLabel('Primary accent hex',{exact:true}).fill('#1122cc');await other.getByRole('button',{name:'Evergreen',exact:true}).click();await other.getByRole('button',{name:'Save appearance',exact:true}).click();await page.locator('#appearanceMessage').filter({hasText:'unsaved preview is retained'}).waitFor();assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--road-accent').trim()),'#1122cc');await other.close();
  await page.getByRole('button',{name:'Discard preview',exact:true}).click();assert.equal(await page.getByLabel('Player theme name',{exact:true}).inputValue(),'Evergreen');
  await page.getByRole('button',{name:'Neon Road',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'player-settings-mobile.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile horizontal overflow');
  await page.getByRole('button',{name:'Back to music',exact:false}).click();await page.locator('#settingsShortcut').click();assert.equal(await page.locator('#playerSettings').isVisible(),true,'Mobile settings shortcut remains reachable');
  await page.getByRole('tab',{name:'Icons & graphics'}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.evaluate(()=>localStorage.getItem('road:appearance:v1')),'WORKSPACE-KEEP');assert.equal(await page.evaluate(()=>localStorage.getItem('road:private-recovery')),'PRIVATE-SENTINEL');
  assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);assert.ok(writes.every(route=>['/api/session/demo','/api/bricks/BRK-AUD-001/authorize','/api/interactions'].includes(route)),writes.join(','));
  console.log('PLAYER SETTINGS PASS: shared theme format, exact app identity, local save/reload/import/graphics, two-tab conflict handling, mobile layouts and uninterrupted authorized playback; no rights or network writes.');
 }catch(e){if(page){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'player-settings-failure.png'),fullPage:true}).catch(()=>{});console.error('Browser errors:',errors,'CSP:',violations);}throw e;}
 finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}fs.rmSync(tmp,{recursive:true,force:true});}
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
