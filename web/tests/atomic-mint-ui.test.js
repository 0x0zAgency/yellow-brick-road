import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {formatMintReceiptForCopy} from '../src/mint-receipt-copy.js';
const read=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
test('Workspace and Building editor use Buildings while retaining existing local drafts',()=>{
 const app=read('App.jsx');assert.match(app,/\['buildings','Buildings',Layers3\]/);
 assert.ok(!app.includes("'Structures'"));assert.ok(!app.includes('New structure'));assert.ok(!app.includes('Structure name'));
 assert.ok(app.includes('road:structures:v1'),'Retain the legacy storage key, do not lose drafts.');
});
test('mint confirmation describes the single transaction and no post-mint initial-artwork prompt',()=>{
 const ui=read('MintStudioDemo.jsx');assert.ok(ui.includes('Confirm one transaction for the new Bricks'));
 assert.ok(!ui.includes('one additional cover transaction'));assert.ok(ui.includes('Request mint transaction'));
 assert.ok(read('NftCoverReview.jsx').includes('same transaction as the Bricks'));
});
test('copyable receipt gas is clearly the shared batch total rather than a per-Brick charge',()=>{
 const text=formatMintReceiptForCopy({gasScope:'batch',gasUsed:'123456',transactionHash:'one-shared-tx'},{atomic:true});
 assert.match(text,/Gas used \(entire shared batch, not per Brick\): 123456/);
 assert.match(formatMintReceiptForCopy({gasUsed:'10'}),/Gas used: 10/);
});
