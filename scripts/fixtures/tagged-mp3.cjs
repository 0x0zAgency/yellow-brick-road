'use strict';
/** Synthetic silent MPEG Layer III frames with ID3v2.3 tags. No licensed media. */
module.exports=function taggedMp3({title='Preview track',artist='Synthetic Artist',album='',writer=artist}={}){
 const frame=(id,text)=>{const body=Buffer.concat([Buffer.from([3]),Buffer.from(text)]),head=Buffer.alloc(10);head.write(id);head.writeUInt32BE(body.length,4);return Buffer.concat([head,body]);};
 const tags=Buffer.concat([frame('TIT2',title),frame('TPE1',artist),...(album?[frame('TALB',album)]:[]),frame('TCOM',writer)]);
 const head=Buffer.from([73,68,51,3,0,0,0,0,0,0]);let n=tags.length;for(let i=9;i>=6;i--){head[i]=n&127;n>>=7;}
 const frames=Buffer.alloc(417*400);for(let i=0;i<400;i++)Buffer.from([255,251,144,0]).copy(frames,i*417);
 return Buffer.concat([head,tags,frames]);
};
