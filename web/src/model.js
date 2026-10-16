export function filterBricks(bricks,search="",type="All works"){
 const q=search.trim().toLowerCase();
 return bricks.filter(b=>(type==="All works"||b.category===type)&&(!q||[b.title,b.creator,b.kind].some(x=>String(x).toLowerCase().includes(q))));
}
export function members(building,bricks){return building.members.map(id=>bricks.find(b=>b.id===id)).filter(Boolean)}
export function feeCap(amount,feeBps,remaining){
 const gross=Math.max(0,Math.floor(Number(amount)||0));
 const bps=Math.max(0,Math.floor(Number(feeBps)||0));
 if(bps>10000)throw new RangeError("basis points too high");
 return Math.min(Math.floor(gross*bps/10000),Math.max(0,Math.floor(Number(remaining)||0)));
}
export function split(gross,creatorBps){const value=Math.max(0,Math.floor(gross));const first=Math.floor(value*creatorBps/10000);return [first,value-first]}
export function money(value,decimals=0){return Number(value).toLocaleString("en-US",{style:"currency",currency:"USD",minimumFractionDigits:decimals,maximumFractionDigits:decimals})}
export function makeDraft(form,id){return {id,title:form.title.trim(),creator:form.creator.trim(),category:form.category,kind:"Local draft",tone:"draft",use:0,amount:0,ref:"Not deployed",detail:form.detail.trim(),draft:true}}
