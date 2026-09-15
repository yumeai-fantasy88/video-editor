import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioReadSession} from '../src/audio-stream.js';
import {mixAudio,assets} from '../src/engine.js';
import {newProject,clip} from '../src/model.js';
globalThis.AudioBuffer=class {
 constructor({length,numberOfChannels,sampleRate}){Object.assign(this,{length,numberOfChannels,sampleRate,duration:length/sampleRate});this.channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));}
 getChannelData(c){return this.channels[c];}
};
function fixture(){
 const state={opens:0,closes:0,starts:[]};
 const sink={async *buffers(from=0){state.opens++;state.starts.push(from);try{
  for(let offset=Math.floor(from*44100/1024)*1024;offset<44100*4;offset+=1024){
   const buffer=new AudioBuffer({length:Math.min(1024,44100*4-offset),numberOfChannels:1,sampleRate:44100});
   for(let i=0;i<buffer.length;i++)buffer.channels[0][i]=.3*Math.sin((offset+i)*2*Math.PI*440/44100);
   yield {buffer,timestamp:offset/44100,duration:buffer.duration};
  }
 }finally{state.closes++;}}};
 return {state,sink};
}
test('one decoder and identical PCM across 1-second output boundaries at 44.1 to 48 kHz',async()=>{
 const {sink,state}=fixture(),a={id:'continuous',name:'audio',kind:'audio',duration:4};assets.set(a.id,{audioSink:sink});
 const p=newProject();p.audio=[{...clip(a),start:0}];const session=new AudioReadSession();
 try{
  const blocks=[];for(let t=0;t<4;t++)blocks.push((await mixAudio(p,t,1,48000,session)).getChannelData(0));
  assert.equal(state.opens,1);
  const full=(await mixAudio(p,0,4)).getChannelData(0);
  for(let t=0;t<4;t++)for(let i=0;i<48000;i++)assert.ok(Math.abs(blocks[t][i]-full[t*48000+i])<1e-6);
 }finally{await session.close();assets.delete(a.id);}
 assert.equal(state.closes,2);
});
test('seek pre-roll, reverse seek, overlapping readers, and cleanup',async()=>{
 const {sink,state}=fixture(),session=new AudioReadSession();
 for await(const b of session.buffers('a',sink,2,2.1))assert.ok(b.timestamp+b.duration>2);
 assert.equal(state.starts[0],1.75);
 for await(const b of session.buffers('a',sink,1,1.1))assert.ok(b.timestamp+b.duration>1);
 for await(const b of session.buffers('b',sink,0,.1))assert.ok(b.timestamp<.1);
 assert.equal(state.opens,3);await session.close();assert.equal(state.closes,3);
 for await(const b of session.buffers('a',sink,0,1))assert.fail('closed session yielded data');
});
