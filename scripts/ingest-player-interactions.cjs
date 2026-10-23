'use strict';
/** Offline ingestion into a NEW metadata draft, never an automatic chain write. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const digest=text=>'0x'+crypto.createHash('sha256').update(text).digest('hex');
function readJson(file,max){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size>max)throw Error('Input must be a bounded regular JSON file.');return JSON.parse(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}
}
async function makeDraft(packet,snapshot){
 const {buildingFromPacket}=await import('../web/src/release-buildings.js');
 const {ingestInteractionSnapshot}=await import('../web/src/interaction-metadata.js');
 await buildingFromPacket(packet); // original metadata and receipt commitments
 const mint=packet.onChainMint,subject=snapshot?.subject;
 const receipt=mint.receipts.find(r=>r.contractAddress?.toLowerCase()===subject?.brickAddress?.toLowerCase());
 if(!receipt||!receipt.contentPolicy)throw Error('A policy-enabled receipt for this file is required.');
 const original=JSON.parse(receipt.metadataJson);
 const context={chainId:mint.chainId,factoryAddress:mint.factoryAddress,genesisHash:mint.genesisHash,brickAddress:receipt.contractAddress,revision:String(receipt.contentPolicy.revision)};
 const metadata=await ingestInteractionSnapshot(original,snapshot,context);
 return {format:'ybr-interaction-metadata-draft/1',status:'UNPUBLISHED_REQUIRES_CONTROLLER_REVIEW',context,
  previousMetadataDigest:receipt.metadataDigest,previousMetadataURI:receipt.metadataURI,
  metadataDigest:digest(JSON.stringify(metadata)),metadata,
  notice:'This draft is private and unverified against current chain state. Verify the current controller, revision and metadata commitment before encrypting/publishing a new version and signing its update. No rights or media bytes are changed.'};
}
async function main(args=process.argv.slice(2)){
 if(args.includes('--help')){console.log('node scripts/ingest-player-interactions.cjs --packet mint-packet.json --snapshot ybr-interaction-snapshot.json --out metadata-draft.json');return;}
 const opts={};for(let i=0;i<args.length;i+=2){if(!['--packet','--snapshot','--out'].includes(args[i])||!args[i+1]||opts[args[i]])throw Error('Use --packet FILE --snapshot FILE --out NEW_FILE.');opts[args[i]]=args[i+1];}
 if(Object.keys(opts).length!==3)throw Error('Use --packet FILE --snapshot FILE --out NEW_FILE.');
 const result=await makeDraft(readJson(opts['--packet'],5*1024*1024),readJson(opts['--snapshot'],64*1024));
 const target=path.resolve(opts['--out']);const fd=fs.openSync(target,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600);
 try{fs.writeFileSync(fd,JSON.stringify(result,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 console.log('Private metadata draft saved. No file was uploaded and no blockchain transaction was submitted.');
}
if(require.main===module)main().catch(e=>{console.error(e instanceof SyntaxError?'Invalid JSON input.':e.code==='EEXIST'?'Output exists; choose a new output file.':e.message);process.exitCode=1;});
module.exports={makeDraft,main};
