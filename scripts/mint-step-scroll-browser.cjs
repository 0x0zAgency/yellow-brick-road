'use strict';
/** Actual React wizard, synthetic local files, no wallet or network transactions.
 * Run from the existing Mint Studio setup suite against its running Vite server.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),BASE='http://127.0.0.1:5173';
async function testMintStepScroll(browser){
 const stem='mint-scroll-browser-'+process.pid;
 const html=path.join(ROOT,'web',stem+'.html'),jsx=path.join(ROOT,'web/src',stem+'.jsx');
 fs.writeFileSync(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="scroll-root"></div><script type="module" src="/src/'+stem+'.jsx"></script></body></html>',{flag:'wx'});
 fs.writeFileSync(jsx,`
import React,{StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import MintStudioDemo from './MintStudioDemo.jsx';
import './styles.css';
const nested=new URLSearchParams(location.search).has('nested');
createRoot(document.getElementById('scroll-root')).render(<StrictMode>
 <div style={{height:200}}>Scroll regression fixture</div>
 <div id="scroll-host" style={nested?{height:'75vh',overflow:'auto',scrollBehavior:'smooth'}:{}}>
  <MintStudioDemo wallet={null}/>
 </div>
 <div style={{height:600}}/>
</StrictMode>);
`,{flag:'wx'});
 let context,page;
 try{
  for(const config of [
   {name:'desktop',viewport:{width:1440,height:900}},
   {name:'mobile',viewport:{width:390,height:844}},
   {name:'nested',viewport:{width:1100,height:900},nested:true}
  ]){
   context=await browser.newContext({viewport:config.viewport,reducedMotion:'reduce'});
   page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    window.mintStepScrolls=0;
    const original=Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView=function(options){
     if(this.classList?.contains('ms-panel'))window.mintStepScrolls++;
     return original.call(this,options);
    };
   });
   await page.goto(BASE+'/'+stem+'.html'+(config.nested?'?nested':''));
   // Instant navigation must win even when the surrounding application requests smooth scrolling.
   await page.addStyleTag({content:'html {scroll-behavior:smooth !important} #scroll-host {scroll-behavior:smooth !important}'});
   const count=()=>page.evaluate(()=>window.mintStepScrolls);
   const check=async(number,previous)=>{
    await page.waitForFunction(number=>{
     const panel=document.querySelector('.ms-panel'),heading=panel?.querySelector('h2');
     return heading?.textContent.startsWith(String(number).padStart(2,'0')+'.')&&document.activeElement===heading;
    },number);
    const geometry=await page.evaluate(()=>{
     const panel=document.querySelector('.ms-panel'),heading=panel.querySelector('h2'),rect=heading.getBoundingClientRect();
     return {top:rect.top,bottom:rect.bottom,height:innerHeight,tabIndex:heading.tabIndex};
    });
    assert.equal(await count(),previous+1,config.name+': exactly one scroll per transition');
    assert.ok(geometry.top>=0&&geometry.top<140&&geometry.bottom<geometry.height,config.name+': new heading starts near the top '+JSON.stringify(geometry));
    assert.equal(geometry.tabIndex,-1,'Heading is focused without adding a tab stop');
   };
   const move=async(label,number)=>{
    const previous=await count();
    const button=page.getByRole('button',{name:label,exact:true});
    await button.scrollIntoViewIfNeeded();await button.click();await check(number,previous);
   };
   assert.equal(await count(),0,'Initial mount must not steal focus');
   await move('Continue →',2);
   const unchanged=await count();
   await page.getByRole('button',{name:'Encrypt & Continue →',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'Attach a primary work file'}).waitFor();
   assert.equal(await count(),unchanged,'A validation error is not a step transition');
   await page.getByLabel('Choose Master recording',{exact:true}).setInputFiles({name:'scroll-fixture.txt',mimeType:'text/plain',buffer:Buffer.from('Original synthetic scroll regression fixture.')});
   await page.waitForFunction(()=>!document.body.innerText.includes('Hashing…'));
   assert.equal(await count(),unchanged,'Hashing and metadata extraction do not reset scrolling');
   await move('Encrypt & Continue →',3);
   await page.getByLabel('Track title',{exact:true}).fill('Scroll regression');
   await page.getByLabel('Recording artist / claimant',{exact:true}).fill('Scroll Artist');
   await page.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).fill('Scroll Artist');
   const beforeEdit=await count(),notes=page.getByRole('textbox',{name:/^Notes(?:\s|$)/});
   await notes.fill('Typing stays where the creator is working.');
   assert.equal(await notes.evaluate(node=>node===document.activeElement),true);
   assert.equal(await count(),beforeEdit,'Typing does not steal focus or scroll');
   await move('Continue →',4);
   await move('← Back',3);
   assert.equal(await page.getByLabel('Track title',{exact:true}).inputValue(),'Scroll regression');
   await move('Continue →',4);
   await move('Edit permissions in Step 3',3);
   await move('← Back',2);
   await move('Encrypt & Continue →',3);
   await move('Continue →',4);
   const beforeDialog=await count();
   await page.getByRole('button',{name:'Simulate mint →',exact:true}).click();
   await page.getByRole('button',{name:'Cancel',exact:true}).click();
   assert.equal(await count(),beforeDialog,'Cancel preserves the current review position');
   await page.getByRole('button',{name:'Simulate mint →',exact:true}).click();
   await page.getByRole('button',{name:'Confirm simulation',exact:true}).click();
   await page.getByRole('button',{name:'View receipts →',exact:true}).waitFor({timeout:30000});
   assert.equal(await count(),beforeDialog,'Results must not scroll or focus behind the completion dialog');
   assert.equal(await page.locator('.ms-panel h2').first().evaluate(node=>node===document.activeElement),false);
   await move('View receipts →',5);
   await move('Start another work',1);
   assert.deepEqual(errors,[],config.name+': no browser exceptions');
   await context.close();context=null;page=null;
  }
  console.log('MINT SCROLL PASS: desktop/mobile/nested Next, Back, edit-rights, encryption, results after dialog, reset; no jumps during typing, hashing, validation or cancellation. StrictMode, instant scroll and heading focus.');
 }catch(error){
  if(page){
   const out=path.join(ROOT,'.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});
   await page.screenshot({path:path.join(out,'mint-scroll-failure.png'),fullPage:true}).catch(()=>{});
  }
  throw error;
 }finally{
  if(context)await context.close();
  fs.rmSync(html,{force:true});fs.rmSync(jsx,{force:true});
 }
}
module.exports={testMintStepScroll};
