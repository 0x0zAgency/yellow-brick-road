/** Entire catalog is intentionally synthetic. No registration/usage is asserted. */
export const seedBricks=[
{id:"ip1",title:"Daybreak in Minor",creator:"Lena Cross",category:"Music",kind:"Master recording",tone:"aurora",use:142,amount:1420,ref:"0x7a42…e901",detail:"Analog electronic composition with layered melodic themes."},
{id:"ip2",title:"Synthetic Garden",creator:"Mira Solis",category:"Visual",kind:"Digital artwork",tone:"garden",use:86,amount:644,ref:"0x8b23…a017",detail:"An imagined botanical collection made from generative geometry."},
{id:"ip3",title:"Quiet Machinery",creator:"Noah K.",category:"Music",kind:"Composition",tone:"machine",use:104,amount:820,ref:"0x65cf…dc20",detail:"Original melodic score for a modular-synthesis piece."},
{id:"ip4",title:"Atlas of Small Worlds",creator:"Elena Reid",category:"Writing",kind:"Manuscript",tone:"atlas",use:38,amount:304,ref:"0xa1fb…ce14",detail:"Short stories about imaginary places and their inhabitants."},
{id:"ip5",title:"The Blue Hour",creator:"Ari Chen",category:"Visual",kind:"Photography",tone:"blue",use:57,amount:355,ref:"0xbb82…a911",detail:"Atmospheric photographs from the moment before night."},
{id:"ip6",title:"Good Things Take Time",creator:"Lena Cross",category:"Music",kind:"Master recording",tone:"tape",use:74,amount:592,ref:"0x128f…b600",detail:"Warm, textured instrumental music from the Daybreak release."}
];
export const seedBuildings=[
{id:"b1",title:"Daybreak / Vol. 01",type:"Album",tone:"album",members:["ip1","ip3","ip6"],detail:"One release, three independently addressable works.",ref:"0x9c14…5e22"},
{id:"b2",title:"Visions of Nature",type:"Collection",tone:"collection",members:["ip2","ip5"],detail:"Curated photographs and digital works connected by references.",ref:"0xfe17…b540"},
{id:"b3",title:"Regeneration / Origin",type:"Regeneration",tone:"regeneration",members:["ip1","ip4"],detail:"An evidence-linked provenance structure for source materials.",ref:"0x5e32…c044"}
];
export const seedLicenses=[
{id:"L-01",ip:"ip1",licensee:"North Studio",type:"Commercial sync",price:18,status:"Active"},
{id:"L-02",ip:"ip2",licensee:"Open Archive",type:"Dataset access",price:8,status:"Active"},
{id:"L-03",ip:"ip5",licensee:"Frame Works",type:"Editorial use",price:14,status:"Active"},
{id:"L-04",ip:"ip3",licensee:"Indigo Films",type:"Synchronization",price:30,status:"Expired"}
];
export const seedProposals=[
{id:12,title:"Q4 infrastructure operating budget",description:"Cap Road fee collection at the transparent, approved cost of service.",category:"Treasury",forVotes:72,againstVotes:18,open:true},
{id:11,title:"Minimum node-service verification standard",description:"Challengeable proof of base-chain node operation and measured Road services.",category:"Network",forVotes:81,againstVotes:9,open:true},
{id:10,title:"Universal baseline voting rights",description:"Every uniquely verified user has a voice with bounded extra contribution weight.",category:"Governance",forVotes:88,againstVotes:12,open:false}
];
export const seedNodes=[
{name:"Road Node / North",region:"North America",uptime:"99.97%",status:"Verified (demo)"},
{name:"Road Node / East",region:"Europe",uptime:"99.91%",status:"Verified (demo)"},
{name:"Road Node / Pacific",region:"Asia Pacific",uptime:"99.88%",status:"Review (demo)"}
];