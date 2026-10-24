'use strict';
/** Read-only preparation, explicit fee-capped deployment, then profile activation.
 * No Ganache key derivation, automatic remote music mint, or blind transaction retry.
 */
const fs=require('node:fs'),path=require('node:path');
const {ADDRESS,HASH,readRecord,writeRecord,safeDirectory,checkedRpc,checkedProfile,rpcLabel}=require('./dev-network-profile.cjs');
const {deploymentBudget,parseEther,formatEther}=require('./deployment-budget.cjs');
const CHAIN=11155111,QUOTE_MS=90000;
const FACTORY_ABI=['function implementation() view returns (address)','function receiptToken() view returns (address)','function contentPolicyVersion() view returns (uint256)'];
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
async function request(fn,label){try{return await fn();}catch{throw Error(label+' failed. Check the selected Sepolia RPC and wallet. No automatic deployment retry was made.');}}
async function chainIdentity(provider){
 const id=Number(await request(()=>provider.send('eth_chainId',[]),'Chain check'));
 if(id!==CHAIN)throw Error('The RPC is not Sepolia (11155111). Refusing deployment and activation.');
 const genesis=await request(()=>provider.getBlock(0),'Chain-history check');
 if(!HASH.test(genesis?.hash||''))throw Error('Cannot verify Sepolia chain history.');
 return genesis.hash;
}
async function verifyDeployment(provider,address,ethers){
 if(!ADDRESS.test(address||'')||/^0x0{40}$/i.test(address))throw Error('Enter a valid factory address, or leave it empty for a new deployment.');
 const factory=new ethers.Contract(address,FACTORY_ABI,provider);
 const [code,implementation,receiptToken,version]=await request(()=>Promise.all([provider.getCode(address),factory.implementation(),factory.receiptToken(),factory.contentPolicyVersion()]),'Factory verification');
 if(!code||code==='0x'||!ADDRESS.test(implementation)||!ADDRESS.test(receiptToken)||Number(version)!==1)throw Error('The selected factory is not policy-compatible. No replacement was deployed.');
 const receipt=new ethers.Contract(receiptToken,['function factory() view returns (address)'],provider);
 const [implCode,receiptCode,ownerFactory]=await request(()=>Promise.all([provider.getCode(implementation),provider.getCode(receiptToken),receipt.factory()]),'Factory child verification');
 if(implCode==='0x'||receiptCode==='0x'||!same(ownerFactory,address))throw Error('Factory implementation or NFT collection failed verification.');
 return {implementation,receiptToken};
}
function artifactAt(root){
 const file=path.join(root,'artifacts/contracts/YellowBrickFactory.sol/YellowBrickFactory.json');
 let artifact;try{artifact=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('Compile the contracts with npm run compile, then refresh this estimate.');}
 if(artifact.contractName!=='YellowBrickFactory'||!/^0x[0-9a-f]+$/i.test(artifact.bytecode||'')||artifact.bytecode.length<10||artifact.abi?.some(x=>x.type==='constructor'&&x.inputs?.length))throw Error('Unsupported compiled factory artifact.');
 return artifact;
}
async function prepareSepolia({root,input={},env=process.env,compile=async()=>{},now=Date.now,ethersImpl,provider:providedProvider}={}){
 const ethers=ethersImpl||require('ethers').ethers,saved=readRecord(root,'sepolia');
 if(saved)checkedProfile(saved);
 const rpcUrl=checkedRpc(input.rpcUrl||env.SEPOLIA_RPC_URL||saved?.rpcUrl||'');
 const provider=providedProvider||new ethers.providers.JsonRpcProvider({url:rpcUrl,timeout:10000},{name:'sepolia',chainId:CHAIN});
 const genesisHash=await chainIdentity(provider);
 const pending=readRecord(root,'sepolia-pending');
 // An uncertain submission remains a hard stop. Never guess it was not broadcast.
 if(pending&&pending.status==='submitted'){
  if(!same(pending.genesisHash,genesisHash))throw Error('A pending deployment belongs to different RPC history. Resolve it before switching.');
  const receipt=await request(()=>provider.getTransactionReceipt(pending.transactionHash),'Pending deployment lookup');
  if(!receipt)throw Error('A deployment is already pending or its broadcast is uncertain: '+pending.transactionHash+'. Inspect it; do not deploy again.');
  if(receipt.status!==1)throw Error('The previous deployment reverted: '+pending.transactionHash+'. Inspect its gas cost and resolve the pending record before another deployment.');
  if(!same(receipt.contractAddress,pending.factoryAddress))throw Error('Confirmed deployment address differs from the pending record.');
  await verifyDeployment(provider,receipt.contractAddress,ethers);
  const profile=checkedProfile({version:1,network:'sepolia',chainId:CHAIN,rpcUrl,genesisHash,factoryAddress:receipt.contractAddress,deploymentBlock:receipt.blockNumber,deployer:pending.deployer,transactionHash:receipt.transactionHash});
  return {kind:'reuse',provider,ethers,profile,pendingReceipt:receipt,lines:['Sepolia / chain 11155111',rpcLabel(rpcUrl),'Recovered confirmed deployment','Factory: '+profile.factoryAddress,'No deployment transaction / cost: 0 ETH']};
 }
 const factoryAddress=Object.hasOwn(input,'factoryAddress')?input.factoryAddress:(env.YBR_SEPOLIA_FACTORY||saved?.factoryAddress||'');
 if(factoryAddress){
  if(saved&&same(saved.factoryAddress,factoryAddress)&&!same(saved.genesisHash,genesisHash))throw Error('Saved Sepolia deployment belongs to different chain history. No fallback or redeployment was attempted.');
  await verifyDeployment(provider,factoryAddress,ethers);
  const deploymentBlock=Number(input.deploymentBlock??env.YBR_SEPOLIA_DEPLOYMENT_BLOCK??saved?.deploymentBlock??0);
  const profile=checkedProfile({version:1,network:'sepolia',chainId:CHAIN,rpcUrl,genesisHash,factoryAddress,deploymentBlock,deployer:saved?.deployer,transactionHash:saved?.transactionHash});
  return {kind:'reuse',provider,ethers,profile,lines:['Sepolia / chain 11155111',rpcLabel(rpcUrl),'Reuse verified factory: '+factoryAddress,'No deployment transaction / cost: 0 ETH','Player, Registry, My Bricks and Mint Studio switch together.']};
 }
 const privateKey=input.privateKey||env.SEPOLIA_PRIVATE_KEY;
 if(!/^0x[0-9a-f]{64}$/i.test(privateKey||''))throw Error('Set a separate Sepolia test signer with [k] in this menu or SEPOLIA_PRIVATE_KEY. Never use your Ganache seed.');
 const signer=new ethers.Wallet(privateKey,provider);
 // Refuse the selected and deterministic demo account families on a public network.
 const {readSelection}=require('./dev-ganache-profile.cjs');
 const selected=readSelection(root,ethers);
 const seeds=new Set([selected.mnemonic,'myth like bonus scare over problem client lizard pioneer submit female collect']);
 for(const seed of seeds)for(let i=0;i<10;i++)if(same(ethers.Wallet.fromMnemonic(seed,"m/44'/60'/0'/0/"+i).address,signer.address))throw Error('Use a separate Sepolia test wallet, not a Ganache demo account.');
 await compile();
 const artifact=artifactAt(root),data=artifact.bytecode,bytecodeHash=ethers.utils.keccak256(data);
 const [block,fees,balance,nonce,estimate]=await request(()=>Promise.all([provider.getBlock('latest'),provider.getFeeData(),provider.getBalance(signer.address,'pending'),provider.getTransactionCount(signer.address,'pending'),provider.estimateGas({from:signer.address,data,value:0})]),'Deployment estimate');
 if(block?.baseFeePerGas==null||fees?.maxFeePerGas==null||fees?.maxPriorityFeePerGas==null)throw Error('Sepolia EIP-1559 fee data is unavailable. No transaction will be sent.');
 const budget=deploymentBudget({estimatedGas:estimate,blockGasLimit:block.gasLimit,baseFeePerGas:block.baseFeePerGas,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas,balance,budgetWei:parseEther(input.maxEth||env.YBR_DEPLOY_MAX_ETH||'0.05')});
 if(!Number.isSafeInteger(nonce)||nonce<0)throw Error('Cannot determine the deployer nonce.');
 const transaction=Object.freeze({type:2,chainId:CHAIN,nonce,data,value:'0',gasLimit:budget.gasLimit,maxFeePerGas:budget.maxFeePerGas,maxPriorityFeePerGas:budget.maxPriorityFeePerGas});
 return {kind:'deploy',provider,ethers,signer,root,rpcUrl,genesisHash,bytecodeHash,budget,transaction,createdAt:now(),expiresAt:now()+QUOTE_MS,
  lines:['Sepolia / chain 11155111',rpcLabel(rpcUrl),'Signer: '+signer.address,'New factory + implementation + NFT collection','1 transaction / gas estimate '+budget.estimatedGas+' / limit '+budget.gasLimit,'Fee cap: '+ethers.utils.formatUnits(budget.maxFeePerGas,9)+' gwei / priority: '+ethers.utils.formatUnits(budget.maxPriorityFeePerGas,9)+' gwei','Expected fee: '+formatEther(budget.estimatedWei)+' Sepolia ETH','MAXIMUM SPEND: '+formatEther(budget.maximumWei)+' Sepolia ETH','Balance: '+formatEther(budget.balanceWei)+' / remaining >= '+formatEther(budget.remainingWei),'Quote valid 90 seconds. No test music will be minted.']};
}
async function applySepolia(plan,{root,approval,now=Date.now,receiptTimeoutMs=120000,onProgress=()=>{}}={}){
 if(!plan||!['reuse','deploy'].includes(plan.kind))throw Error('Review the network plan first.');
 if(!same(await chainIdentity(plan.provider),plan.profile?.genesisHash||plan.genesisHash))throw Error('RPC chain history changed. Review again.');
 if(plan.kind==='reuse'){
  await verifyDeployment(plan.provider,plan.profile.factoryAddress,plan.ethers);
  writeRecord(root,'sepolia',plan.profile);
  if(plan.pendingReceipt){const pending=readRecord(root,'sepolia-pending');writeRecord(root,'sepolia-pending',{...pending,status:'confirmed',blockNumber:plan.pendingReceipt.blockNumber});}
  return plan.profile;
 }
 if(approval!=='DEPLOY SEPOLIA')throw Error('Explicit DEPLOY SEPOLIA approval is required.');
 if(now()>plan.expiresAt)throw Error('Deployment quote expired. Refresh and approve the new estimate.');
 const lock=path.join(safeDirectory(root),'sepolia-deploy.lock');let fd;
 try{fd=fs.openSync(lock,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600);}
 catch{throw Error('Another deployment is active or its lock needs inspection. No transaction sent.');}
 try{
  const existing=readRecord(root,'sepolia-pending');if(existing?.status==='submitted')throw Error('Resolve the existing pending deployment before sending another transaction.');
  if(readRecord(root,'sepolia')?.factoryAddress)throw Error('A Sepolia factory was saved elsewhere. Review and reuse it before considering another deployment.');
  if(plan.ethers.utils.keccak256(artifactAt(root).bytecode)!==plan.bytecodeHash)throw Error('Compiled contracts changed after the quote. Review again.');
  const [nonce,balance,block,estimate]=await request(()=>Promise.all([plan.provider.getTransactionCount(plan.signer.address,'pending'),plan.provider.getBalance(plan.signer.address,'pending'),plan.provider.getBlock('latest'),plan.provider.estimateGas({from:plan.signer.address,data:plan.transaction.data,value:0})]),'Final deployment preflight');
  if(nonce!==plan.transaction.nonce)throw Error('Signer nonce changed. Refresh the deployment estimate.');
  if(BigInt(balance.toString())<BigInt(plan.budget.maximumWei)||BigInt(estimate.toString())>BigInt(plan.transaction.gasLimit)||BigInt(block.gasLimit.toString())<BigInt(plan.transaction.gasLimit)||BigInt(block.baseFeePerGas.toString())+BigInt(plan.transaction.maxPriorityFeePerGas)>BigInt(plan.transaction.maxFeePerGas))throw Error('Balance, gas or fees changed beyond the approved envelope. Refresh and approve a new quote.');
  if(now()>plan.expiresAt)throw Error('Deployment quote expired during verification. Review again.');
  const signed=await plan.signer.signTransaction(plan.transaction);
  const transactionHash=plan.ethers.utils.keccak256(signed),factoryAddress=plan.ethers.utils.getContractAddress({from:plan.signer.address,nonce});
  const pending={version:1,status:'submitted',chainId:CHAIN,genesisHash:plan.genesisHash,transactionHash,factoryAddress,deployer:plan.signer.address,nonce,bytecodeHash:plan.bytecodeHash,maximumWei:plan.budget.maximumWei};
  // Durable intent precedes broadcast; a timeout cannot cause a blind duplicate.
  writeRecord(root,'sepolia-pending',pending);onProgress('Submitting approved deployment '+transactionHash);
  await request(()=>plan.provider.sendTransaction(signed),'Deployment broadcast (hash '+transactionHash+')');
  const receipt=await request(()=>plan.provider.waitForTransaction(transactionHash,1,receiptTimeoutMs),'Deployment confirmation (hash '+transactionHash+')');
  if(!receipt||receipt.status!==1||!same(receipt.contractAddress,factoryAddress))throw Error('Deployment is pending, reverted or unverified: '+transactionHash+'. Inspect it before retrying.');
  await verifyDeployment(plan.provider,factoryAddress,plan.ethers);
  const profile=checkedProfile({version:1,network:'sepolia',chainId:CHAIN,rpcUrl:plan.rpcUrl,genesisHash:plan.genesisHash,factoryAddress,deploymentBlock:receipt.blockNumber,deployer:plan.signer.address,transactionHash});
  writeRecord(root,'sepolia',profile);writeRecord(root,'sepolia-pending',{...pending,status:'confirmed',blockNumber:receipt.blockNumber,gasUsed:receipt.gasUsed.toString(),effectiveGasPrice:receipt.effectiveGasPrice?.toString()});
  onProgress('Deployment confirmed. Network profile saved.');return profile;
 }finally{
  const opened=fs.fstatSync(fd);fs.closeSync(fd);
  try{const st=fs.lstatSync(lock);if(st.ino===opened.ino&&st.dev===opened.dev)fs.unlinkSync(lock);}catch(e){if(e.code!=='ENOENT')throw e;}
 }
}
module.exports={prepareSepolia,applySepolia,chainIdentity,verifyDeployment,QUOTE_MS};
