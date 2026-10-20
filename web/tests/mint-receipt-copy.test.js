import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMintReceiptForCopy} from '../src/mint-receipt-copy.js';

test('Copy All includes wallet import details and the full on-chain receipt for one Brick',()=>{
 const input={role:'Sound recording / master',title:'Example',status:'verified',
  nftContractAddress:'0x'+'a'.repeat(40),tokenId:'123456789012345678901234567890',
  contractAddress:'0x'+'b'.repeat(40),id:'0x'+'c'.repeat(64),
  transactionHash:'0x'+'d'.repeat(64),blockNumber:'14',gasUsed:'582233',chainId:11155111,
  metadataJson:'PRIVATE WORK TITLE AND RIGHTS',nonce:'SECRET NONCE',uri:'private://metadata'};
 const text=formatMintReceiptForCopy(input,{simulated:false,status:'confirmed',chainId:11155111,
  factoryAddress:'0x'+'e'.repeat(40)});
 for(const expected of ['Sound recording / master','Example','verified','NFT contract address (wallet import)',
  input.nftContractAddress,'Token ID (decimal, wallet import)',input.tokenId,
  input.contractAddress,input.id,input.transactionHash,'Block number: 14','Gas used: 582233',
  'Chain ID: 11155111','YellowBrickFactory:','https://sepolia.etherscan.io/tx/'+input.transactionHash]){
  assert.ok(text.includes(expected),'Missing copy field: '+expected);
 }
 assert.ok(!text.includes(input.metadataJson),'Do not expose private metadata content');
 assert.ok(!text.includes(input.nonce),'Do not expose nonce/internal state');
 assert.ok(!text.includes(input.uri),'Do not expose private metadata URIs');
 assert.equal((text.match(/NFT contract address \(wallet import\)/g)||[]).length,1);
 assert.ok(text.split('\n').length>=10,'Use human-readable multi-line output');
});

test('different IP categories copy their own data, never the preceding card',()=>{
 const first={role:'Choreography',id:'0x'+'1'.repeat(64),contractAddress:'0x'+'a'.repeat(40),status:'verified'};
 const next={role:'Photography',id:'0x'+'2'.repeat(64),contractAddress:'0x'+'b'.repeat(40),status:'verified'};
 const a=formatMintReceiptForCopy(first,{chainId:1337});
 const b=formatMintReceiptForCopy(next,{chainId:1337});
 assert.ok(a.includes('Choreography')&&!a.includes('Photography'));
 assert.ok(b.includes('Photography')&&!b.includes('Choreography'));
 assert.ok(!a.includes(next.contractAddress));
 assert.ok(!b.includes(first.contractAddress));
});

test('simulation and legacy contracts never masquerade as importable NFTs',()=>{
 const simulated=formatMintReceiptForCopy({role:'Writing',id:'DEMO-BRICK-123'}, {simulated:true});
 assert.ok(simulated.includes('NFT import: Not available (simulated mint)'));
 assert.ok(!simulated.includes('Token ID (decimal'));
 const legacy=formatMintReceiptForCopy({role:'Movement',contractAddress:'0x'+'f'.repeat(40),chainId:1337},{simulated:false});
 assert.ok(legacy.includes('NFT import: Not available for this Brick'));
 assert.ok(!legacy.includes('Token ID (decimal'));
});

test('pending incomplete transactions are clearly marked and do not invent blocks or token IDs',()=>{
 const pending=formatMintReceiptForCopy({role:'Visual artwork',status:'pending',transactionHash:'0x'+'b'.repeat(64)},{status:'incomplete',chainId:1337});
 assert.ok(pending.includes('Status: pending'));
 assert.ok(pending.includes('Transaction hash:'));
 assert.ok(!pending.includes('Block number'));
 assert.ok(!pending.includes('Token ID (decimal'));
});
