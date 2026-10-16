import {ArrowRight,ArrowUpRight,BookOpen,Blocks,BrainCircuit,Camera,CheckCircle2,Coins,Database,Fingerprint,GitBranch,Globe2,HeartHandshake,Layers3,Link2,Music2,Network,ShieldCheck,Sparkles,WandSparkles} from 'lucide-react';
import './manifesto.css';

const story=[
 {id:'why',name:'01 / WHY',title:'The missing layer',intro:'The internet moves information. The Road is built to preserve the rights that should move with it.'},
 {id:'what',name:'02 / WHAT',title:'A language for intellectual property',intro:'Three primitives give IP an identity, the context of its use, and a way to communicate across systems.'},
 {id:'how',name:'03 / HOW',title:'Objects that can explain their rights',intro:'Every work can identify itself, communicate permissions, and account for value without making each platform invent a new system.'},
 {id:'where',name:'04 / WHERE',title:'A new creative economy',intro:'A fairer, more transparent economy for everyone who contributes to what people and machines create.'}
];
const aiFlow=[
 {n:'01',title:'Original IP',sub:'A photograph, song, text or other Yellow Brick',icon:Camera},
 {n:'02',title:'Licensed training',sub:'Dataset Building records authorized sources, conditions and provenance',icon:Database},
 {n:'03',title:'Rights-native model',sub:'Model lineage retains the source manifest and license obligations',icon:BrainCircuit},
 {n:'04',title:'Generation and reuse',sub:'Auditable use under the applicable model and source agreements',icon:WandSparkles},
 {n:'05',title:'Attribution and royalties',sub:'Agreed allocation to eligible contributing rights holders',icon:Coins}
];
const concepts=[
 {label:'YELLOW BRICK',title:'Identity',icon:Fingerprint,desc:'The work itself. A song, image, manuscript, code or design, with an independent address and rights record.',foot:'What is the IP?'},
 {label:'BUILDING',title:'Context',icon:Layers3,desc:'The way IP participates in an album, book, compilation, photograph, dataset, model or another structured use.',foot:'What is the IP doing?'},
 {label:'THE ROAD',title:'Interoperability',icon:Network,desc:'The shared protocol through which objects, permissions, relationships and settlements become understandable.',foot:'How does IP communicate?'}
];
export default function Manifesto({onMint,onExplore,originalText}){
 return <article className="mf">
  <section className="mf-hero">
   <span className="mf-overline"><span className="mf-live-dot"/> THE YELLOW BRICK ROAD / MANIFESTO</span>
   <h2>The internet is missing <em>an IP layer.</em></h2>
   <p className="mf-lead">The asset carries the rights. <strong>Not the platform.</strong></p>
   <p className="mf-hero-copy">Creative work should never lose its identity, history or ability to participate in the value it creates. We're building the shared protocol for a fair and transparent creative economy, ready for the AI era.</p>
   <div className="mf-actions"><button className="mf-cta" onClick={onMint}>Start with a Yellow Brick <ArrowRight size={17}/></button><a className="mf-ghost" href="#mf-original">Read the founding manifesto <ArrowUpRight size={16}/></a></div>
   <div className="mf-hero-mark" aria-hidden="true"><span/><span/><span/><span/><span/><span/><span/><span/><span/></div>
  </section>
  <nav className="mf-index" aria-label="Manifesto sections">{story.map(s=><a href={'#mf-'+s.id} key={s.id}><span>{s.name}</span><strong>{s.title}</strong><ArrowUpRight size={15}/></a>)}</nav>
  <section id="mf-why" className="mf-section">
   <div className="mf-overline">01 / WHY</div><h2>Information travels.<br/><em>Rights get left behind.</em></h2>
   <p className="mf-prose">An image can be copied, a song sampled, a book digitized and an entire archive used to train AI. The content moves, but the information that makes it property often does not. Ownership claims, provenance, permissions, attribution and compensation are fragmented across platforms.</p>
   <blockquote className="mf-pullquote">“This isn’t a legal failure. It’s a design failure.”<small>THE AI RIGHTS OBJECT STANDARD</small></blockquote>
   <div className="mf-chips"><span>Persistent identity</span><span>Verifiable provenance</span><span>Machine-readable rights</span><span>Attribution</span><span>Programmable settlement</span></div>
  </section>
  <section id="mf-what" className="mf-section">
   <div className="mf-overline">02 / WHAT</div><h2>Bricks. Buildings.<br/><em>The Road.</em></h2>
   <p className="mf-prose">The Road is not a marketplace, a record label or an AI platform. It is an open language for rights-aware intellectual property. Its architecture starts with three concepts.</p>
   <div className="mf-triad">{concepts.map((c,i)=>{const I=c.icon;return <div className="mf-triad-card" key={c.label}><div className="mf-triad-head"><span>{c.label}</span><I size={26}/></div><h3>{c.title}</h3><p>{c.desc}</p><strong>{c.foot}</strong>{i<2&&<div className="mf-triad-arrow"><ArrowRight size={18}/></div>}</div>})}</div>
   <div className="mf-example"><Music2 size={22}/><div><strong>Example: a finished song</strong><p>The master recording, musical composition and cover artwork each have their own identity. An album Building describes their roles in a release. A training dataset Building describes a different use of those same works, under separately authorized terms.</p></div></div>
  </section>
  <section id="mf-how" className="mf-section">
   <div className="mf-overline">03 / HOW</div><h2>Let the work <em>speak for itself.</em></h2>
   <div className="mf-questions">{[['01','Who owns me?','Identity, provenance and rights claims'],['02','How may I be used?','Machine-readable licenses and contextual permissions'],['03','What is owed and to whom?','Attribution, allocation and auditable settlement']].map(q=><div key={q[0]}><span>{q[0]}</span><h3>{q[1]}</h3><p>{q[2]}</p></div>)}</div>
   <div className="mf-flow-title"><div><span className="mf-overline">AI RIGHTS / THE CONTINUITY OF CREATIVE WORK</span><h3>From training source to creative value</h3><p>The training record should not erase the work that made the model possible.</p></div><BrainCircuit size={35}/></div>
   <div className="mf-ai-flow">{aiFlow.map((stage,i)=>{const I=stage.icon;return <div className="mf-ai-step" key={stage.n}><div className="mf-ai-icon"><I size={23}/><span>{stage.n}</span></div><div><h4>{stage.title}</h4><p>{stage.sub}</p></div>{i<aiFlow.length-1&&<span className="mf-ai-connector" aria-hidden="true"/>}</div>})}</div>
   <p className="mf-integrity"><ShieldCheck size={17}/> Recorded training inclusion is not proof that a particular source causally influenced a given output. Rights-native systems can use verifiable dataset lineage and contractually agreed royalty allocations without inventing attribution evidence.</p>
   <div className="mf-design-line"><span>IMPLEMENT ONCE.</span><ArrowRight size={20}/><strong>RIGHTS TRAVEL WITH THE ASSET.</strong></div>
  </section>
  <section id="mf-where" className="mf-section mf-destination">
   <div className="mf-overline">04 / WHERE</div><h2>A creative economy<br/><em>ready for the AI era.</em></h2>
   <p className="mf-prose">Rights-native AI is not the destination. It is part of the infrastructure that makes the destination possible: a fair, transparent and accessible economy for the people whose work powers culture, technology and intelligence.</p>
   <div className="mf-values"><div><HeartHandshake size={27}/><h3>Fairness</h3><p>Creators can negotiate how their work is used and participate in the value it helps create.</p></div><div><ShieldCheck size={27}/><h3>Transparency</h3><p>Relationships, agreed rights, use records and economic outcomes can be inspected and audited.</p></div><div><Globe2 size={27}/><h3>Opportunity</h3><p>Open participation without permission from a single gatekeeper or platform.</p></div></div>
   <p className="mf-destination-line">Knowledge retains its history.<br/>Creativity retains its value.<br/><strong>Everyone who contributes has a path forward.</strong></p>
  </section>
  <section id="mf-original" className="mf-foundation">
   <span className="mf-overline"><BookOpen size={15}/> OUR FOUNDING DOCUMENT</span>
   <h2>AI Rights: The AI Rights Object Standard.</h2>
   <p>The original manifesto, preserved as written.</p>
   <div className="mf-original-text">{originalText.split(/\n\s*\n/).slice(1).map((p,i)=><p key={i}>{p}</p>)}</div>
   <a href="https://github.com/0x0zAgency/yellow-brick-road/blob/main/MANIFESTO.md" target="_blank" rel="noreferrer">Read the canonical document <ArrowUpRight size={16}/></a>
  </section>
  <div className="mf-bottom"><span>THE ASSET CARRIES THE RIGHTS.</span><h2>Platforms execute.<br/><em>Objects govern.</em></h2><div><button className="mf-cta" onClick={onMint}>Open Mint Studio <ArrowRight size={18}/></button><button className="mf-outline" onClick={onExplore}>Explore the Road <ArrowUpRight size={17}/></button></div></div>
 </article>
}
