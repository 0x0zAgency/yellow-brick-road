/** Public, synthetic test fixture only. Never use this passphrase for real IP. */
export const SAMPLE_KEY='local integration test passphrase - do not reuse';
export const SAMPLE_TEXT='Private YBR integration sample. Not an original publication.';
export const SAMPLE_BYTES=new TextEncoder().encode(SAMPLE_TEXT);
export const BRIDGE_BASE='http://127.0.0.1:8791';
export const STUDIO_ORIGIN='http://127.0.0.1:5173';
export const bridgeFetch=(path,options={})=>{
 if(typeof path!=='string'||!path.startsWith('/api/road-ipfs/'))throw Error('The smoke test only calls the narrow local bridge.');
 return fetch(BRIDGE_BASE+path,{...options,headers:{...options.headers,Origin:STUDIO_ORIGIN}});
};
