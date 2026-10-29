import {useState} from 'react';
import {loadCreatorDefaults,saveCreatorDefaults,defaultCreatorDefaults} from './creator-defaults.js';
import {trainingModes} from './mint-model.js';
export default function CreatorDefaultsSettings(){
 const [saved,setSaved]=useState(()=>loadCreatorDefaults(window.localStorage)),[value,setValue]=useState(saved),[message,setMessage]=useState(''),[error,setError]=useState('');
 const change=patch=>{setValue(old=>({...old,...patch}));setMessage('');setError('');};
 const policy=(key,checked)=>change({contentPolicy:{...value.contentPolicy,[key]:checked}});
 const save=()=>{try{const next=saveCreatorDefaults(window.localStorage,value);setSaved(next);setValue(next);setError('');setMessage('Creator defaults saved. They apply when you open Mint Studio or start another work.');}catch(e){setError(e.message);}};
 return <form className="settings-card" aria-label="Creator defaults" onSubmit={e=>{e.preventDefault();save();}}>
  <h3>Creator defaults</h3><p>Choose the starting approvals and licensing values for new registrations. Review and change them per work before confirming the mint.</p>
  <label className="settings-toggle"><input type="checkbox" role="switch" checked={value.enabled} onChange={e=>change({enabled:e.target.checked})}/><span>Use saved defaults and pre-check approvals</span></label>
  <fieldset className="creator-default-fields" disabled={!value.enabled}>
   <legend>Player delivery &amp; content</legend>
   <label className="settings-toggle"><input type="checkbox" checked={value.delivery} onChange={e=>change({delivery:e.target.checked})}/><span>Deliver to YBR-compatible Players by default</span></label>
   <p>Current delivery sends permitted preview copies to your local YBR Player after mint. New registrations preselect this choice when an Audio Preview is attached; you can turn it off in Step 3.</p>
   {[["preview","Allow Audio Preview playback by default"],["artwork","Allow artwork display by default"],["lyrics","Allow lyrics display by default"],["locked","Content locked by default"]].map(([key,label])=><label key={key} className="settings-toggle"><input type="checkbox" checked={value.contentPolicy[key]} onChange={e=>policy(key,e.target.checked)}/><span>{label}</span></label>)}
   {value.contentPolicy.locked&&<p><strong>Content locking is permanent after mint.</strong> Review the file set before confirming. Playback permissions remain revocable.</p>}
  </fieldset>
  <fieldset className="creator-default-fields" disabled={!value.enabled}>
   <legend>Licensing defaults</legend>
   <label>Default licensor email<input type="email" maxLength={254} autoComplete="email" value={value.licensingEmail} onChange={e=>change({licensingEmail:e.target.value})} placeholder="licensing@example.com"/></label>
   <p>This optional contact is published on each new Brick. Use a public licensing address; it can be changed per work and later by the Brick controller.</p>
   <label>Default AI training policy<select aria-label="Default AI training policy" value={value.training} onChange={e=>change({training:e.target.value})}>{trainingModes.map(mode=><option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>
   <label className="settings-toggle"><input type="checkbox" checked={value.composition} onChange={e=>change({composition:e.target.checked})}/><span>Create a separate songwriting Brick by default</span></label>
   <label>Default creator payout share (%)<input type="number" min="0" max="100" step="1" value={value.share/100} onChange={e=>change({share:Math.round(Number(e.target.value)*100)})}/></label>
   <label>Default licensing currency<select aria-label="Default licensing currency" value={value.currency} onChange={e=>change({currency:e.target.value})}><option>USDC</option><option>USD</option></select></label>
   <label>Default use-fee unit<select aria-label="Default use-fee unit" value={value.unit} onChange={e=>change({unit:e.target.value})}><option value="per-1000-outputs">Per 1,000 outputs</option><option value="per-output">Per output</option><option value="per-model-deployment">Per model deployment</option></select></label>
   {[["masterIngestionCents","Sound recording ingestion fee"],["masterUseCents","Sound recording use fee"],["writingIngestionCents","Songwriting ingestion fee"],["writingUseCents","Songwriting use fee"]].map(([key,label])=><label key={key}>{label} ({value.currency})<input type="number" min="0" max={key.includes('Ingestion')?'1000':'250'} step="0.01" value={value.fees[key]/100} onChange={e=>change({fees:{...value.fees,[key]:Math.round(Number(e.target.value)*100)}})}/></label>)}
   <p>These are proposed licensing terms. The mint review still requires confirmation.</p>
  </fieldset>
  <div className="settings-buttons"><button type="submit" className="settings-primary">Save creator defaults</button><button type="button" onClick={()=>{setValue(saved);setError('');setMessage('Unsaved creator changes discarded.');}}>Discard creator changes</button><button type="button" onClick={()=>{setValue(defaultCreatorDefaults());setError('');setMessage('Defaults reset in this form. Save to apply.');}}>Reset creator defaults</button></div>
  {JSON.stringify(value)!==JSON.stringify(saved)&&<small>Unsaved creator defaults</small>}
  {error&&<p role="alert" className="settings-error">{error}</p>}{message&&<p role="status" className="settings-message">{message}</p>}
 </form>;
}
