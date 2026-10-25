import {themeCssValue,workspaceThemeCss} from '../appearance-css.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {APPEARANCE_KEY,PALETTE,BASE_COLORS,ICON_FIELDS,PRESETS,defaultTheme,validateTheme,decodeTheme,encodeTheme,loadAppearance,saveAppearance,saveNamedTheme,themeVariables,paletteValue,contrastRatio,validateGraphic} from '../src/appearance.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),m};};
test('default retains every original color exactly; presets validate without mutating originals',()=>{
 for(const color of PALETTE)assert.equal(paletteValue(defaultTheme(),color),'#'+color);
 for(const t of PRESETS)assert.deepEqual(validateTheme(t),t);
 assert.equal(new Set(PALETTE).size,PALETTE.length);
});
test('workspace colors get exact CSS-variable fallbacks; quotes, URLs and other CSS stay untouched',()=>{
 const dir=new URL('../src/',import.meta.url);
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.css')&&n!=='settings.css')){
  const css=fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
  for(const [literal] of css.matchAll(/#[a-f\d]{3,8}\b/gi)){
   let c=literal.slice(1).toLowerCase();if(c.length<5)c=[...c].map(x=>x+x).join('');
   assert.ok(PALETTE.includes(c),name+': add new colors to appearance-palette.js');
   assert.equal(themeCssValue(literal),'var(--road-palette-'+c+','+literal+')');
  }
 }
 const value='linear-gradient(#fff, #0008)';assert.equal(themeCssValue(themeCssValue(value)),themeCssValue(value));
 for(const value of ['url("sprite.svg#fff")','"#abc"',"url('data:image/svg+xml,<svg fill=\"#fff\"/>')"] )assert.equal(themeCssValue(value),value);
 const plugin=workspaceThemeCss(),decl={value:'#fff',source:{input:{file:'/repo/web/src/styles.css'}}};plugin.Declaration(decl);assert.match(decl.value,/road-palette/);
 for(const path of ['/repo/web/src/settings.css','/repo/node_modules/pkg/styles.css']){const d={value:'#fff',source:{input:{file:path}}};plugin.Declaration(d);assert.equal(d.value,'#fff');}
});
test('exact shade override takes precedence and changing one role leaves other defaults intact',()=>{
 const t=defaultTheme();t.colors.accent='#00ffcc';t.overrides.edcb80='#ff00aa88';
 assert.equal(paletteValue(t,'edcb80'),'#ff00aa88');assert.equal(paletteValue(t,'0c1015'),'#0c1015');
 const v=themeVariables(t);assert.equal(v['--road-accent'],'#00ffcc');assert.equal(v['--road-background-image'],'none');
 assert.equal(Object.keys(v).length,PALETTE.length+Object.keys(BASE_COLORS).length+2);
});
test('saved themes round-trip appearance only and isolated storage is not cleared',()=>{
 const s=storage();s.setItem('road:structures:v1','keep');s.setItem('road:mint:network:v1','keep');
 const theme=defaultTheme();theme.name='Artist / Puerto Rico';theme.icons.mint='disc';
 saveAppearance(s,{active:theme,themes:[theme]});assert.deepEqual(loadAppearance(s).active,theme);
 assert.deepEqual(decodeTheme(encodeTheme(theme)),theme);
 assert.equal(s.m.get('road:structures:v1'),'keep');assert.equal(s.m.get('road:mint:network:v1'),'keep');
 assert.doesNotMatch(encodeTheme(theme),/privateKey|mnemonic|factoryAddress|recoveryKey/);
});
test('bad, unavailable and future-version local settings show a safe fallback without writes',()=>{
 const s=storage();s.setItem(APPEARANCE_KEY,'{"version":2,"active":{}}');
 assert.match(loadAppearance(s).notice,/could not be read/);assert.equal(s.getItem(APPEARANCE_KEY),'{"version":2,"active":{}}');
 assert.equal(loadAppearance({getItem(){throw Error('blocked');}}).active.name,'Original Gold');
 assert.equal(loadAppearance(null).active.name,'Original Gold');
});
test('quota errors are reported and never clear other browser data',()=>{
 assert.throws(()=>saveAppearance({setItem(){throw Error('quota');}},{active:defaultTheme(),themes:[]}),/Nothing was saved/);
 assert.throws(()=>saveAppearance(null,{active:defaultTheme(),themes:[]}),/unavailable/);
});
test('theme imports reject code, external references, unknown fields and prototype keys',()=>{
 const unsafe=[t=>t.colors.accent='url(https://bad.example)',t=>t.colors.text='red; background:url(x)',t=>t.icons.mint='<svg onload=alert(1)>',t=>t.graphics.logo='https://bad.example/x.png',t=>t.graphics.background='data:image/svg+xml,<svg/>',t=>t.rpcUrl='https://rpc.example',t=>t.overrides['__proto__']=null];
 for(const mutate of unsafe){const t=JSON.parse(JSON.stringify(defaultTheme()));mutate(t);if(!Object.hasOwn(t.overrides,'__proto__')&&Object.getPrototypeOf(t.overrides)===null)assert.throws(()=>validateTheme(t));else assert.throws(()=>validateTheme(t));}
 const proto=JSON.parse(encodeTheme(defaultTheme()).replace('"overrides": {}','"overrides": {"__proto__": {"polluted": true}}'));assert.throws(()=>decodeTheme(JSON.stringify(proto)));assert.equal({}.polluted,undefined);
 assert.throws(()=>decodeTheme('{bad'),/valid/);assert.throws(()=>decodeTheme(' '.repeat(1024*1024+1)),/exceeds/);
});
test('malformed image bytes, extreme sizes and wrong color formats are refused',()=>{
 assert.throws(()=>validateGraphic('data:image/png;base64,'+btoa('<script>bad</script>')),/PNG/);
 const t=defaultTheme();t.colors.background='#123';assert.throws(()=>validateTheme(t),/hex/);
 t.colors.background='#123456';t.backgroundOpacity=NaN;assert.throws(()=>validateTheme(t),/preferences/);
});
test('named themes are bounded, case-insensitive replacements do not grow the list',()=>{
 let list=[];for(let i=0;i<8;i++)list=saveNamedTheme(list,{...defaultTheme(),name:'Theme '+i});
 list=saveNamedTheme(list,{...defaultTheme(),name:'theme 0',colors:{...BASE_COLORS,accent:'#112233'}});assert.equal(list.length,8);assert.equal(list[0].colors.accent,'#112233');
 assert.throws(()=>saveNamedTheme(list,{...defaultTheme(),name:'Ninth'}),/eight/);
 assert.throws(()=>saveAppearance(storage(),{active:defaultTheme(),themes:[defaultTheme(),defaultTheme()]}),/unique/);
});
test('only installed icons and documented display preferences are accepted',()=>{
 for(const [slot] of Object.entries(ICON_FIELDS)){const t=defaultTheme();t.icons[slot]='leaf';assert.equal(validateTheme(t).icons[slot],'leaf');}
 const t=defaultTheme();t.reduceMotion='false';assert.throws(()=>validateTheme(t),/preferences/);
});
test('contrast calculation agrees with black/white extrema and all presets have readable primary pairs',()=>{
 assert.equal(contrastRatio('#000000','#ffffff'),21);assert.equal(contrastRatio('#123456','#123456'),1);
 for(const t of PRESETS){assert.ok(contrastRatio(t.colors.text,t.colors.surface)>=4.5,t.name);assert.ok(contrastRatio(t.colors.onAccent,t.colors.accent)>=4.5,t.name);}
});
