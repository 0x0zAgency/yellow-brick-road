import './road-progress.css';

const BRICKS=Array.from({length:17},(_,index)=>({
 row:index===16?1:index%2,
 column:index===16?7.5:Math.floor(index/2)-(index%2?0.5:0)
}));

/** A building road for unknown waits; fill only from a measured value, never a timer. */
export default function RoadProgress({label='Working…',value,max=100,size='normal',hideLabel=false,className=''}){
 const measured=typeof value==='number'&&Number.isFinite(value)&&typeof max==='number'&&Number.isFinite(max)&&max>0;
 const percent=measured?Math.max(0,Math.min(100,value/max*100)):null;
 const filled=measured?Math.floor(percent/100*BRICKS.length):0;
 return <span className={'road-progress road-progress--'+(measured?'measured':'waiting')+' road-progress--'+size+' '+className}>
  <span className="road-progress-bed" role="progressbar" aria-label={label} aria-valuemin={measured?0:undefined} aria-valuemax={measured?100:undefined} aria-valuenow={measured?Number(percent.toFixed(2)):undefined}>
   {BRICKS.map(({row,column},index)=><span key={index} className={'road-progress-slot'+(index<filled?' is-built':'')} style={{'--road-row':row,'--road-column':column,'--road-order':index}} aria-hidden="true"><i className="road-progress-brick"/></span>)}
  </span>
  {!hideLabel&&<span className="road-progress-caption"><span role="status">{label}</span>{measured&&<span className="road-progress-value" aria-hidden="true">{Math.floor(percent)}%</span>}</span>}
 </span>;
}
