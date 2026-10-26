/** Display transport failures without copying RPC URLs, API keys or request data. */
export function rpcConnectionError(error){
 let current=error,status=null,transport=false;
 const seen=new Set();
 for(let n=0;current&&n<8&&!seen.has(current);n++,current=current.cause){
  seen.add(current);
  if(Number.isInteger(current.status)&&current.status>=400&&current.status<=599)status=current.status;
  if(['HttpRequestError','TimeoutError','SocketClosedError'].includes(current.name)||current.shortMessage==='HTTP request failed.')transport=true;
 }
 if(!transport&&!status)return error;
 const detail=status===400?'The local RPC gateway rejected a blockchain read (HTTP 400). Update and restart Dev Control, then reload Mint Studio.':
  status===401||status===403?'The blockchain read was denied (HTTP '+status+'). Open the exact workspace URL shown in Dev Control and check the selected RPC credentials.':
  status===429?'The selected blockchain RPC is rate-limited (HTTP 429). Retry after the limit clears or configure your own Infura key.':
  'The workspace could not reach its blockchain read gateway'+(status?' (HTTP '+status+')':'')+'. Check Dev Control and open the exact HTTP or HTTPS address it shows.';
 return Object.assign(new Error(detail+' No transaction was requested by this connection check. Review any earlier transaction receipts before retrying.'),{name:'YbrRpcConnectionError',shortMessage:detail+' No transaction was requested by this connection check.'});
}
