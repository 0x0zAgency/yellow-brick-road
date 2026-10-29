/** Public, synthetic test fixture only. Never use this passphrase for real IP. */
export const SAMPLE_KEY='local integration test passphrase - do not reuse';
export const SAMPLE_TEXT='Private YBR integration sample. Not an original publication.';
const sample=new TextEncoder().encode(SAMPLE_TEXT);
// Optional larger deterministic fixture, shared by upload and post-restart recovery.
const sampleMiB=Number(process.env.YBR_IPFS_SMOKE_MIB||0);
if(!Number.isSafeInteger(sampleMiB)||sampleMiB<0||sampleMiB>256)throw Error('YBR_IPFS_SMOKE_MIB must be an integer from 0 to 256.');
export const SAMPLE_BYTES=sampleMiB?new Uint8Array(sampleMiB*1024*1024).fill(73):sample;
if(sampleMiB)SAMPLE_BYTES.set(sample);
export const BRIDGE_BASE='http://127.0.0.1:8791';
export const STUDIO_ORIGIN='http://127.0.0.1:5173';
export const bridgeFetch=(path,options={})=>{
 if(typeof path!=='string'||!path.startsWith('/api/road-ipfs/'))throw Error('The smoke test only calls the narrow local bridge.');
 return fetch(BRIDGE_BASE+path,{...options,headers:{...options.headers,Origin:STUDIO_ORIGIN}});
};
