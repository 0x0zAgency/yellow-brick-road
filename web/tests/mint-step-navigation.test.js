import test from 'node:test';
import assert from 'node:assert/strict';
import {createMintStepNavigator} from '../src/mint-step-navigation.js';

function fixture(){
 const calls=[];
 const heading={setAttribute:(...args)=>calls.push(['attribute',...args]),focus:options=>calls.push(['focus',options])};
 const panel={closest:()=>null,querySelector:selector=>{assert.equal(selector,'h2');return heading;},scrollIntoView:options=>calls.push(['scroll',options])};
 return {panel,heading,calls};
}
test('mount and unchanged steps do not steal focus or reset scrolling',()=>{
 const {panel,calls}=fixture(),navigate=createMintStepNavigator(0);
 assert.equal(navigate({step:0,panel}),false);
 assert.equal(navigate({step:0,panel,blocked:true}),false);
 assert.equal(navigate({step:0,panel}),false);
 assert.deepEqual(calls,[]);
});
test('new steps instantly reveal the panel and focus its heading without another scroll',()=>{
 const {panel,calls}=fixture(),navigate=createMintStepNavigator(0);
 assert.equal(navigate({step:1,panel}),true);
 assert.deepEqual(calls,[['attribute','tabindex','-1'],['scroll',{behavior:'instant',block:'start',inline:'nearest'}],['focus',{preventScroll:true}]]);
});
test('Next, Back, edit-rights and reset each reveal their destination once',()=>{
 const {panel,calls}=fixture(),navigate=createMintStepNavigator(0);
 for(const step of [1,2,3,2,3,4,0]){
  assert.equal(navigate({step,panel}),true);
  assert.equal(navigate({step,panel}),false);
 }
 assert.equal(calls.filter(([type])=>type==='scroll').length,7);
});
test('waiting and completion dialogs defer results until dismissed',()=>{
 const {panel,calls}=fixture(),navigate=createMintStepNavigator(3);
 assert.equal(navigate({step:3,panel,blocked:true}),false);
 assert.equal(navigate({step:4,panel,blocked:true}),false);
 assert.equal(navigate({step:4,panel,blocked:true}),false);
 assert.deepEqual(calls,[]);
 assert.equal(navigate({step:4,panel}),true);
 assert.equal(navigate({step:4,panel}),false);
});
test('canceling confirmation or a failed mint on the same step preserves position',()=>{
 const {panel,calls}=fixture(),navigate=createMintStepNavigator(3);
 navigate({step:3,panel,blocked:true});navigate({step:3,panel});
 assert.deepEqual(calls,[]);
});
test('inert panels are not focused and do not consume pending navigation',()=>{
 const {panel,calls}=fixture(),navigate=createMintStepNavigator(2);
 panel.closest=selector=>{assert.equal(selector,'[inert]');return {};};
 assert.equal(navigate({step:3,panel}),false);assert.deepEqual(calls,[]);
 panel.closest=()=>null;
 assert.equal(navigate({step:3,panel}),true);
});
test('missing panels or headings leave the navigation pending',()=>{
 const {panel,heading,calls}=fixture(),navigate=createMintStepNavigator(3);
 assert.equal(navigate({step:4,panel:null}),false);
 panel.querySelector=()=>null;
 assert.equal(navigate({step:4,panel}),false);assert.deepEqual(calls,[]);
 panel.querySelector=()=>heading;
 assert.equal(navigate({step:4,panel}),true);
});
test('the current heading is resolved again, including nested Mint Results',()=>{
 const {panel,calls}=fixture(),navigate=createMintStepNavigator(2);
 navigate({step:3,panel});calls.length=0;
 const resultHeading={setAttribute:()=>{},focus:options=>calls.push(['results-focus',options])};
 panel.querySelector=()=>resultHeading;
 navigate({step:4,panel});
 assert.equal(calls.at(-1)[0],'results-focus');
});
