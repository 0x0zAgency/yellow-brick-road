/** Persistence check: look up a prior smoke CID after Kubo container restart. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const receipt=JSON.parse(await readFile('.road-local/ipfs-smoke-receipt.json','utf8'));
const base='http://127.0.0.1:5001/api/v0/';
async function rpc(path){
 const res=await fetch(base+path,{method:'POST'});
 if(!res.ok)throw Error('Kubo RPC failed after restart: '+res.status);
 return res;
}
const pins=await (await rpc('pin/ls?arg='+encodeURIComponent(receipt.cid))).json();
assert.ok(pins.Keys?.[receipt.cid],'Persistent pin disappeared after container restart');
const payload=Buffer.from(await (await rpc('cat?arg='+encodeURIComponent(receipt.cid))).arrayBuffer());
assert.equal(payload.length,receipt.size);
assert.equal(createHash('sha256').update(payload).digest('hex'),receipt.sha256);
console.log(JSON.stringify({status:'pinned-after-restart',cid:receipt.cid,bytes:payload.length}));
