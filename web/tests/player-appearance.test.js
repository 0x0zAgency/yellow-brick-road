import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultTheme,PRESETS,encodeTheme,decodeTheme,APPEARANCE_KEY} from '../src/appearance.js';
import {PLAYER_APPEARANCE_KEY,loadPlayerAppearance,savePlayerAppearance,playerThemeVariables,workspaceUrl} from '../src/player-appearance.js';
import {coverSourceMime,prepareNftCover} from '../src/raster-display.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),data};};
test('Player uses the existing portable theme format and every shared semantic color',()=>{
 for(const preset of PRESETS){assert.deepEqual(decodeTheme(encodeTheme(preset)),preset);const vars=playerThemeVariables(preset);for(const [name,color] of Object.entries(preset.colors))assert.equal(vars['--road-'+name],color);assert.equal(vars['--road-background-image'],'none');}
 const theme=defaultTheme();theme.overrides.edcb80='#123456';assert.deepEqual(decodeTheme(encodeTheme(theme)).overrides,theme.overrides);
});
test('saving Player appearance cannot modify workspace, rights, playback or recovery storage',()=>{
 const s=storage();for(const key of [APPEARANCE_KEY,'road:structures:v1','road:vault','ybr:continuous-play'])s.setItem(key,'keep');
 savePlayerAppearance(s,{active:PRESETS[1],themes:[PRESETS[1]]});assert.deepEqual(loadPlayerAppearance(s).active,PRESETS[1]);
 assert.equal(s.data.size,5);for(const key of [APPEARANCE_KEY,'road:structures:v1','road:vault','ybr:continuous-play'])assert.equal(s.getItem(key),'keep');assert.ok(s.getItem(PLAYER_APPEARANCE_KEY));
});
test('blocked or corrupt Player storage fails safely without deleting or writing anything',()=>{
 const s=storage();s.setItem(PLAYER_APPEARANCE_KEY,'not json');assert.match(loadPlayerAppearance(s).notice,/could not be read/);assert.equal(s.getItem(PLAYER_APPEARANCE_KEY),'not json');
 assert.equal(loadPlayerAppearance(null).active.name,'Original Gold');
 assert.throws(()=>savePlayerAppearance({setItem(){throw Error('quota');}},{active:defaultTheme(),themes:[]}),/Nothing was saved/);
});
test('unknown fields, code, external graphics and unchecked color values cannot reach CSS',()=>{
 for(const patch of [{colors:{...defaultTheme().colors,accent:'url(https://example.invalid)'}},{graphics:{logo:'data:image/svg+xml,<svg/>',background:null,placeholder:null}},{rpcUrl:'https://rpc.example'}])assert.throws(()=>playerThemeVariables({...defaultTheme(),...patch}));
 assert.equal(workspaceUrl('https:'),'https://127.0.0.1:5173/');assert.equal(workspaceUrl('http:'),'http://127.0.0.1:5173/');assert.throws(()=>workspaceUrl('javascript:'));
});
test('standalone rasterizer is callable without any vault or wallet dependency',()=>{
 assert.equal(coverSourceMime(new Uint8Array([255,216,255,0])),'image/jpeg');assert.equal(typeof prepareNftCover,'function');assert.throws(()=>coverSourceMime(new TextEncoder().encode('<svg></svg>')),/not SVG/);
});
