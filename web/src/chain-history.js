/** Read-only local-chain identity check. Never changes wallet networks or sends
 * transactions. Numbered wallet reads can outlive a disposable Ganache chain.
 * A recovery requires BOTH the RPC block by hash AND a fresh canonical wallet
 * head. Merely finding an old/common block by hash is not sufficient.
 */
const HASH=/^0x[0-9a-f]{64}$/i;
const QUANTITY=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const hash=value=>typeof value==='string'&&HASH.test(value)&&!/^0x0{64}$/i.test(value);
const number=value=>typeof value==='string'&&QUANTITY.test(value)?BigInt(value):null;
const mined=block=>block&&hash(block.hash)&&number(block.number)!==null;
const equal=(a,b)=>mined(a)&&mined(b)&&a.hash.toLowerCase()===b.hash.toLowerCase()&&number(a.number)===number(b.number);
const tag=height=>'0x'+height.toString(16);
const brief=value=>hash(value)?value.slice(0,14)+'...':'unavailable';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function bounded(request,method,params,timeoutMs){
 let timer;
 try{
  return await Promise.race([
   Promise.resolve().then(()=>request({method,params})),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Chain read timed out.')),timeoutMs);})
  ]);
 }finally{clearTimeout(timer);}
}
function problem(details,unavailable=false){
 const where=details.rpcOrigin||'the configured local RPC';
 const evidence=details.blockNumber===undefined?'':
  ' Block '+details.blockNumber+': RPC '+brief(details.rpcHash)+', wallet numbered read '+brief(details.walletHash)+'.';
 const message=(unavailable?'Unable to verify wallet and RPC blockchain histories.':'Wallet and RPC point to different blockchain histories, or the wallet is still serving stale chain data.')+
  evidence+' Expected '+where+' (chain '+details.chainId+'). Check that MetaMask\'s selected network uses the same RPC URL as Mint Studio, not another Ganache instance.'+
  ' Clearing nonce data does not refresh this block-history check. No additional transaction was requested; review any earlier batch receipts before retrying.';
 return Object.assign(Error(message),{code:unavailable?'YBR_CHAIN_HISTORY_UNAVAILABLE':'YBR_CHAIN_HISTORY_MISMATCH',details});
}

export async function verifyLocalChainHistory({client,provider,rpcUrl,chainId,timeoutMs=5000,retryDelayMs=150}){
 const rpc=args=>client.request(args);
 const wallet=args=>provider.request(args);
 const read=(request,method,params)=>bounded(request,method,params,timeoutMs);
 let rpcOrigin;
 try{rpcOrigin=new URL(rpcUrl).origin;}catch{/* No credentials or arbitrary upstream error text in diagnostics. */}
 let details={rpcOrigin,chainId},unavailable=false;
 for(let attempt=0;attempt<2;attempt++){
  unavailable=false;
  try{
   const reference=await read(rpc,'eth_getBlockByNumber',['latest',false]);
   if(!mined(reference)){unavailable=true;throw Error('RPC did not return a mined head.');}
   const height=number(reference.number);
   const numbered=await read(wallet,'eth_getBlockByNumber',[tag(height),false]);
   details={rpcOrigin,chainId,blockNumber:height.toString(),rpcHash:reference.hash,walletHash:mined(numbered)?numbered.hash:null};
   if(equal(reference,numbered))return {mode:'numbered',blockNumber:height.toString(),blockHash:reference.hash};

   // MetaMask's block-cache middleware excludes the standard `pending` tag.
   // Do not use an undocumented skipCache flag or mutate the wallet to recover.
   const [byHash,pending]=await Promise.all([
    read(wallet,'eth_getBlockByHash',[reference.hash,false]),
    read(wallet,'eth_getBlockByNumber',['pending',false])
   ]);
   if(!equal(reference,byHash)){
    details.reason='wallet-missing-rpc-block';
   }else{
    let anchor=null;
    if(mined(pending))anchor=pending; // Ganache aliases pending to its mined head.
    else if(pending&&pending.hash===null&&hash(pending.parentHash)){
     // Other clients return an unmined block. Verify its mined parent instead.
     const parent=await read(rpc,'eth_getBlockByHash',[pending.parentHash,false]);
     if(mined(parent)&&parent.hash.toLowerCase()===pending.parentHash.toLowerCase()&&
        (pending.number===null||number(pending.number)===number(parent.number)+1n))anchor=parent;
    }
    if(!anchor||number(anchor.number)<height){
     details.reason='wallet-fresh-head-unavailable-or-behind';
    }else{
     const canonical=await read(rpc,'eth_getBlockByNumber',[tag(number(anchor.number)),false]);
     // A shared historical/orphan block must not authorize a different fork.
     if(!equal(anchor,canonical))details.reason='wallet-fresh-head-not-canonical-on-rpc';
     else{
      const rechecked=await read(rpc,'eth_getBlockByNumber',[tag(height),false]);
      if(equal(reference,rechecked))return {mode:'fresh-head',blockNumber:height.toString(),blockHash:reference.hash};
      details.reason='rpc-history-changed-during-check';
     }
    }
   }
  }catch{
   unavailable=true;
   details={...details,reason:'chain-read-unavailable'};
  }
  if(attempt===0)await pause(retryDelayMs);
 }
 throw problem(details,unavailable);
}
