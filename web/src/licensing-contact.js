/** Public, controller-declared mailbox. Contact details do not authorize any use. */
export function normalizeLicensingEmail(value=''){
 if(typeof value!=='string')throw Error('Enter a valid licensing email address.');
 const email=value.replace(/^ +| +$/g,'');if(!email)return '';
 const parts=email.split('@'),[local,domain]=parts;
 if(email.length>254||parts.length!==2||!local||local.length>64||
  !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)||local.startsWith('.')||local.endsWith('.')||local.includes('..')||
  !domain.includes('.')||!domain.split('.').every(label=>label.length<=63&&/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)))
  throw Error('Enter one licensing email address (up to 254 characters), without a display name or message headers.');
 return local+'@'+domain.toLowerCase();
}
export const licensingMailto=email=>email?'mailto:'+encodeURIComponent(normalizeLicensingEmail(email)).replace('%40','@'):'';
export const packetLicensingEmails=packet=>(packet?.bricks||[]).map(b=>normalizeLicensingEmail(b.metadata?.rights?.licensingContact?.email??''));
export const licensingContactAbi=[
 {type:'function',name:'licensingContact',stateMutability:'view',inputs:[],outputs:[{name:'email',type:'string'},{name:'version',type:'uint64'},{name:'authority',type:'address'}]},
 {type:'function',name:'setLicensingContact',stateMutability:'nonpayable',inputs:[{name:'email',type:'string'},{name:'expectedVersion',type:'uint64'}],outputs:[]}
];
