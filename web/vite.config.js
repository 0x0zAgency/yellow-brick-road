import {workspaceThemeCss} from './appearance-css.js';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {Agent} from 'node:https';
import httpsTools from '../scripts/dev-https.cjs';
const root=fileURLToPath(new URL('..',import.meta.url));
// No certificate contents or private paths are exposed as VITE_ variables.
export default defineConfig(({command})=>{
 const tls=command==='serve'?httpsTools.loadHttps(root):null;
 const bridge={target:'http://127.0.0.1:8791',changeOrigin:false};
 const publicMusic={target:(tls?'https':'http')+'://127.0.0.1:4173',changeOrigin:false,
  ...(tls?{agent:new Agent({ca:tls.ca}),secure:true}:{})};
 return {plugins:[react()],css:{postcss:{plugins:[workspaceThemeCss()]}},worker:{format:'es'},
  server:{host:'127.0.0.1',port:5173,strictPort:true,...(tls?{https:tls}:{}),
   // These paths must never be accessible through Vite's filesystem route.
   fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.road-local/**']},
   proxy:{'/api/road-ipfs':bridge,'/api/player-publish':publicMusic,'/road':publicMusic}},
  preview:{host:'127.0.0.1',port:4174}};
});
