/** Small installed vector set. Theme data selects a name, never arbitrary SVG. */
const PATHS={
 book:['M3 4h6l3 2 3-2h6v15h-6l-3 2-3-2H3Z','M12 6v15'],
 dashboard:['M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z'],
 music:['M9 18V5l11-2v13','M9 18a3 3 0 1 1-3-3h3 M20 16a3 3 0 1 1-3-3h3'],
 wallet:['M3 6h17v14H3Z M3 6V4h14v2 M16 11h6v5h-6Z'],
 file:['M5 2h9l5 5v15H5Z M14 2v6h5 M8 12h8 M8 16h8'],
 bricks:['M2 4h9v7H2Z M13 4h9v7h-9Z M2 13h9v7H2Z M13 13h9v7h-9Z'],
 building:['M4 22V2h16v20 M8 6h2 M14 6h2 M8 10h2 M14 10h2 M8 14h2 M14 14h2 M10 22v-4h4v4'],
 coins:['M3 6c0-4 18-4 18 0s-18 4-18 0Z M3 6v6c0 4 18 4 18 0V6 M3 12v6c0 4 18 4 18 0v-6'],
 shield:['M12 2 3 6v7c0 5 9 9 9 9s9-4 9-9V6Z M7 12l3 3 7-7'],
 network:['M9 3h6v6H9Z M2 16h6v6H2Z M16 16h6v6h-6Z M12 9v4 M5 16v-3h14v3'],
 settings:['M4 3v18 M12 3v18 M20 3v18 M1 8h6 M9 16h6 M17 9h6'],
 image:['M3 3h18v18H3Z M3 17l6-7 5 5 3-3 4 5 M16 7h.01'],
 sparkles:['M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z'],
 disc:['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
 headphones:['M3 15v-3a9 9 0 0 1 18 0v3 M3 12h4v9H3Z M17 12h4v9h-4Z'],
 folder:['M2 5h8l2 3h10v12H2Z'],
 palette:['M12 2a10 10 0 1 0 0 20h2c3 0 3-4 0-4h-1c-2 0-2-4 0-4h7c4 0 1-10-8-10Z M6 10h.01 M8 6h.01 M13 5h.01 M17 7h.01'],
 leaf:['M21 3C2 0-3 20 9 21c10 1 13-10 12-18Z M3 23 17 9']
};
export function playerIcon(name,weight=1.75){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'20',height:'20',fill:'none',stroke:'currentColor','stroke-width':String(weight),'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);
 for(const d of PATHS[name]||PATHS.bricks){const p=document.createElementNS(ns,'path');p.setAttribute('d',d);svg.append(p);}
 return svg;
}

// Replace only installed fallback glyphs. Authorized image children are never removed.
let placeholder={name:'image',weight:1.75};
function refreshPlaceholderIcons(){
 const {name,weight}=placeholder,key=name+':'+weight;
 for(const host of document.querySelectorAll('.track-thumbnail,.mini-cover,.inspector-cover .cover-emblem')){
  let glyph=host.querySelector(':scope > .player-placeholder-icon');
  if(!glyph){
   for(const child of [...host.childNodes])if(child.nodeType===Node.TEXT_NODE)child.remove();
   if(host.classList.contains('mini-cover')||host.classList.contains('cover-emblem'))for(const child of [...host.children])if(child.tagName==='SPAN'&&!child.classList.contains('release-cover-image'))child.remove();
   glyph=document.createElement('span');glyph.className='player-placeholder-icon';glyph.setAttribute('aria-hidden','true');host.prepend(glyph);
  }
  if(glyph.dataset.icon!==key){glyph.replaceChildren(playerIcon(name,weight));glyph.dataset.icon=key;}
 }
}
export function applyPlaceholderIcon(name,weight){placeholder={name,weight};refreshPlaceholderIcons();}
for(const event of ['ybr:library','ybr:selection'])window.addEventListener(event,()=>queueMicrotask(refreshPlaceholderIcons));
