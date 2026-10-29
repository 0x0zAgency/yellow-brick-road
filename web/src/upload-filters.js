/** File-picker hints by role; preview validation also handles picker overrides. */
const AUDIO='.wav,.wave,.bwf,.flac,.aif,.aiff,.mp3,.m4a,.aac,.ogg,.opus,audio/*';
const DOCUMENTS='.txt,.md,.pdf,.doc,.docx,.rtf,.odt';
export function uploadFilter(role,category={}){
 if(role==='preview')return {accept:'.mp3,audio/mpeg',hint:'MP3 Audio Preview · ID3 tags supply track and album details'};
 if(role==='artwork')return {accept:'.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',hint:'PNG, JPEG or WebP cover artwork'};
 if(role==='lyrics')return {accept:DOCUMENTS+',.vtt,.lrc',hint:'Lyrics or writing evidence · TXT, VTT, LRC, PDF or document'};
 if(role==='metadata')return {accept:'.json,.jsonld,.txt,.xml,.csv,.yaml,.yml',hint:'Metadata sidecar · JSON, text, XML, CSV or YAML'};
 if(role==='project')return {accept:'',hint:'Native project or source archive · all file formats'};
 if(role==='master'){
  if(['sound-recording','sound-design'].includes(category.id))return {accept:AUDIO,hint:'Master audio · WAV, FLAC, AIFF, MP3 and other audio formats'};
  if(category.id==='musical-work')return {accept:DOCUMENTS+',.mid,.midi,.musicxml,.mxl,'+AUDIO,hint:'Score, sheet music, MIDI, MusicXML or audio demo'};
  if(category.id==='song-lyrics'||category.group==='Writing & publishing')return {accept:DOCUMENTS+',.epub',hint:'Manuscript or document'};
  if(category.id==='photograph')return {accept:'image/*,.raw,.dng,.cr2,.nef,.arw',hint:'Original photograph'};
 }
 return {accept:'',hint:'Original work · all file formats'};
}
export function validatePreviewSelection(file){
 if(!/\.mp3$/i.test(file?.name||''))throw Error('Audio Preview accepts MP3 files only. Upload WAV recordings as the Master recording.');
}
