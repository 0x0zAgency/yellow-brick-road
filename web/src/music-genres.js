/** Road's approved top-level music genres. Keep stored labels consistent across imports and forms. */
export const MUSIC_GENRES=Object.freeze([
 'Afrobeat / Afrobeats','Alternative','Ambient','Blues','Children’s Music','Classical',
 'Country','Dance / EDM','Disco','Electronic','Experimental','Folk','Funk',
 'Gospel / Christian','Hip-Hop / Rap','House','Indie','Jazz','Latin','Metal',
 'New Age','Opera','Pop','Punk','R&B / Soul','Reggae','Reggaeton','Rock',
 'Singer-Songwriter','Ska','Soundtrack / Score','Techno','Traditional / World','Other'
]);
const aliases={'hip hop':'Hip-Hop / Rap','hip-hop':'Hip-Hop / Rap',rap:'Hip-Hop / Rap',
 'r&b':'R&B / Soul',rnb:'R&B / Soul',soul:'R&B / Soul',edm:'Dance / EDM',dance:'Dance / EDM',
 afrobeat:'Afrobeat / Afrobeats',afrobeats:'Afrobeat / Afrobeats',gospel:'Gospel / Christian',
 christian:'Gospel / Christian',soundtrack:'Soundtrack / Score',score:'Soundtrack / Score',
 world:'Traditional / World','world music':'Traditional / World',traditional:'Traditional / World'};
/** Empty means optional; null means an imported/custom genre needs an explicit selection. */
export function normalizeMusicGenre(value){
 const key=String(value??'').trim().toLowerCase();
 if(!key)return '';
 return MUSIC_GENRES.find(genre=>genre.toLowerCase()===key)||aliases[key]||null;
}
