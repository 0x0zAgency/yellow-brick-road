/** DEMO ONLY: never represents chain contracts or transactions. */
function randomHex(){const c=globalThis.crypto;if(!c?.getRandomValues)throw Error('Secure browser context required.');return [...c.getRandomValues(new Uint8Array(10))].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();}
export function simulateMintReceipts(packet){
 if(packet?.packetType!=='LOCAL_PREVIEW_NOT_MINTED'||!Array.isArray(packet.bricks))throw Error('Invalid demo registration packet.');
 return {simulated:true,status:'DEMO_ONLY_NOT_MINTED',batchId:'DEMO-BATCH-'+randomHex(),
  receipts:packet.bricks.map(b=>({id:'DEMO-BRICK-'+randomHex(),sourceId:b.localId,title:b.metadata.title,role:b.role,status:'simulated',chainId:null,transactionHash:null,contractAddress:null,blockNumber:null}))};
}