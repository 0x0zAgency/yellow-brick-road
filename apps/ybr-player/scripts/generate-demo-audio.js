'use strict';
// Deterministic original electronic loops: Node.js only, no third-party recordings.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const RATE=24000, SECONDS=24, COUNT=RATE*SECONDS, PI2=Math.PI*2;
const TARGET=path.resolve(__dirname,'../media');
const tone=(f,t)=>Math.sin(PI2*f*t)+.12*Math.sin(PI2*2*f*t);
const chord=(r,t)=>(tone(r,t)+tone(r*2**(4/12),t)+tone(r*2**(7/12),t))/3;
function make(name,roots,melody,bpm) {
  const step=60/bpm, pcm=Buffer.alloc(44+COUNT*2);
  pcm.write('RIFF',0,'ascii'); pcm.writeUInt32LE(pcm.length-8,4);
  pcm.write('WAVEfmt ',8,'ascii'); pcm.writeUInt32LE(16,16);
  pcm.writeUInt16LE(1,20); pcm.writeUInt16LE(1,22);
  pcm.writeUInt32LE(RATE,24); pcm.writeUInt32LE(RATE*2,28);
  pcm.writeUInt16LE(2,32); pcm.writeUInt16LE(16,34);
  pcm.write('data',36,'ascii'); pcm.writeUInt32LE(COUNT*2,40);
  for(let i=0;i<COUNT;i++){
    const t=i/RATE, padIndex=Math.floor(t/(step*2)), padT=t-padIndex*step*2;
    const attack=Math.min(1,padT/.15);
    const release=Math.min(1,Math.max(0,(step*2.08-padT)/.35));
    const pad=.17*chord(roots[padIndex%roots.length],padT)*attack*release;
    const melodyIndex=Math.floor(t/(step/2)), melodyT=t-melodyIndex*step/2;
    const hz=melody[melodyIndex%melody.length];
    const pluck=melodyT<step*.43?.18*(tone(hz,melodyT)*Math.exp(-melodyT*5.1)+.21*tone(2*hz,melodyT)*Math.exp(-melodyT*9)):0;
    const bassIndex=Math.floor(t/step), bassT=t-bassIndex*step;
    const bass=bassT<.34?.14*Math.sin(PI2*(roots[Math.floor(bassIndex/2)%roots.length]/2)*bassT)*Math.exp(-bassT*9):0;
    const fade=Math.min(1,t/.3)*Math.min(1,(SECONDS-t)/.65);
    const audio=.75*Math.tanh((pad+pluck+bass)*1.45)*Math.max(0,fade);
    pcm.writeInt16LE(Math.max(-32768,Math.min(32767,Math.trunc(audio*32767))),44+i*2);
  }
  fs.mkdirSync(TARGET,{recursive:true});
  const dest=path.join(TARGET,name);
  fs.writeFileSync(dest,pcm);
  console.log(name+': '+crypto.createHash('sha256').update(pcm).digest('hex'));
}
make('golden-hour.wav',[174.61,130.81,146.83,196],[349.23,392,440,523.25,440,392,329.63,261.63],100);
make('after-the-rain.wav',[110,146.83,123.47,164.81],[220,293.66,329.63,293.66,246.94,220,196,164.81],88);
