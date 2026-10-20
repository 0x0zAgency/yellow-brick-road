import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The local upload bridge implements ONLY encrypted upload and health checks.
// Never forward the browser to Kubo's unrestricted administrator API.
const bridge={target:'http://127.0.0.1:8791',changeOrigin:false};
export default defineConfig({plugins:[react()],server:{host:'127.0.0.1',port:5173,proxy:{'/api/road-ipfs':bridge}},preview:{host:'127.0.0.1',port:4173}});
