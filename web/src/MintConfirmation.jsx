export default function MintConfirmation({packet,execution,nftCover,playerEnabled,assets,contentPolicy,licensingEmail,deliveryApproved,chainId,factoryAddress,ipfsEnabled,onCancel,onConfirm}){
 const fresh=packet.bricks.filter(b=>!b.reuse).length,reused=packet.bricks.length-fresh,linked=packet.linkAuthorizations?.length||0,simulated=execution==='simulated';
 const artwork=nftCover?.consent?(nftCover.kind==='album'?'Album cover':'Selected cover'):'Yellow Brick default';
 return <><h2>{simulated?'Simulate registration?':fresh?'Mint '+fresh+' Brick'+(fresh===1?'':'s'):'Reuse '+reused+' Brick'+(reused===1?'':'s')+'?'}</h2>
  {fresh>0&&<dl className="ms-confirm-summary"><div><dt>Public NFT artwork</dt><dd>{artwork}</dd></div><div><dt>Content</dt><dd>{contentPolicy.locked?'Permanently locked':'Revisions allowed'}</dd></div>{playerEnabled&&<div><dt>YBR Player delivery</dt><dd>{deliveryApproved?'Enabled':'Off'}</dd></div>}</dl>}
  <p className="ms-confirm-note">{fresh>0&&ipfsEnabled?'Publishes encrypted files to IPFS. ':''}{simulated?'No blockchain transaction.':fresh?'Confirm one transaction in your wallet.':'Uses your existing Bricks. No mint transaction.'}</p>
  <details className="ms-confirm-details"><summary>Details</summary>
   {fresh>0&&reused>0&&<p>Reuses {reused} existing Brick{reused===1?'':'s'}.</p>}
   {linked>0&&<p>References {linked} existing Brick{linked===1?'':'s'}.</p>}
   {!simulated&&<dl><div><dt>Network</dt><dd>{chainId}</dd></div><div><dt>Factory</dt><dd><code>{factoryAddress}</code></dd></div></dl>}
   {fresh>0&&<>
    {playerEnabled&&<p>Player permissions: {['preview','artwork','lyrics'].filter(role=>contentPolicy[role]&&assets[role]?.hash).join(', ')||'none'}. {deliveryApproved?'Approved copies and release labels will be delivered after confirmation.':'No Player copies requested.'}</p>}
    <p>{contentPolicy.locked?'Source files cannot be replaced after minting. Descriptive work details remain editable.':'Source files permit versioned revisions.'}{simulated?' On-chain settings are simulated.':''}</p>
    {licensingEmail.trim()&&<p>Public licensor email: <strong>{licensingEmail.trim()}</strong>. {simulated?'Included in the simulation packet.':'Stored on each new Brick; previous values remain public.'}</p>}
    {ipfsEnabled?<p>Encrypted files and metadata are published to IPFS before minting and may remain available permanently. Keep your private recovery file. Public NFT artwork is unencrypted.</p>:<p>No source files are hosted. Local demo metadata references are used.</p>}
   </>}
  </details>
  <div className="ms-confirm-actions"><button className="ms-outline" onClick={onCancel}>Cancel</button><button className="ms-primary" onClick={onConfirm}>{simulated?'Run simulation':fresh?'Mint Bricks':'Confirm reuse'}</button></div>
 </>;
}
