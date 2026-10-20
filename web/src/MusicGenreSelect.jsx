import {MUSIC_GENRES,normalizeMusicGenre} from './music-genres.js';
export default function MusicGenreSelect({value,onChange}){
 const normalized=normalizeMusicGenre(value);
 return <><select value={normalized===null?value:normalized} onChange={e=>onChange(e.target.value)}>
  <option value="">Select a genre (optional)</option>
  {normalized===null&&<option value={value} disabled>Imported: {value} — choose an approved genre</option>}
  {MUSIC_GENRES.map(genre=><option key={genre} value={genre}>{genre}</option>)}
 </select>{normalized===null&&<small>Select an approved genre, Other, or leave it blank.</small>}</>;
}
