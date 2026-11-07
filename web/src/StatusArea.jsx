import {AlertCircle,CheckCircle2} from 'lucide-react';
import RoadProgress from './RoadProgress.jsx';
import './status-area.css';

/** Keep mounted: pending, idle and error states share the same space. */
export default function StatusArea({busy=false,label='Working…',message='',error='',detail='',value,max,size='compact',name='Operation status',className='',children}){
 const pending=!!busy,failed=!pending&&!!error;
 const text=pending?label:error||message;
 const measured=pending&&Number.isFinite(value)&&Number.isFinite(max??100)&&(max??100)>0;
 return <div className={'status-area status-area--'+size+' '+className} role="group" aria-label={name} data-state={pending?'busy':failed?'error':text?'ready':'idle'}>
  <span className="status-area-indicator" aria-hidden={pending?undefined:true}>
   {pending?<RoadProgress size="tiny" hideLabel label={label} value={value} max={max}/>:text?(failed?<AlertCircle size={20}/>:<CheckCircle2 size={20}/>):null}
  </span>
  <div className="status-area-copy" role={failed?'alert':'status'} aria-atomic="true" tabIndex={text||children?0:undefined}>
   {text&&<span>{text}{measured&&<span className="status-area-percent"> · {Math.floor(Math.max(0,Math.min(100,value/(max??100)*100)))}%</span>}</span>}
   {detail&&<small>{detail}</small>}{children}
  </div>
 </div>;
}
