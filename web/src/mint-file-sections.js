/** Presentation-only grouping for Step 02.
 * Keep file slots and packet processing independent from visual headings.
 */
export function uploadSectionBefore(slotId,category){
 const isMusic=category?.group==='Music & audio';
 if(slotId==='master'){
  return {title:'Primary work',description:'Attach the original work. This is the only universally required upload.'};
 }
 if(isMusic&&slotId==='artwork'){
  return {title:'Cover artwork',description:'Optional visual artwork. Identify its creator and rights in Step 03.'};
 }
 if(isMusic&&slotId==='lyrics'){
  return {title:'Lyrics & songwriting',description:'Optional lyrics or writing evidence. These can be associated with a separate composition Brick.'};
 }
 if(slotId==='project'){
  return {title:'Project files & metadata',description:'Optional supporting source files and metadata sidecars.'};
 }
 return null;
}
