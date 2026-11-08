'use strict';
/** Two browser wallets, authenticated inbox and real signatures on a disposable chain. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),stem='request-notifications-'+process.pid;
const html=path.join(web,stem+'.html'),jsx=path.join(web,'src',stem+'.jsx'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-notifications-'));
async function main(){
 const ganache=require('ganache'),server=ganache.server({logging:{quiet:true},chain:{chainId:1337},wallet:{deterministic:true}});
 let vite,browser;const errors=[];
 try{
  await server.listen(0,'127.0.0.1');const rpcUrl='http://127.0.0.1:'+server.address().port;
  const {createPublicClient,createWalletClient,http,parseEventLogs,parseAbi}=await import(require.resolve('viem',{paths:[web]})),{privateKeyToAccount}=await import(require.resolve('viem/accounts',{paths:[web]}));
  const load=file=>import(pathToFileURL(path.join(web,file))),{textHash,json,makeEnvelope}=await load('src/licensing/protocol.js'),{localConfig}=await load('src/chain-mint.js');
  const accounts=Object.values(server.provider.getInitialAccounts()).slice(0,3).map(a=>privateKeyToAccount(a.secretKey)),[owner,buyer,stranger]=accounts;
  const chain=localConfig(rpcUrl,1337),reader=createPublicClient({chain,transport:http(rpcUrl)}),signer=createWalletClient({account:owner,chain,transport:http(rpcUrl)});
  const artifact=JSON.parse(fs.readFileSync(path.join(root,'artifacts/contracts/YellowBrickFactory.sol/YellowBrickFactory.json')));
  const factoryAddress=(await reader.waitForTransactionReceipt({hash:await signer.deployContract({abi:artifact.abi,bytecode:artifact.bytecode})})).contractAddress;
  const call={address:factoryAddress,abi:artifact.abi,functionName:'deployBrick',args:[textHash('cover'),'ipfs://cover',textHash('salt')],account:owner},gas=await reader.estimateContractGas(call);
  const minted=await reader.waitForTransactionReceipt({hash:await signer.writeContract({...call,gas:gas+gas/5n})}),brick=parseEventLogs({abi:artifact.abi,logs:minted.logs,eventName:'BrickDeployed'})[0].args.brick;
  const profile={chainId:1337,factoryAddress,genesisHash:(await reader.getBlock({blockNumber:0n})).hash};
  const {createLicensingService}=await load('scripts/licensing/service.js'),service=await createLicensingService({root:temp,profile,client:reader});
  const {newLinkRequest}=await load('src/brick-authorization.js'),request=newLinkRequest({chainId:1337,requester:buyer.address,sourceCommitment:textHash('track'),targetBrick:brick,targetIpId:await reader.readContract({address:brick,abi:parseAbi(['function ipId() view returns (bytes32)']),functionName:'ipId'}),factory:factoryAddress,relation:'cover-art',scope:'Cover artwork for the new album only.',deadline:Math.floor(Date.now()/1000)+3600});
  fs.writeFileSync(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/src/'+stem+'.jsx"></script></body></html>',{flag:'wx'});
  fs.writeFileSync(jsx,`import React from 'react';import {createRoot} from 'react-dom/client';import App from './App.jsx';import 'bootstrap/dist/css/bootstrap.min.css';import './styles.css';createRoot(document.getElementById('root')).render(<App/>);`,{flag:'wx'});
  const {createServer}=await import(require.resolve('vite',{paths:[web]})),{default:react}=await import(require.resolve('@vitejs/plugin-react',{paths:[web]}));
  vite=await createServer({root:web,cacheDir:path.join(temp,'vite-cache'),configFile:false,envFile:false,plugins:[react(),{name:'test-inbox',configureServer(server){server.middlewares.use(async(req,res,next)=>{
   if(!req.url.startsWith('/api/licensing')&&req.url!=='/road/rpc')return next();
   try{let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
    const result=req.url==='/road/rpc'?{jsonrpc:'2.0',id:body.id,result:await reader.transport.request(body)}:await service.dispatch({method:req.method,path:req.url.slice('/api/licensing'.length),body,origin:'http://127.0.0.1:5299',authorization:req.headers.authorization?.replace('Bearer ',''),csrfToken:req.headers['x-ybr-csrf']});
    res.setHeader('Content-Type','application/json');res.end(json(result));
   }catch(error){res.statusCode=error.status||400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.shortMessage||error.message}));}
  });}}],server:{host:'127.0.0.1',port:5299,strictPort:true},logLevel:'error'});await vite.listen();
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  async function pageFor(account){
   const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.exposeFunction('testWalletRpc',async({address,method,params=[]})=>{
    const a=accounts.find(a=>a.address.toLowerCase()===address.toLowerCase());
    if(['eth_accounts','eth_requestAccounts'].includes(method))return a?[a.address]:[];
    if(method==='personal_sign')return a.signMessage({message:{raw:params[0]}});
    if(method==='eth_signTypedData_v4')return a.signTypedData(typeof params[1]==='string'?JSON.parse(params[1]):params[1]);
    return server.provider.request({method,params});
   });
   await page.addInitScript(address=>{
    let current=address;const handlers=new Map();window.walletSigns=0;
    window.ethereum={request:args=>{if(/sign/i.test(args.method))window.walletSigns++;return window.testWalletRpc({address:current,...args});},on:(name,fn)=>{if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(fn);},removeListener:(name,fn)=>handlers.get(name)?.delete(fn)};
    window.switchWallet=address=>{current=address;handlers.get('accountsChanged')?.forEach(fn=>fn(address?[address]:[]));};
   },account.address);
   await page.goto('http://127.0.0.1:5299/'+stem+'.html');return page;
  }
  const creator=await pageFor(owner),sender=await pageFor(buyer);
  await creator.getByRole('button',{name:'Notifications',exact:true}).click();await creator.getByRole('button',{name:'Sign in to requests'}).click();await creator.getByText('You’re all caught up.').waitFor();await creator.getByRole('button',{name:'Close notifications'}).click();
  const baseline=await creator.evaluate(()=>window.walletSigns);
  await creator.evaluate(address=>window.switchWallet(address),owner.address);
  await sender.getByRole('button',{name:'Notifications',exact:true}).click();await sender.getByRole('button',{name:'Sign in to requests'}).click();await sender.getByText('You’re all caught up.').waitFor();
  const send=async req=>sender.evaluate(async request=>{const {workspaceInbox}=await import('/src/request-inbox.js');return workspaceInbox().api('/references',{method:'POST',body:{request,workTitle:'Midnight EP',brickTitle:'Moonlit artwork'}});},req);
  const record=await send(request);
  const bell=creator.getByRole('button',{name:'Notifications, 1 waiting request',exact:true});await bell.waitFor();await creator.getByRole('tooltip').waitFor();
  assert.equal(await creator.evaluate(()=>window.walletSigns),baseline,'Live arrival never signs');
  assert.ok(await bell.evaluate(el=>{const b=el.getBoundingClientRect(),badge=el.querySelector('.request-count').getBoundingClientRect();return badge.top<b.top&&badge.right>b.right;}));
  assert.equal(await creator.locator('.request-bell svg').evaluate(el=>getComputedStyle(el).animationName),'request-bell-ring');
  const output=path.join(root,'.road-local/player-browser-results');fs.mkdirSync(output,{recursive:true});await creator.screenshot({path:path.join(output,'notifications-live-desktop.png'),fullPage:false});
  await creator.getByRole('button',{name:'Review requests',exact:true}).click();await creator.getByRole('region',{name:'Waiting requests'}).getByRole('button',{name:/Midnight EP/}).click();
  const modal=creator.getByRole('dialog',{name:'Approve this use?'});await modal.waitFor();await modal.getByRole('button',{name:'Not now'}).click();await bell.waitFor();assert.equal(await creator.evaluate(()=>window.walletSigns),baseline);
  await bell.click();await creator.getByRole('region',{name:'Waiting requests'}).getByRole('button',{name:/Midnight EP/}).click();await modal.getByRole('button',{name:'Approve with my wallet'}).click();await modal.waitFor({state:'hidden'});
  await creator.getByRole('button',{name:'Notifications',exact:true}).waitFor();assert.equal(await creator.evaluate(()=>window.walletSigns),baseline+1);
  const response=await sender.evaluate(async id=>{const {workspaceInbox}=await import('/src/request-inbox.js');return (await workspaceInbox().api('/inbox')).references.find(r=>r.id===id).response;},record.id);
  const {verifyLinkResponse}=await load('src/brick-authorization.js');await verifyLinkResponse(reader,request,response);
  const second=await send({...request,nonce:textHash('second')});await bell.waitFor();await creator.getByRole('tooltip').waitFor();await creator.getByRole('button',{name:'Dismiss notification tooltip'}).click();
  await creator.waitForTimeout(5500);assert.equal(await creator.getByRole('tooltip').count(),0,'Polling does not repeat the same arrival alert');
  await creator.setViewportSize({width:390,height:844});await creator.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);await creator.evaluate(()=>window.scrollTo({left:0,top:0,behavior:'instant'}));await bell.click();
  assert.ok(await creator.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'App header and page fit mobile');await creator.screenshot({path:path.join(output,'notifications-inbox-mobile.png'),fullPage:false});
  assert.ok(await creator.locator('.request-inbox-panel').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth+1;}));
  await creator.keyboard.press('Escape');assert.equal(await bell.evaluate(el=>el===document.activeElement),true);
  await creator.emulateMedia({reducedMotion:'reduce'});await send({...request,nonce:textHash('third')});await creator.getByRole('button',{name:'Notifications, 2 waiting requests',exact:true}).waitFor();assert.equal(await creator.locator('.request-bell svg').evaluate(el=>getComputedStyle(el).animationName),'none');
  await sender.evaluate(async brick=>{const {workspaceInbox}=await import('/src/request-inbox.js'),{makeEnvelope,textHash}=await import('/src/licensing/protocol.js');const inbox=workspaceInbox(),state=await inbox.api('/state?brick='+brick),now=Math.floor(Date.now()/1000),envelope=makeEnvelope({profile:inbox.profile,state,licensee:inbox.account,project:{title:'Film placement',description:'One publishing placement'},terms:'One credited placement in the film.',unitPrice:0,units:1,expiresAt:now+3600,deadline:now+1800,scope:2,nonce:textHash('film offer')});await inbox.api('/offers',{method:'POST',body:{envelope,signature:await inbox.sign(envelope)}});},brick);
  await creator.getByRole('button',{name:'Notifications, 3 waiting requests',exact:true}).click();await creator.getByRole('region',{name:'Waiting requests'}).getByRole('button',{name:/Film placement/}).click();
  const licenseReview=creator.getByRole('dialog',{name:'Review license request'});await licenseReview.waitFor();await licenseReview.getByRole('button',{name:'Approve terms',exact:true}).click();await licenseReview.waitFor({state:'hidden'});await creator.getByRole('button',{name:'Notifications, 2 waiting requests',exact:true}).waitFor();
  await sender.getByRole('button',{name:'Notifications, 1 waiting request',exact:true}).waitFor();await sender.getByRole('region',{name:'Waiting requests'}).getByRole('button',{name:/Film placement/}).click();
  await sender.getByRole('dialog',{name:'Review license request'}).getByRole('button',{name:'Review & accept license'}).click();await sender.getByRole('dialog',{name:'Review license payment'}).waitFor();await sender.getByRole('button',{name:'Cancel',exact:true}).click();
  await creator.evaluate(address=>window.switchWallet(address),stranger.address);await creator.getByRole('button',{name:'Notifications',exact:true}).waitFor();assert.equal(await creator.getByRole('tooltip').count(),0);
  await creator.getByRole('button',{name:'Notifications',exact:true}).click();await creator.getByRole('button',{name:'Sign in to requests'}).click();await creator.getByText('You’re all caught up.').waitFor();
  await creator.evaluate(()=>window.switchWallet(''));await creator.getByRole('button',{name:'Notifications',exact:true}).click();await creator.getByText('Connect your wallet to view its requests.').waitFor();
  assert.deepEqual(errors,[]);console.log('NOTIFICATIONS PASS: authenticated two-wallet delivery, real controller signature, returned response, license approval and payment review, live count/tooltip, no automatic signatures, dismissal keeps pending, no repeated alerts, wallet isolation, reduced motion and mobile layout.');
 }finally{await browser?.close();await vite?.close();await server.close();fs.rmSync(html,{force:true});fs.rmSync(jsx,{force:true});fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
