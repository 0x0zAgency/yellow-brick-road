'use strict';
/** Local preview library, NOT an on-chain registry or public streaming license.
 * Only explicitly selected audio/artwork/lyrics copies are accepted. No keys,
 * recovery files, arbitrary paths, HTML/SVG, or project binaries are stored.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const MiB = 1024 * 1024;
const LIMITS = Object.freeze({ audio: 32 * MiB, artwork: 8 * MiB, lyrics: 512 * 1024 });
const MAX_REQUEST_BYTES = 56 * MiB;
const ID = /^STUDIO-[a-f0-9]{64}$/;
const HASH = /^[a-f0-9]{64}$/;
const AUDIO = new Set(['audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/flac', 'audio/webm', 'audio/aac']);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const error = (message, status = 400) => Object.assign(new Error(message), { status });
function text(value, label, max = 200, required = true) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (required && !value.trim())) {
    throw error('Invalid ' + label + '.');
  }
  return value.trim();
}
function safeName(value) {
  return text(value, 'filename', 512).split(/[\\/]/).at(-1).replace(/[\u202a-\u202e\u2066-\u2069<>:"|?*]/g, '_').slice(0,200) || 'asset';
}
function imageType(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) && bytes.toString('ascii',12,16) === 'IHDR') return 'image/png';
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 16 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  throw error('Cover artwork must be a PNG, JPEG or WebP image. SVG and HTML are not accepted.');
}
function decodeAsset(role, item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw error('Missing ' + role + ' asset.');
  if (typeof item.base64 !== 'string' || item.base64.length > Math.ceil(LIMITS[role] / 3) * 4 || item.base64.length % 4 !== 0) throw error('Invalid or oversized ' + role + ' payload.',413);
  const bytes = Buffer.from(item.base64,'base64');
  if(bytes.toString('base64')!==item.base64)throw error('Invalid base64 payload.');
  if (!bytes.length || bytes.length > LIMITS[role]) throw error('The ' + role + ' file exceeds the local preview limit.',413);
  if (typeof item.sha256 !== 'string' || !HASH.test(item.sha256) || sha256(bytes) !== item.sha256) throw error('The ' + role + ' checksum does not match the supplied bytes.');
  const name = safeName(item.name);
  let mime = item.mime, kind = null;
  if (role === 'audio' && !AUDIO.has(mime)) throw error('Unsupported preview audio format.');
  if (role === 'artwork') { const detected = imageType(bytes); if (detected !== mime) throw error('Cover MIME type does not match its bytes.'); }
  if (role === 'lyrics') {
    if (!['text/plain','text/vtt'].includes(mime)) throw error('Lyrics must be UTF-8 .txt or .vtt, not HTML or a document file.');
    let value; try { value = new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { throw error('Lyrics must be UTF-8 text.'); }
    if (value.includes('\u0000')) throw error('Lyrics contain invalid text.');
    if (mime === 'text/vtt' && !/^WEBVTT(?:[ \t].*)?(?:\r?\n|$)/.test(value)) throw error('Timed lyrics must have a WEBVTT header.');
    kind = mime === 'text/vtt' ? 'webvtt' : 'plain';
  }
  return { bytes, info: { name, mime, byteLength: bytes.length, sha256: item.sha256, ...(kind ? { kind } : {}) } };
}
function normalizePublication(body) {
  if (!body || body.format !== 'ybr-studio-preview/1' || body.consent !== 'share-selected-copies-with-local-player') throw error('Explicit local-player sharing consent is required.',403);
  if(body.audioSourceRole!=='preview')throw error('Audio Preview source is required. Master Recordings cannot be published to the Player.');
  const title = text(body.title,'release title'), creator = text(body.creator,'creator');
  const description = text(body.description || '', 'description',2000,false);
  const album = text(body.album || '', 'album',200,false);
  if (!body.assets || Object.keys(body.assets).some(role => !Object.hasOwn(LIMITS,role))) throw error('Only audio, artwork and lyrics may be shared.');
  const decoded = { audio: decodeAsset('audio',body.assets.audio) };
  for (const role of ['artwork','lyrics']) if (body.assets[role]) decoded[role] = decodeAsset(role,body.assets[role]);
  if (!Array.isArray(body.files) || body.files.length > 64) throw error('Invalid associated-file list.');
  const files = body.files.map(item => ({ role: text(item?.role,'file role',80), name: safeName(item?.name), shared: ['audio','artwork','lyrics'].includes(item?.sharedAs) ? item.sharedAs : null }));
  const audioFiles=files.filter(file=>file.shared==='audio');
  if(audioFiles.length!==1||audioFiles[0].role!=='preview'||audioFiles[0].name!==decoded.audio.info.name||files.some(file=>file.role==='master'&&file.shared!==null))throw error('Only the Audio Preview may supply playable audio.');
  // Receipt references are labels only; never promote supplied addresses to chain proof.
  const references = Array.isArray(body.bricks) ? body.bricks.slice(0,64).map(item => ({ role: text(item?.role,'Brick role',100), title: text(item?.title || title,'Brick title'), address: /^0x[0-9a-fA-F]{40}$/.test(item?.address || '') ? item.address : null })) : [];
  if(body.credits!==undefined&&(!Array.isArray(body.credits)||body.credits.length>64))throw error('Invalid credit list.');
  const credits=(body.credits||[]).map(person=>({name:text(person?.name,'credit name'),role:text(person?.role,'credit role',80)}));
  const metadata = { format:'ybr-studio-preview/1', audioSourceRole:'preview', title, creator, album, description, files, references, credits,
    provenanceStatus:'local-creator-preview-not-chain-verified', assets:Object.fromEntries(Object.entries(decoded).map(([role,asset])=>[role,asset.info])) };
  const id = 'STUDIO-' + sha256(JSON.stringify(metadata));
  return { id, metadata:{...metadata,id}, decoded };
}
function readRegular(file, max) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > max) throw error('Invalid stored preview file.',409);
    return fs.readFileSync(fd);
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function createStudioLibrary({directory=path.resolve(__dirname,'../../.road-local/player-releases'),maxReleases=100}={}) {
  const root = path.resolve(directory);
  function read(id) {
    if (!ID.test(id || '')) return null;
    try {
      const dir = path.join(root,id);
      if (fs.lstatSync(dir).isSymbolicLink()) throw error('Invalid preview directory.',409);
      const data = JSON.parse(readRegular(path.join(dir,'release.json'),128*1024).toString('utf8'));
      if (data.id !== id || data.format !== 'ybr-studio-preview/1') throw error('Invalid local preview record.',409);
      return data;
    } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  function safePreview(data) {
    const playable=data?.files?.filter(file=>file.shared==='audio')||[];
    return playable.length===1&&playable[0].role==='preview'&&playable[0].name===data?.assets?.audio?.name&&!data.files.some(file=>file.role==='master'&&file.shared!=null);
  }
  function describe(data) {
    const url = role => '/api/studio-releases/' + data.id + '/' + role;
    const artwork = data.assets.artwork ? {...data.assets.artwork,url:url('artwork')} : null;
    return { id:data.id,type:'AudioBrick',source:'studio-demo',title:data.title,creator:data.creator,album:data.album,description:data.description,
      durationSeconds:0,theme:'gold',streamAllowed:true,media:{mimeType:data.assets.audio.mime,sha256:data.assets.audio.sha256},
      artwork,lyrics:data.assets.lyrics ? {...data.assets.lyrics,url:url('lyrics')} : null,
      files:data.files.map(item=>({...item,artworkUrl:artwork?.url || null})),references:data.references,credits:data.credits||[],
      rights:{license:'Creator-shared local demo preview only. No public or commercial streaming license.',notes:'Copies shared explicitly from Mint Studio; not blockchain-verified permission.'},
      provenance:{agent:data.creator,activity:'Explicit local Mint Studio preview',entity:data.id,vocabulary:'https://www.w3.org/TR/prov-o/'},
      verification:'local-creator-preview-not-chain-verified' };
  }
  function list() {
    let names; try { names=fs.readdirSync(root); } catch(e) { if(e.code==='ENOENT')return [];throw e; }
    if(names.filter(name=>ID.test(name)).length>maxReleases)throw error('Local preview library exceeds its configured limit.',409);
    return names.filter(name=>ID.test(name)).sort().map(read).filter(data=>data&&safePreview(data)).map(describe);
  }
  function publish(body) {
    const {id,metadata,decoded} = normalizePublication(body);
    fs.mkdirSync(root,{recursive:true,mode:0o700});
    if (read(id)) { for(const role of Object.keys(decoded))asset(id,role);return {created:false,brick:describe(read(id))}; }
    if (list().length >= maxReleases) throw error('Local preview library is full. Remove an old preview first.',413);
    const temporary = fs.mkdtempSync(path.join(root,'.incoming-'));
    try {
      for(const [role,asset] of Object.entries(decoded)) fs.writeFileSync(path.join(temporary,role+'.bin'),asset.bytes,{mode:0o600,flag:'wx'});
      fs.writeFileSync(path.join(temporary,'release.json'),JSON.stringify(metadata)+'\n',{mode:0o600,flag:'wx'});
      fs.renameSync(temporary,path.join(root,id));
    } finally { if(fs.existsSync(temporary))fs.rmSync(temporary,{recursive:true,force:true}); }
    return {created:true,brick:describe(metadata)};
  }
  function asset(id,role) {
    if(!Object.hasOwn(LIMITS,role))return null;
    const record=read(id),info=record?.assets?.[role];
    if(!info||!safePreview(record))return null;
    const bytes=readRegular(path.join(root,id,role+'.bin'),LIMITS[role]);
    if(bytes.length!==info.byteLength||sha256(bytes)!==info.sha256)throw error('Preview integrity check failed.',409);
    return {bytes,...info};
  }
  function remove(id) { if(!read(id))return false;fs.rmSync(path.join(root,id),{recursive:true});return true; }
  return {list,publish,asset,remove,get:id=>{const data=read(id);return data&&safePreview(data)?describe(data):null;}};
}
module.exports={createStudioLibrary,normalizePublication,LIMITS,MAX_REQUEST_BYTES,sha256};
