/** 0x🟨 Road client-side portable encrypted asset container v1.
 * AES-256-GCM, random 96-bit IV, PBKDF2-SHA-256 with random salt.
 * The secret passphrase never enters the resulting file or metadata.
 * Not a replacement for audited token-gated key wrapping / access control.
 */
const enc=new TextEncoder();
const dec=new TextDecoder();
const MAGIC=enc.encode('0ZROAD01');
const ITERATIONS=310000;
const MAX_BYTES=256*1024*1024;
function crypt(){const c=globalThis.crypto;if(!c?.subtle||!c.getRandomValues)throw Error('Secure browser context required (HTTPS or localhost).');return c;}
function hex(b){return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');}
function assertPassword(password){if(typeof password!=='string'||password.length<12)throw Error('Use a passphrase of at least 12 characters.');}
async function derive(c,password,salt){const key=await c.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return c.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function encryptAsset(bytes,password,{name='source',mime='application/octet-stream'}={}){
 assertPassword(password);const c=crypt();const plain=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);if(plain.length>MAX_BYTES)throw Error('Prototype limit: 256 MB; large files require streaming encryption.');
 const salt=c.getRandomValues(new Uint8Array(16)),iv=c.getRandomValues(new Uint8Array(12));const key=await derive(c,password,salt);
 const header={v:1,alg:'AES-256-GCM',kdf:'PBKDF2-SHA-256',iterations:ITERATIONS,salt:hex(salt),iv:hex(iv),name,mime,bytes:plain.byteLength};
 const headerBytes=enc.encode(JSON.stringify(header));if(headerBytes.length>65535)throw Error('Header too large.');
 const cipher=new Uint8Array(await c.subtle.encrypt({name:'AES-GCM',iv,additionalData:headerBytes},key,plain));
 const output=new Uint8Array(MAGIC.length+2+headerBytes.length+cipher.length);
 output.set(MAGIC);output[MAGIC.length]=(headerBytes.length>>>8)&255;output[MAGIC.length+1]=headerBytes.length&255;
 output.set(headerBytes,MAGIC.length+2);output.set(cipher,MAGIC.length+2+headerBytes.length);
 const digest=new Uint8Array(await c.subtle.digest('SHA-256',output));
 return {bytes:output,sha256:hex(digest),header};
}
export async function decryptAsset(container,password){
 assertPassword(password);const c=crypt();const bytes=container instanceof Uint8Array?container:new Uint8Array(container);
 if(bytes.length<MAGIC.length+3||!MAGIC.every((v,i)=>bytes[i]===v))throw Error('Invalid Road encrypted asset.');
 const size=(bytes[MAGIC.length]<<8)|bytes[MAGIC.length+1],start=MAGIC.length+2,end=start+size;
 if(!size||end+16>bytes.length)throw Error('Truncated Road encrypted asset.');
 const headerBytes=bytes.subarray(start,end);const h=JSON.parse(dec.decode(headerBytes));
 if(h.v!==1||h.alg!=='AES-256-GCM'||h.kdf!=='PBKDF2-SHA-256'||h.iterations!==ITERATIONS||!Number.isSafeInteger(h.bytes)||h.bytes<0||h.bytes>MAX_BYTES||!(/^[0-9a-f]{32}$/.test(h.salt))||!(/^[0-9a-f]{24}$/.test(h.iv)))throw Error('Unsupported encrypted asset.');
 const parse=x=>Uint8Array.from(x.match(/../g),v=>parseInt(v,16));const key=await derive(c,password,parse(h.salt));
 const decrypted=new Uint8Array(await c.subtle.decrypt({name:'AES-GCM',iv:parse(h.iv),additionalData:headerBytes},key,bytes.subarray(end)));
 if(decrypted.length!==h.bytes)throw Error('Length mismatch.');
 return {bytes:decrypted,header:h};
}
