/** Reveal only a newly selected wizard step, never an ordinary form update.
 * Wait for overlays/inert content to clear before scrolling or moving focus.
 * scrollIntoView also handles an embedded/nested scroll container.
 */
export function createMintStepNavigator(initialStep){
 let visibleStep=initialStep;
 return ({step,blocked=false,panel})=>{
  if(step===visibleStep||blocked||!panel||panel.closest('[inert]'))return false;
  const heading=panel.querySelector('h2');
  if(!heading)return false;
  heading.setAttribute('tabindex','-1');
  panel.scrollIntoView({behavior:'instant',block:'start',inline:'nearest'});
  heading.focus({preventScroll:true});
  visibleStep=step;
  return true;
 };
}
