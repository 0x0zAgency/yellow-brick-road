'use strict';
// Artwork geometry is Player presentation data, not a provenance or licensing schema.
(function(root){
 const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):min));
 function region(value){
  const x=clamp(value.x,0,.98),y=clamp(value.y,0,.98);
  return {brickId:String(value.brickId||''),x,y,width:clamp(value.width,.02,1-x),height:clamp(value.height,.02,1-y)};
 }
 function gain(pixel,cursor,sensitivity=.25){
  const p=region(pixel),x=clamp(cursor.x),y=clamp(cursor.y);
  const distance=Math.hypot(Math.max(p.x-x,0,x-p.x-p.width),Math.max(p.y-y,0,y-p.y-p.height));
  return clamp(1-distance/clamp(sensitivity,.02,1));
 }
 function gains(pixels,cursor,pins=new Map(),sensitivity=.25){
  const raw=pixels.map((p,i)=>pins.has(i)?clamp(pins.get(i)):gain(p,cursor,sensitivity));
  // Limit aggregate gain so overlapping regions cannot multiply the master volume.
  const total=Math.max(1,raw.reduce((sum,v)=>sum+v,0));return raw.map(v=>v/total);
 }
 function decode(value,allowed){
  if(value?.format!=='ybr-player-artwork-layout/1'||!Array.isArray(value.regions)||!value.regions.length||value.regions.length>8)throw Error('Choose a layout with 1–8 sound regions.');
  if(typeof value.artworkBrickId!=='string'||!allowed.has(value.artworkBrickId))throw Error('The artwork release is unavailable in this session.');
  const seen=new Set();
  const regions=value.regions.map(p=>{
   if(!p||typeof p.brickId!=='string'||!allowed.has(p.brickId)||seen.has(p.brickId))throw Error('Layout sounds must be distinct playable Bricks in this session.');
   for(const key of ['x','y','width','height'])if(typeof p[key]!=='number'||!Number.isFinite(p[key]))throw Error('Invalid sound region geometry.');
   seen.add(p.brickId);return region(p);
  });
  return {format:value.format,artworkBrickId:value.artworkBrickId,regions};
 }
 function waypoint(pattern,step,random=Math.random){
  const box=[{x:.15,y:.15},{x:.85,y:.15},{x:.85,y:.85},{x:.15,y:.85}];
  const diagonal=[box[0],box[2],box[1],box[3],{x:.5,y:.5}];
  return pattern==='box'?box[step%4]:pattern==='diagonal'?diagonal[step%5]:{x:.1+random()*.8,y:.1+random()*.8};
 }
 const api={clamp,region,gain,gains,decode,waypoint};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.YBRArtworkModel=api;
})(globalThis);
