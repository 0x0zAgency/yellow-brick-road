/** Build-time CSS variables with exact original fallbacks. No runtime CSS evaluation. */
export function themeCssValue(value){
 if(value.includes('--road-palette-'))return value;
 // Leave quoted strings and URLs untouched, including SVG data and URL fragments.
 return value.replace(/url\((?:[^()"']|"[^"]*"|'[^']*')*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[a-f\d]{3,8}\b/gi,part=>{
  if(!/^#[a-f\d]+$/i.test(part)||![4,5,7,9].includes(part.length))return part;
  let hex=part.slice(1).toLowerCase();if(hex.length<5)hex=[...hex].map(c=>c+c).join('');
  return 'var(--road-palette-'+hex+','+part+')';
 });
}
export function workspaceThemeCss(){return {postcssPlugin:'ybr-workspace-appearance',Declaration(decl){
 const file=String(decl.source?.input?.file||'').replace(/\\/g,'/');
 if(!/\/web\/src\/[^/]+\.css$/.test(file)||file.endsWith('/settings.css'))return;
 decl.value=themeCssValue(decl.value);
}};}
