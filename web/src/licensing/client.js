import {createPublicClient,createWalletClient,custom,http,defineChain,encodeFunctionData,zeroAddress} from 'viem';
import {ACTIVE_NETWORK,activeRpcUrl} from '../active-network.js';
import {licensingAbi,tokenAbi,typedOffer,offerArgs,offerId,json,sameAddress,normalizeEnvelope} from './protocol.js';
import {verifyNetwork,readLicensingState} from './reader.js';

export function createLicensingClient({provider=globalThis.ethereum,fetcher=globalThis.fetch,client:injectedClient}={}){
 let profile,session,account,client,wallet;
 async function api(path,{method='GET',body}={}){
  const response=await fetcher('/api/licensing'+path,{method,headers:{...(method==='POST'?{'Content-Type':'application/json','X-YBR-CSRF':profile?.csrf}:{}),...(session?{Authorization:'Bearer '+session}:{})},...(body?{body:json(body)}:{})});
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Licensing request failed.'),{status:response.status});return data;
 }
 async function initialize(){
  profile=await api('/config');
  if(ACTIVE_NETWORK&&(profile.chainId!==ACTIVE_NETWORK.chainId||!sameAddress(profile.factoryAddress,ACTIVE_NETWORK.factoryAddress)||!sameAddress(profile.genesisHash,ACTIVE_NETWORK.genesisHash)))throw Error('The inbox and workspace use different deployments. Restart Dev Control.');
  const chain=defineChain({id:profile.chainId,name:'IP licensing',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[]}}});
  client=injectedClient||createPublicClient({chain,transport:http(activeRpcUrl(),{retryCount:0})});
  if(provider)wallet=createWalletClient({chain,transport:custom(provider,{retryCount:0})});
  await verifyNetwork(client,profile);return profile;
 }
 async function guard(){
  if(!provider||!account)throw Error('Connect your wallet to the licensing workspace.');
  await verifyNetwork(client,profile);
  if(Number(await provider.request({method:'eth_chainId'}))!==profile.chainId)throw Error('Switch your wallet to the active licensing network.');
  const accounts=await provider.request({method:'eth_accounts'});
  if(!sameAddress(accounts[0],account))throw Error('Wallet changed. Reconnect the licensing workspace.');
  const head=await client.getBlock(),walletHead=await provider.request({method:'eth_getBlockByNumber',params:['0x'+head.number.toString(16),false]});
  if(!sameAddress(head.hash,walletHead?.hash))throw Error('Wallet and app are reading different chain histories.');
 }
 async function connect(){
  if(!provider)throw Error('Install or open an Ethereum wallet to continue.');
  const accounts=await provider.request({method:'eth_requestAccounts'});account=accounts[0];session=null;await guard();return account;
 }
 async function login(){
  await guard();const challenge=await api('/challenge',{method:'POST',body:{address:account}});
  const signature=await wallet.signMessage({account,message:challenge.message});await guard();
  const response=await api('/session',{method:'POST',body:{nonce:challenge.nonce,signature}});session=response.token;return response;
 }
 function checkEnvelope(envelope){
  const e=normalizeEnvelope(envelope);
  if(e.chainId!==profile.chainId||!sameAddress(e.factory,profile.factoryAddress)||!sameAddress(e.genesisHash,profile.genesisHash)||!sameAddress(e.offer.deployment,profile.walletAddress))throw Error('This offer belongs to another deployment.');
 }
 async function sign(envelope){
  checkEnvelope(envelope);
  await guard();const state=await readLicensingState(client,profile,envelope.brick);
  if(!sameAddress(state.controller,envelope.offer.controller)||!sameAddress(state.salt,envelope.salt)||state.epoch!==BigInt(envelope.offer.epoch))throw Error('Brick ownership or payout terms changed. Refresh the offer.');
  const signature=await wallet.signTypedData({account,...typedOffer(envelope)});await guard();return signature;
 }
 async function transact(brick,functionName,args=[],value=0n,{abi=licensingAbi}={}){
  await guard();const call={address:brick,abi,functionName,args,account,value};
  const {request}=await client.simulateContract(call),estimate=await client.estimateContractGas(call);request.gas=estimate+estimate/5n;
  await guard();const hash=await wallet.writeContract(request);
  const receipt=await client.waitForTransactionReceipt({hash,confirmations:1,timeout:120000});
  if(receipt.status!=='success')throw Error('Transaction reverted: '+receipt.transactionHash);
  const tx=await client.getTransaction({hash:receipt.transactionHash});
  if(!sameAddress(tx.from,account)||!sameAddress(tx.to,brick)||tx.value!==value||tx.input.toLowerCase()!==encodeFunctionData({abi,functionName,args}).toLowerCase())throw Error('The wallet replaced this transaction with another operation. Refresh before retrying.');
  await guard();return receipt.transactionHash;
 }
 async function accept(record){
  const e=record.envelope;checkEnvelope(e);const o=offerArgs(e);await guard();
  if(!sameAddress(account,o.licensee))throw Error('Only the licensee in this offer can pay and accept.');
  const state=await readLicensingState(client,profile,e.brick);
  if(!sameAddress(e.salt,state.salt)||!sameAddress(o.controller,state.controller)||o.epoch!==state.epoch)throw Error('The Brick changed. Request a new offer.');
  const amount=o.unitPrice*o.units;
  if(!sameAddress(o.asset,zeroAddress)&&amount>0n){
   const allowance=await client.readContract({address:o.asset,abi:tokenAbi,functionName:'allowance',args:[account,e.brick]});
   if(allowance<amount){
    // Reset existing allowances for tokens which require zero before a new value.
    if(allowance>0n)await transact(o.asset,'approve',[e.brick,0n],0n,{abi:tokenAbi});
    await transact(o.asset,'approve',[e.brick,amount],0n,{abi:tokenAbi});
   }
  }
  const transactionHash=await transact(e.brick,'acceptProjectLicense',[o,record.controllerSignature||'0x'],sameAddress(o.asset,zeroAddress)?amount:0n);
  const grant=await client.readContract({address:e.brick,abi:licensingAbi,functionName:'projectLicense',args:[offerId(e)]});
  if(!sameAddress(grant.licensee,account)||grant.paid!==amount)throw Error('License confirmation did not match the offer. Refresh before retrying.');
  return transactionHash;
 }
 async function funds(brick,asset){
  await verifyNetwork(client,profile);
  const read=(functionName,args)=>client.readContract({address:brick,abi:licensingAbi,functionName,args});
  const [balance,allocated,claimable]=await Promise.all([sameAddress(asset,zeroAddress)?client.getBalance({address:brick}):client.readContract({address:asset,abi:tokenAbi,functionName:'balanceOf',args:[brick]}),read('totalLicenseClaimable',[asset]),account?read('licenseClaimable',[asset,account]):0n]);
  return {balance,allocated,claimable};
 }
 return {initialize,api,connect,login,sign,transact,accept,funds,get account(){return account;},disconnect(){session=null;account=null;}};
}
