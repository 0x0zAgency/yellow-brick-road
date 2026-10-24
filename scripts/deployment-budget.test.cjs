'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {deploymentBudget,formatEther,parseEther,TX_GAS_CAP}=require('./deployment-budget.cjs');
const values={estimatedGas:'1000000',blockGasLimit:'30000000',baseFeePerGas:'1000000000',maxFeePerGas:'3000000000',maxPriorityFeePerGas:'1000000000',balance:'1000000000000000000',budgetWei:'50000000000000000'};
test('EIP-1559 quote separates expected gas cost from a signed maximum with exact integer arithmetic',()=>{
 const q=deploymentBudget(values);assert.equal(q.gasLimit,'1200000');assert.equal(q.estimatedWei,'2000000000000000');assert.equal(q.maximumWei,'3600000000000000');assert.equal(q.remainingWei,'996400000000000000');assert.equal(formatEther(q.maximumWei),'0.0036');assert.equal(parseEther('0.0036'),3600000000000000n);
});
test('budget, balance, unusable fees and EIP-7825 cap cannot be silently increased',()=>{
 assert.throws(()=>deploymentBudget({...values,budgetWei:1}),/ceiling/);
 assert.throws(()=>deploymentBudget({...values,balance:1}),/test ETH/);
 assert.throws(()=>deploymentBudget({...values,maxFeePerGas:1}),/quote/);
 assert.throws(()=>deploymentBudget({...values,estimatedGas:TX_GAS_CAP.toString(),blockGasLimit:'60000000'}),/EIP-7825/);
 assert.throws(()=>deploymentBudget({...values,estimatedGas:-1}),/Invalid/);
 assert.throws(()=>parseEther('0.1e2'));assert.throws(()=>parseEther('NaN'));assert.throws(()=>parseEther('-1'));
});
