'use strict';
/** Share only public presentation code, not an arbitrary workspace-file route. */
const path=require('node:path');
const names=Object.freeze(['appearance.js','appearance-palette.js','appearance-graphics.js',
 'nft-cover-format.js','raster-display.js','player-appearance.js']);
const assets=new Map(names.map(name=>['/appearance/'+name,path.resolve(__dirname,'../../web/src',name)]));
function appearanceAsset(route){return assets.get(route)||null;}
module.exports={appearanceAsset};
