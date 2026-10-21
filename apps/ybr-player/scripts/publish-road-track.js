'use strict';
/** Opt-in, disposable local Ganache demonstration publisher.
 * New sound-recording Brick, explicitly public audio copy, chain-committed manifest.
 * Never publishes encrypted/private Mint Studio source assets automatically.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {ethers}=require('ethers');
const {readFactoryAddress,loopbackUrl}=require('../road-music');
const root=path.resolve(__dirname,'../../..');
const app=path.resolve(__dirname,'..');
const hash=b=>'0x'+crypto.createHash('sha256').update(b).digest('hex');
const ABI=[
 'function ipIdentity(address,bytes32,bytes32) view returns (bytes32)',
 'function deployBrickWithMetadataDigest(bytes32,string,bytes32,bytes32) returns (address)',
 'event BrickDeployed(bytes32 indexed ipId,address indexed brick,address indexed originator,bytes32 contentHash)'
];
function arg(name,alternative){
 const i=process.argv.indexOf(name);
 return i<0?alternative:process.argv[i+1];
}
async function main(){
 if(!process.argv.includes('--publish'))throw Error('Explicit opt-in required. Pass --publish to register and expose a public audio copy.');
 const rpc=loopbackUrl(process.env.YBR_GANACHE_RPC||'http://127.0.0.1:8545');
 const origin=loopbackUrl(process.env.YBR_ROAD_PUBLIC_ORIGIN||'http://127.0.0.1:4173');
 const factoryAddress=readFactoryAddress(root);
 if(!factoryAddress)throw Error('No Ganache factory. From repo root run: npm run ganache:deploy');
 const provider=new ethers.providers.JsonRpcProvider(rpc);
 if((await provider.getNetwork()).chainId!==1337)throw Error('Requires disposable Ganache chain ID 1337');
 const signer=provider.getSigner(0);
 const owner=await signer.getAddress();
 const factory=new ethers.Contract(factoryAddress,ABI,signer);
 if((await provider.getCode(factoryAddress))==='0x')throw Error('Factory not deployed. Re-run ganache:deploy after a Ganache reset');
 const file=path.resolve(arg('--file',path.join(app,'media/golden-hour.wav')));
 const mimeMap={'.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg','.m4a':'audio/mp4','.flac':'audio/flac','.webm':'audio/webm'};
 const ext=path.extname(file).toLowerCase(),mime=mimeMap[ext];
 if(!mime)throw Error('Unsupported audio type for this demo. Supported: '+Object.keys(mimeMap).join(', '));
 const audio=fs.readFileSync(file);
 if(!audio.length||audio.length>50*1024*1024)throw Error('Audio demo supports 1 byte to 50 MiB per file');
 const title=arg('--title','Golden Hour — Road Release');
 const artist=arg('--artist','The Amber Sessions');
 if(!title?.trim()||!artist?.trim()||title.length>160||artist.length>160)throw Error('Title and artist required (max 160 characters)');
 const contentHash=hash(audio);
 const nonce=ethers.utils.hexlify(crypto.randomBytes(32));
 const id=(await factory.ipIdentity(owner,contentHash,nonce)).toLowerCase();
 const audioName=id+ext;
 const metadataURI=origin+'/road/metadata/'+id;
 const metadata={
  standard:'0x0z-road-ip',schemaVersion:'1.0.0',
  schema:'https://0x0z.org/road/schemas/brick-metadata-v1.schema.json',
  objectType:'sound-recording',title:title.trim(),description:'Creator opt-in public playback on local Ganache; no production streaming rights adjudication.',
  creators:[{name:artist.trim(),role:'primary-artist',wallet:owner}],
  rights:{
   ownershipStatus:'self-declared-not-verified',
   aiTraining:{mode:'not-authorized'},
   playback:{
    mode:'public-stream',audience:'any-player',authorization:'controller-published-on-chain',
    terms:'Local YBR pilot: free preview playback only. No commercial streaming or redistribution license is implied.'
   }
  },
  media:[{
   role:'public-stream',name:audioName,mediaType:mime,byteLength:audio.length,
   integrity:{algorithm:'sha2-256',digest:contentHash},
   access:{visibility:'public',encryption:'none'}
  }],
  provenance:{recordedAt:new Date().toISOString(),sourceApplication:'YBR Player opt-in Ganache publisher',authStatus:'on-chain-controller-published'},
  road:{ipId:id,controllerAtPublication:owner,chainId:1337,factoryAddress,metadataURI},
  music:{durationMs:0}
 };
 const bytes=Buffer.from(JSON.stringify(metadata,null,2)+'\n','utf8');
 const digest=hash(bytes);
 const mediaDir=path.join(app,'media/road-public');
 const dataDir=path.join(app,'data/road-public');
 fs.mkdirSync(mediaDir,{recursive:true});fs.mkdirSync(dataDir,{recursive:true});
 fs.writeFileSync(path.join(mediaDir,audioName),audio,{flag:'wx'});
 fs.writeFileSync(path.join(dataDir,id+'.json'),bytes,{flag:'wx'});
 let tx;
 try{
  tx=await factory.deployBrickWithMetadataDigest(contentHash,metadataURI,digest,nonce);
  const receipt=await tx.wait(1);
  if(receipt.status!==1)throw Error('Registration reverted');
  const event=receipt.events.find(e=>e.event==='BrickDeployed'&&e.args.ipId.toLowerCase()===id);
  if(!event)throw Error('Expected BrickDeployed event absent');
  const output={
   chainId:1337,factoryAddress,brickAddress:event.args.brick,ipId:id,
   transactionHash:receipt.transactionHash,metadataURI,
   streamUrl:origin+'/road/media/'+id,
   catalogUrl:origin+'/road/api/music',
   contentHash,metadataDigest:digest
  };
  console.log(JSON.stringify(output,null,2));
 }catch(error){
  console.error('Chain publication failed. The unreferenced local copy remains in data/road-public and media/road-public for inspection.');
  throw error;
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
