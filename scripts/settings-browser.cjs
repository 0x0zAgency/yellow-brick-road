'use strict';
/** Real workspace, local synthetic graphics, no wallet writes or deployment. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const root=path.resolve(__dirname,'..'),out=path.join(root,'.road-local/player-browser-results');
async function main(){
 if(!process.env.CI)throw Error('This browser regression is CI only.');
 const browser=await chromium.launch({headless:true});let page;
 try{
  page=await browser.newPage({viewport:{width:1480,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.settingsWalletWrites=0;
   window.ethereum={request:async({method})=>{if(method==='eth_accounts')return [];if(method==='eth_chainId')return '0x539';window.settingsWalletWrites++;throw Error('Appearance must not ask for signing.');}};
  });
  await page.goto('http://127.0.0.1:5173/');
  const openSettings=async()=>{
   const button=page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Settings',exact:true});
   if(await page.evaluate(()=>innerWidth<1000))await page.getByRole('button',{name:'Open navigation',exact:true}).click();
   const tools=page.getByRole('button',{name:'Tools',exact:true});if(await tools.getAttribute('aria-expanded')==='false')await tools.click();
   await button.click();await page.getByRole('region',{name:'Workspace settings'}).waitFor();
  };
  await openSettings();await page.evaluate(()=>{localStorage.setItem('road:keep-recovery-sentinel','PRIVATE-SENTINEL');});
  await page.getByRole('tab',{name:'Colors & themes'}).click();
  await page.getByRole('button',{name:'Neon Road',exact:true}).click();
  await page.getByLabel('Primary accent hex',{exact:true}).fill('#00ccff');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--road-accent').trim()),'#00ccff');
  assert.equal(await page.evaluate(()=>localStorage.getItem('road:appearance:v1')),null,'Preview must not save before consent');
  await page.getByLabel('Theme name',{exact:true}).fill('Test Artist Night');await page.getByRole('button',{name:'Save named theme',exact:true}).click();
  const capture=async name=>{await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(out,name),fullPage:true});};
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('road:appearance:v1')));
  assert.equal((await stored()).themes.length,1);assert.equal((await stored()).active.colors.accent,'#00ccff');
  await page.getByRole('tab',{name:'Icons & graphics'}).click();await page.getByLabel('Mint Studio icon',{exact:true}).selectOption('disc');
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#f1d265';ctx.fillRect(0,0,64,64);ctx.fillStyle='#151b22';ctx.fillRect(10,18,44,28);return canvas.toDataURL('image/png').split(',')[1];});
  await page.getByLabel('Workspace logo file',{exact:true}).setInputFiles({name:'synthetic-logo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.locator('.brand .workspace-logo').waitFor();
  for(const label of ['Ambient background','Missing-artwork placeholder']){
   await page.getByLabel(label+' file',{exact:true}).setInputFiles({name:'synthetic-display.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   await page.getByAltText(label,{exact:true}).waitFor();
  }
  assert.match(await page.evaluate(()=>getComputedStyle(document.querySelector('.shell'),'::before').backgroundImage),/^url\(/);
  await page.getByLabel('Reduce workspace animation',{exact:false}).check();await page.getByRole('button',{name:'Save appearance',exact:true}).click();
  assert.equal((await stored()).active.icons.mint,'disc');assert.match((await stored()).active.graphics.logo,/^data:image\/png;base64,/);assert.equal((await stored()).active.reduceMotion,true);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.roadMotion),'reduced');
  await page.reload();await openSettings();assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--road-accent').trim()),'#00ccff');await page.locator('.brand .workspace-logo').waitFor();
  await page.getByRole('tab',{name:'Colors & themes'}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export theme',exact:true}).click();const exported=await download;const text=fs.readFileSync(await exported.path(),'utf8');assert.doesNotMatch(text,/PRIVATE-SENTINEL|privateKey|mnemonic/);assert.equal(JSON.parse(text).theme.name,'Test Artist Night');
  const before=(await stored()).active;
  const bad=JSON.parse(text);bad.theme.graphics.logo='https://example.invalid/tracker.png';
  await page.getByLabel('Import theme JSON',{exact:true}).setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
  await page.getByRole('alert').filter({hasText:'Graphics must be'}).waitFor();assert.deepEqual((await stored()).active,before);
  const imported=JSON.parse(text);imported.theme.name='Imported visual preview';
  await page.getByLabel('Import theme JSON',{exact:true}).setInputFiles({name:'theme.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
  await page.waitForFunction(()=>document.querySelector('[aria-label="Theme name"]')?.value==='Imported visual preview');
  assert.deepEqual((await stored()).active,before,'Valid import is a preview until explicitly saved');
  await page.getByRole('button',{name:'Discard preview',exact:true}).click();
  await page.getByLabel('Primary accent hex',{exact:true}).fill('#11aadd');
  await page.getByRole('button',{name:'Delete saved theme Test Artist Night',exact:true}).click();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--road-accent').trim()),'#11aadd','Deleting a saved theme preserves unsaved edits');
  assert.deepEqual((await stored()).active,before);assert.equal((await stored()).themes.length,0);
  await page.getByRole('button',{name:'Discard preview',exact:true}).click();await page.getByRole('button',{name:'Save named theme',exact:true}).click();
  await page.getByRole('button',{name:'Paper Studio',exact:true}).click();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.sidebar')).backgroundColor),'rgb(234, 229, 216)','Build-time palette must reach actual workspace CSS');
  fs.mkdirSync(out,{recursive:true});await capture('settings-paper-desktop.png');
  await page.getByRole('button',{name:'Restore default preview',exact:true}).click();assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.sidebar')).backgroundColor),'rgb(19, 24, 32)');
  await page.getByRole('button',{name:'Discard preview',exact:true}).click();assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--road-accent').trim()),'#00ccff');
  await capture('settings-themes-desktop.png');
  await page.getByRole('tab',{name:'Icons & graphics'}).click();await page.getByLabel('Workspace logo file',{exact:true}).setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg onload="alert(1)"/>')});
  await page.getByRole('alert').waitFor();assert.deepEqual((await stored()).active,before,'SVG must not change saved state');
  await page.getByRole('button',{name:'Discard preview',exact:true}).click();
  await capture('settings-graphics-desktop.png');
  await page.setViewportSize({width:390,height:844});await page.getByRole('tab',{name:'Colors & themes'}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No mobile horizontal overflow');await capture('settings-mobile.png');
  await page.getByRole('tab',{name:'Tools & status'}).click();await page.getByRole('button',{name:/^Mint Studio Register/}).click();await page.getByRole('heading',{name:'01. Identify the creator.',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('road:keep-recovery-sentinel')),'PRIVATE-SENTINEL');assert.equal(await page.evaluate(()=>window.settingsWalletWrites),0);assert.deepEqual(errors,[]);
  console.log('SETTINGS PASS: actual desktop/mobile workspace, CSS variables, presets, save/reload, safe PNG logo, installed icons, reduced motion, export/import rejection, reset/discard, common tools, no wallet writes or unrelated-storage deletion.');
 }catch(error){if(page){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'settings-failure.png'),fullPage:true}).catch(()=>{});}throw error;}
 finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
