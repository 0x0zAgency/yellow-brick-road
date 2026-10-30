import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {licensingPlugin} from '../scripts/licensing/plugin.js';

async function request({method='POST',headers={},body='{}',url='/api/licensing/challenge'}={}){
 let handler;licensingPlugin('/unused-profile').configureServer({middlewares:{use:fn=>{handler=fn;}}});
 const req=Readable.from([Buffer.from(body)]);Object.assign(req,{method,url,headers:{host:'127.0.0.1:5173',origin:'http://127.0.0.1:5173','content-type':'application/json',...headers},socket:{encrypted:false}});
 let result;const res={setHeader(){},statusCode:200,end(value){result={status:this.statusCode,body:JSON.parse(value)};}};
 await handler(req,res,()=>{result={next:true};});return result;
}
test('licensing HTTP rejects foreign origins, DNS rebinding, non-JSON and oversized bodies before loading a wallet',async()=>{
 assert.equal((await request({headers:{origin:'https://attacker.example'}})).status,403);
 assert.equal((await request({headers:{host:'attacker.example',origin:'http://attacker.example'}})).status,403);
 assert.equal((await request({headers:{origin:undefined}})).status,403);
 assert.equal((await request({headers:{'sec-fetch-site':'cross-site'}})).status,403);
 assert.equal((await request({headers:{'content-type':'text/plain'}})).status,415);
 assert.equal((await request({body:'x'.repeat(65537)})).status,413);
 assert.equal((await request({body:'{' })).status,400);
 assert.equal((await request({body:'[]'})).status,400);
 assert.equal((await request({method:'DELETE'})).status,405);
 assert.deepEqual(await request({url:'/ordinary-page'}),{next:true});
});

test('Vite configure hooks register middleware without returning the Connect app as a post hook',()=>{
 const plugin=licensingPlugin('/unused-profile'),server={middlewares:{use:()=>function connect(){}}};
 assert.equal(plugin.configureServer(server),undefined);assert.equal(plugin.configurePreviewServer(server),undefined);
});
