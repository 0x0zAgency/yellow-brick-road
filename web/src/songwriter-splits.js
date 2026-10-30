/** Creator-declared composition shares; never infer ownership or install payouts
 * from MP3 tags. Actual payment configuration remains a controller transaction. */
const address=value=>/^0x[\da-f]{40}$/i.test(value||'')&&!/^0x0{40}$/i.test(value);
export function songwriterNames(value){const names=new Map();for(const name of String(value||'').split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean)){const key=name.normalize('NFC').toLowerCase();if(!names.has(key))names.set(key,name);}return [...names.values()];}
export function equalSongwriterShares(names){const base=Math.floor(10000/names.length);return names.map((name,i)=>({name,wallet:'',bps:base+(i<10000%names.length?1:0)}));}
export function percentToBps(value){return /^(?:\d{1,3})(?:\.\d{1,2})?$/.test(String(value))?Math.round(Number(value)*100):NaN;}
export function validateSongwriterSplits(value,names,{walletRequired=false}={}){
 if(names.length<2)return [];
 const errors=[];
 if(names.length>16)return ['A composition supports up to 16 songwriter recipients.'];
 if(!value||!Array.isArray(value.shares)||value.shares.length!==names.length||value.shares.some((row,i)=>!row||row.name!==names[i]||typeof row.wallet!=='string'))return ['Review songwriter splits for the current writer credits.'];
 const rows=value.shares;
 if(rows.some(r=>!Number.isInteger(r.bps)||r.bps<=0||r.bps>10000)||rows.reduce((sum,r)=>sum+r.bps,0)!==10000)errors.push('Songwriter shares must be positive and total exactly 100%.');
 if(rows.some(r=>r.wallet?!address(r.wallet):walletRequired))errors.push('Enter a valid, nonzero wallet for every songwriter.');
 const wallets=rows.map(r=>r.wallet.toLowerCase()).filter(Boolean);
 if(new Set(wallets).size!==wallets.length)errors.push('Use a different recipient wallet for each songwriter.');
 if(value.confirmed!==true)errors.push('Confirm that you are authorized to register the composition and declare these splits.');
 return errors;
}
export function songwritingPayout(value,names){
 const errors=validateSongwriterSplits(value,names);if(errors.length)throw Error(errors.join(' '));
 return {type:'proposed-songwriter-split',status:'controller-configuration-required',shares:value.shares.map(row=>({party:row.name,wallet:row.wallet||null,bps:row.bps})),authority:'creator-declared-on-behalf-of-listed-writers'};
}
