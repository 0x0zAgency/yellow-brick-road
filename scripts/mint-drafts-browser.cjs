'use strict';
/** Two browser wallets, authenticated inbox and real signatures on a disposable chain. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),stem='mint-drafts-'+process.pid;
const html=path.join(web,stem+'.html'),jsx=path.join(web,'src',stem+'.jsx'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-drafts-'));
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
    const result=req.url==='/road/rpc'?{jsonrpc:'2.0',id:body.id,result:await reader.transport.request(body)}:await service.dispatch({method:req.method,path:req.url.slice('/api/licensing'.length),body,origin:'http://127.0.0.1:5301',authorization:req.headers.authorization?.replace('Bearer ',''),csrfToken:req.headers['x-ybr-csrf']});
    res.setHeader('Content-Type','application/json');res.end(json(result));
   }catch(error){res.statusCode=error.status||400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.shortMessage||error.message}));}
  });}}],server:{host:'127.0.0.1',port:5301,strictPort:true},logLevel:'error'});await vite.listen();
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
   await page.goto('http://127.0.0.1:5301/'+stem+'.html');return page;
  }

  const creator=await pageFor(owner),sender=await pageFor(buyer);
  async function login(page){await page.getByRole('button',{name:'Notifications',exact:true}).click();await page.getByRole('button',{name:'Sign in to requests'}).click();await page.getByText('You’re all caught up.').waitFor();await page.getByRole('button',{name:'Close notifications'}).click();}
  await login(creator);await login(sender);
  await sender.evaluate(({factoryAddress,rpcUrl})=>{
   localStorage.setItem('road:mint:network:v1',JSON.stringify({version:1,data:{network:'ganache',rpcUrl,ganacheChainId:'1337',rememberForm:true,useStartupFactory:false,factories:{['ganache:1337:'+rpcUrl]:factoryAddress}}}));
  },{factoryAddress,rpcUrl});
  await sender.getByRole('button',{name:'Start a new mint',exact:true}).click();
  await sender.getByRole('button',{name:'Continue →',exact:true}).click();
  // A valid tiny WAV. All bytes must survive save, navigation and a full reload.
  const wav=Buffer.alloc(204);wav.write('RIFF');wav.writeUInt32LE(196,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(160,40);
  await sender.getByLabel('Choose Master recording',{exact:true}).setInputFiles({name:'Midnight EP.wav',mimeType:'audio/wav',buffer:wav});
  await sender.getByText('✓ Ready',{exact:true}).waitFor();
  await sender.locator('.mint-workbench-toolbar').getByRole('button',{name:'Save & pause'}).click();
  await sender.getByRole('article',{name:'Midnight EP'}).waitFor();
  let records=await sender.evaluate(async wallet=>{const {listMintDrafts}=await import('/src/mint-drafts.js');return listMintDrafts(wallet);},buyer.address);
  assert.equal(records.length,1);const draftId=records[0].id;
  // Raw original is stored locally before encryption.
  assert.equal(await sender.evaluate(async({wallet,id})=>{const {loadMintDraft}=await import('/src/mint-drafts.js');const row=await loadMintDraft(wallet,id);return row.files.originals.master.size;},{wallet:buyer.address,id:draftId}),wav.length);
  await sender.getByRole('button',{name:'Resume Brick'}).click();
  await sender.getByRole('button',{name:'Encrypt & Continue →'}).click();
  await sender.getByLabel('Track title',{exact:true}).fill('Midnight EP');
  await sender.getByLabel('Recording artist / claimant',{exact:true}).fill('Test artist');
  await sender.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).fill('Test writer');
  await sender.getByText('Reference existing Bricks',{exact:true}).click();
  await sender.getByRole('button',{name:'+ Add existing Brick reference',exact:true}).click();
  await sender.getByLabel('Existing Brick contract address',{exact:true}).fill(brick);
  await sender.getByLabel('Its YellowBrickFactory contract address',{exact:true}).fill(factoryAddress);
  await sender.getByRole('button',{name:'Verify Brick & prepare approval request',exact:true}).click();
  await sender.getByRole('button',{name:'Send to controller inbox',exact:true}).click();
  await sender.getByRole('button',{name:'Request sent to inbox',exact:true}).waitFor();
  await sender.locator('.mint-workbench-toolbar').getByRole('button',{name:'Save & pause'}).click();
  const pending=sender.getByRole('article',{name:'Midnight EP'});await pending.getByText('Waiting for approval',{exact:true}).waitFor();
  const readDraft=()=>sender.evaluate(async({wallet,id})=>{const {loadMintDraft}=await import('/src/mint-drafts.js');const row=await loadMintDraft(wallet,id);const {openDemoDownload}=await import('/src/demo-vault.js');const decrypted=await openDemoDownload({entry:row.files.vault.encrypted.get('master'),secret:row.files.vault.secret,authorized:true});return {size:decrypted.bytes.length,text:row.state.form.meta.title,links:row.state.linkedBricks,genesisHash:row.state.genesisHash};},{wallet:buyer.address,id:draftId});
  const stored=await readDraft();assert.equal(stored.size,wav.length);assert.equal(stored.genesisHash,profile.genesisHash);assert.equal(stored.links.length,1);
  const baseline=await sender.evaluate(()=>window.walletSigns);
  await sender.reload();await sender.getByRole('button',{name:'My Bricks',exact:true}).click();
  await sender.getByRole('article',{name:'Midnight EP'}).getByText('Waiting for approval',{exact:true}).waitFor();
  assert.equal((await readDraft()).size,wav.length,'Encrypted sources and key survive reload');
  await login(sender);
  await creator.getByRole('button',{name:'Notifications, 1 waiting request',exact:true}).click();
  await creator.getByRole('region',{name:'Waiting requests'}).getByRole('button',{name:/Midnight EP/}).click();
  await creator.getByRole('dialog',{name:'Approve this use?'}).getByRole('button',{name:'Approve with my wallet'}).click();
  await sender.getByRole('article',{name:'Midnight EP'}).getByText('Ready to resume',{exact:true}).waitFor();
  const output=path.join(root,'.road-local/player-browser-results');fs.mkdirSync(output,{recursive:true});
  await sender.screenshot({path:path.join(output,'drafts-ready-desktop.png'),fullPage:false});
  await sender.getByRole('article',{name:'Midnight EP'}).getByRole('button',{name:'Resume Brick'}).click();
  assert.equal(await sender.getByLabel('Track title',{exact:true}).inputValue(),'Midnight EP');
  await sender.getByText('Reference existing Bricks',{exact:true}).click();
  assert.ok(await sender.getByLabel('Signed approval response JSON').inputValue());
  assert.equal((await readDraft()).size,wav.length);
  // Starting a new mint preserves the earlier work and clears the new form/files.
  await sender.locator('.mint-workbench-toolbar').getByRole('button',{name:'Start a new mint'}).click();
  await sender.getByRole('heading',{name:'01. Identify the creator.'}).waitFor();
  await sender.getByRole('button',{name:'Continue →',exact:true}).click();
  assert.equal(await sender.getByText('Midnight EP.wav',{exact:true}).count(),0);
  await sender.getByLabel('Choose Master recording',{exact:true}).setInputFiles({name:'Second work.wav',mimeType:'audio/wav',buffer:wav});
  await sender.getByText('✓ Ready',{exact:true}).waitFor();
  // Ordinary navigation preserves the active form and autosaves without pressing Pause.
  await sender.getByRole('button',{name:'My Bricks',exact:true}).click();
  await sender.getByRole('article',{name:'Second work'}).waitFor();
  await sender.evaluate(address=>window.switchWallet(address),stranger.address);
  await sender.getByText('No unfinished Bricks for this wallet on this device.').waitFor();
  assert.equal(await sender.getByRole('article',{name:'Midnight EP'}).count(),0);
  await sender.evaluate(address=>window.switchWallet(address),buyer.address);
  await sender.getByRole('article',{name:'Midnight EP'}).waitFor();
  await sender.setViewportSize({width:390,height:844});await sender.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);
  await sender.evaluate(()=>document.querySelector('.mint-drafts').scrollIntoView({behavior:'instant'}));
  await sender.screenshot({path:path.join(output,'drafts-mobile.png'),fullPage:false});
  assert.ok(await sender.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile workbench has no horizontal overflow');
  // IndexedDB transactions protect wallet ownership and preserve responses against delayed form saves.
  await sender.evaluate(async({wallet,id,other})=>{
   const {loadMintDraft,saveMintDraft,removeMintDraft,listMintDrafts,mergeDraftReferences}=await import('/src/mint-drafts.js');
   const row=await loadMintDraft(wallet,id),original=row.state.linkedBricks[0];
   let blocked=false;try{await loadMintDraft(other,id);}catch{blocked=true;}if(!blocked)throw Error('Cross-wallet read allowed');
   blocked=false;try{await removeMintDraft(other,id);}catch{blocked=true;}if(!blocked)throw Error('Cross-wallet removal allowed');
   const stale={...row.state,linkedBricks:[{...original,response:null,requestStatus:'pending'}]};
   await saveMintDraft({wallet,id,state:stale,files:row.files});if(!(await loadMintDraft(wallet,id)).state.linkedBricks[0].response)throw Error('Lost delivered response');
   await mergeDraftReferences({wallet,chainId:1337,genesisHash:'0x'+'0'.repeat(64),records:[{request:original.request,status:'declined'}]});
   if(!(await loadMintDraft(wallet,id)).state.linkedBricks[0].response)throw Error('Mixed chain histories');
  },{wallet:buyer.address,id:draftId,other:stranger.address});
  assert.deepEqual(errors,[]);console.log('MINT DRAFTS PASS: raw and encrypted local files, reload, waiting/approved state, real two-wallet approval, resume, new mint preservation, navigation autosave, wallet/history isolation, write-race protection and mobile layout.');
 }finally{await browser?.close();await vite?.close();await server.close();fs.rmSync(html,{force:true});fs.rmSync(jsx,{force:true});fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
