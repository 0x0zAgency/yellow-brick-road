import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The local bridge exposes encrypted upload, pinned-ciphertext recovery and health checks.
// Never forward the browser to Kubo's unrestricted administrator API.
// Public Road Music endpoints are proxied to the separately running YBR Player.
const bridge={target:'http://127.0.0.1:8791',changeOrigin:false};
const publicMusic={target:'http://127.0.0.1:4173',changeOrigin:false};
export default defineConfig({plugins:[react()],server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api/road-ipfs':bridge,'/api/player-publish':publicMusic,'/road':publicMusic}},preview:{host:'127.0.0.1',port:4174}});
