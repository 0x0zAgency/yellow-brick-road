/** The launcher supplies a deployed factory, not an address to hard-code.
 * Only use that default for its own loopback endpoint and chain. Contract and
 * wallet-history verification still happen in the existing mint preflight.
 */
const ADDRESS=/^0x[0-9a-f]{40}$/i;
export function startupGanacheFactory({network,chainId,rpcUrl,configuredFactory}={}){
 if(network!=='ganache'||String(chainId)!=='1337'||typeof configuredFactory!=='string'||
    !ADDRESS.test(configuredFactory)||/^0x0{40}$/i.test(configuredFactory))return '';
 try{
  const url=new URL(rpcUrl);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.port!=='8545'||
     url.pathname!=='/'||url.search||url.hash||url.username||url.password)return '';
 }catch{return '';}
 return configuredFactory;
}
export function selectedMintFactory({storedFactory='',startupFactory='',automatic=true}={}){
 return automatic&&startupFactory?startupFactory:storedFactory;
}
