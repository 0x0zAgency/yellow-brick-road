'use strict';
/** Real CSS animation, measured progress and reduced-motion regression. No wallet or chain. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
// /road is reserved for the Player proxy in the workspace dev server.
const ROOT=path.resolve(__dirname,'..'),stem='loading-progress-'+process.pid;
const html=path.join(ROOT,'web',stem+'.html'),jsx=path.join(ROOT,'web/src',stem+'.jsx');
async function main(){
 if(!process.env.CI)throw Error('Run this view fixture only in disposable CI.');
 fs.writeFileSync(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/src/'+stem+'.jsx"></script></body></html>',{flag:'wx'});
 fs.writeFileSync(jsx,`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import './styles.css';import './mint-demo.css';import RoadProgress from './RoadProgress.jsx';
function Fixture(){const [value,setValue]=useState(40),[active,setActive]=useState(true);window.progressValue=setValue;window.progressActive=setActive;
 return <main style={{maxWidth:980,margin:'40px auto',padding:24}}><span className="eyebrow">YELLOW BRICK ROAD / IN PROGRESS</span><h1 style={{margin:'16px 0 28px'}}>Good things are being built.</h1>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,300px),1fr))',gap:24}}>
 <section className="ms-demo-dialog" style={{width:'100%'}}><b>0x🟨 ROAD</b><h2>Preparing your Bricks…</h2>{active&&<RoadProgress label="Waiting for wallet confirmation…"/>}<small>Your wallet controls confirmation.</small></section>
 <section className="panel"><h2>Encrypting your files</h2><RoadProgress label="Encrypting files locally…" value={value}/><p className="muted">Measured completion, one file at a time.</p><h3>Compact</h3><RoadProgress label="Finding your Bricks…" size="compact"/><h3>Thumbnail</h3><RoadProgress label="Reading NFT cover…" size="tiny" hideLabel/></section>
 </div></main>;
}createRoot(document.getElementById('root')).render(<Fixture/>);
`,{flag:'wx'});
 const out=path.join(ROOT,'.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});
 let browser,page;const errors=[];try{
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1200,height:800},reducedMotion:'no-preference'});
  page.on('pageerror',e=>{errors.push(e.message);console.error('Fixture page error:',e.message);});
  await page.goto('http://127.0.0.1:5173/'+stem+'.html');
  const waiting=page.getByRole('progressbar',{name:'Waiting for wallet confirmation…',exact:true}),measured=page.getByRole('progressbar',{name:'Encrypting files locally…',exact:true});
  await waiting.waitFor();assert.equal(await waiting.getAttribute('aria-valuenow'),null,'Unknown wallet waits must not invent a percentage');
  await page.waitForFunction(()=>document.querySelector('.road-progress-brick').getAnimations().length>0);
  const phase=async time=>page.evaluate(async time=>{const animations=document.getAnimations();await Promise.all(animations.map(a=>a.ready));for(const a of animations){a.pause();a.currentTime=time;}},time);
  await phase(900);const early=await waiting.locator('.road-progress-brick').evaluateAll(nodes=>nodes.map(n=>Number(getComputedStyle(n).opacity)));
  assert.ok(early[0]>.9&&early.at(-1)===0,'Bricks build progressively from the start of the road');
  await page.screenshot({path:path.join(out,'road-progress-building.png')});
  await phase(1800);const later=await waiting.locator('.road-progress-brick').evaluateAll(nodes=>nodes.map(n=>Number(getComputedStyle(n).opacity)));
  assert.ok(later.at(-1)>.9,'Later animation frames lay the remaining bricks');
  await page.screenshot({path:path.join(out,'road-progress-desktop.png')});
  for(const [value,expected,built] of [[0,'0',0],[40,'40',6],[100,'100',17],[-10,'0',0],[150,'100',17]]){
   await page.evaluate(value=>window.progressValue(value),value);await page.waitForFunction(expected=>document.querySelector('[aria-label="Encrypting files locally…"]').getAttribute('aria-valuenow')===expected,expected);
   assert.equal(await measured.locator('.is-built').count(),built);
  }
  await page.evaluate(()=>window.progressValue(NaN));await page.waitForFunction(()=>!document.querySelector('[aria-label="Encrypting files locally…"]').hasAttribute('aria-valuenow'));
  await page.evaluate(()=>window.progressValue(40));await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await waiting.locator('.road-progress-brick').first().evaluate(n=>getComputedStyle(n).animationName),'none');
  assert.equal(await measured.getAttribute('aria-valuenow'),'40');
  await page.screenshot({path:path.join(out,'road-progress-reduced-motion.png')});
  await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>document.documentElement.dataset.roadMotion='reduced');
  assert.equal(await waiting.locator('.road-progress-brick').first().evaluate(n=>getComputedStyle(n).animationName),'none','The app motion preference also disables the animation');
  await page.evaluate(()=>delete document.documentElement.dataset.roadMotion);await page.setViewportSize({width:390,height:844});await phase(900);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Loader must fit on mobile');
  await page.screenshot({path:path.join(out,'road-progress-mobile.png'),fullPage:true});
  await page.evaluate(()=>window.progressActive(false));await waiting.waitFor({state:'detached'});assert.deepEqual(errors,[]);
  console.log('ROAD PROGRESS PASS: staggered brick animation, honest measured/unknown states, compact variants, motion preferences, mobile bounds and unmount.');
 }catch(error){if(page){await page.screenshot({path:path.join(out,'road-progress-failure.png'),fullPage:true}).catch(()=>{});console.error('Fixture page:',await page.locator('body').innerText().catch(()=>''));}throw error;}
 finally{await browser?.close();fs.rmSync(html,{force:true});fs.rmSync(jsx,{force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
