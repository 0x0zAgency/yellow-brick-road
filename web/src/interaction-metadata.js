/** Prepare a metadata draft, never silently change a contract or encrypted CID.
 * The caller supplies the already verified current Brick context. A checksum
 * detects changes to a snapshot, not a trusted publisher signature.
 */
export async function ingestInteractionSnapshot(metadata,snapshot,context){
 const {digest,...payload}=snapshot||{};
 const hex='0x'+[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==hex||snapshot.format!=='ybr-interaction-snapshot/1'||snapshot.proofLevel!=='unverified-client-report'||snapshot.source!=='local-ybr-player')throw Error('Invalid interaction snapshot.');
 const s=snapshot.subject;
 if(!s||!['on-chain','on-chain-publication'].includes(s.kind)||!context||Number(s.chainId)!==Number(context.chainId)||
  ['genesisHash','factoryAddress','brickAddress'].some(k=>typeof s[k]!=='string'||s[k].toLowerCase()!==String(context[k]).toLowerCase()))throw Error('Interaction snapshot identifies another Brick or chain history.');
 if(s.kind==='on-chain'&&String(context.revision)!==s.revision)throw Error('Interaction snapshot belongs to a different file revision.');
 if(s.kind==='on-chain-publication'&&String(context.publicationDigest).toLowerCase()!==s.publicationDigest)throw Error('Interaction snapshot belongs to another publication.');
 const role={audio:'preview',artwork:'artwork',lyrics:'lyrics'}[s.role];
 const file=metadata?.media?.find(f=>f.role===role||(s.kind==='on-chain-publication'&&f.role==='public-stream'));
 if(!file||String(file.integrity?.digest).toLowerCase()!=='0x'+s.sha256)throw Error('Interaction snapshot does not describe this committed file.');
 if(!Number.isSafeInteger(snapshot.events)||snapshot.events<0||!snapshot.counters||Object.values(snapshot.counters).some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Invalid interaction counters.');
 if(snapshot.events>0&&(!Number.isFinite(Date.parse(snapshot.through))||!Number.isFinite(Date.parse(snapshot.first))))throw Error('Invalid interaction time range.');
 if(Object.values(snapshot.counters).some(n=>n>snapshot.events)||snapshot.counters.reportedStarts>snapshot.counters.playEvents||snapshot.counters.endedReports>snapshot.counters.reportedStarts)throw Error('Inconsistent interaction counters.');
 const draft=structuredClone(metadata),previous=Array.isArray(draft.extensions?.playerInteractions)?draft.extensions.playerInteractions:[];
 const key=JSON.stringify(s);
 // Replace a prior snapshot for this rendition, never sum cumulative snapshots.
 const old=previous.find(p=>JSON.stringify(p.subject)===key);
 if(old&&(old.events>snapshot.events||Date.parse(old.through)>Date.parse(snapshot.through)))throw Error('A newer snapshot is already present.');
 const retained=previous.filter(p=>JSON.stringify(p.subject)!==key);
 if(retained.length>=64)throw Error('Metadata interaction snapshot limit reached.');
 draft.extensions={...draft.extensions,playerInteractions:[...retained,structuredClone(snapshot)]};
 return draft;
}
