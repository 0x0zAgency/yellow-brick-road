import {createPublicClient,http} from 'viem';
import profileTools from '../../../scripts/dev-network-profile.cjs';
import {createLicensingService} from './service.js';
import {json} from '../../src/licensing/protocol.js';

export function licensingPlugin(root){
 let service;
 const load=()=>service ||= (async()=>{const profile=profileTools.readActiveProfile(root);return createLicensingService({root,profile,client:createPublicClient({transport:http(profile.rpcUrl,{retryCount:0,timeout:10000})})});})().catch(error=>{service=null;throw error;});
 const install=server=>{server.middlewares.use(async(req,res,next)=>{
  if(!req.url?.startsWith('/api/licensing/'))return next();
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
   const protocol=req.socket.encrypted?'https':'http',origin=protocol+'://'+req.headers.host,host=new URL(origin).hostname;
   const configured=process.env.YBR_LICENSING_ORIGIN;
   if(configured?origin!==new URL(configured).origin:!['localhost','127.0.0.1','[::1]'].includes(host))throw Object.assign(Error('Licensing requests must use this deployment’s configured origin.'),{status:403});
   if(req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'||req.method!=='GET'&&req.headers.origin!==origin)throw Object.assign(Error('Cross-origin licensing request denied.'),{status:403});
   if(!['GET','POST'].includes(req.method))throw Object.assign(Error('Unsupported method.'),{status:405});
   let body={};if(req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('JSON required.'),{status:415});
    let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>65536)throw Object.assign(Error('Request too large.'),{status:413});chunks.push(chunk);}
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(Error('Invalid JSON.'),{status:400});}
    if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(Error('JSON object required.'),{status:400});
   }
   const api=await load(),result=await api.dispatch({method:req.method,path:req.url.slice('/api/licensing'.length),body,origin,authorization:req.headers.authorization?.replace(/^Bearer /,''),csrfToken:req.headers['x-ybr-csrf']});
   res.statusCode=200;res.end(json(result));
  }catch(error){res.statusCode=error.status||400;const safe=error.shortMessage?'Chain request failed. Check Dev Control and refresh.':error.code?'Licensing storage or network is unavailable. Check the local deployment.':String(error.message).split('\n')[0];res.end(json({error:safe.slice(0,400)}));}
 });};
 return {name:'ybr-project-licensing',configureServer:install,configurePreviewServer:install};
}
