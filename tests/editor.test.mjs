import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,clip,layout,total,duration,frameDuration,splitClip,parseSrt,validateProject,gradeDefault} from '../src/model.js';
import {assets,mixAudio,dimensions} from '../src/engine.js';

const asset={id:'sample',name:'sample.mp4',kind:'video',duration:5};
function project(){const p=newProject();p.assets=[asset];p.clips=[clip(asset)];return p;}
test('5 second source becomes exactly 3.5 seconds / 105 frames',()=>{const c=clip(asset);c.speed=5/frameDuration(3.5,30);assert.equal(duration(c),3.5);assert.equal(duration(c)*30,105);});
test('subframe requests round to nearest output frame',()=>{assert.equal(frameDuration(.01,30),1/30);assert.equal(frameDuration(3.51,30),3.5);assert.equal(frameDuration(3.52,30),106/30);});
test('crossfade overlaps adjacent clips and clamps short neighbors',()=>{const p=project();const b=clip(asset);b.transition=1;p.clips.push(b);assert.equal(layout(p)[1].start,4);assert.equal(total(p),9);b.transition=100;assert.equal(total(p),7.5);});
test('split retimed clip preserves source boundaries and overall duration',()=>{const p=project();p.clips[0].speed=2;const cid=p.clips[0].id;assert.equal(splitClip(p,cid,1),true);assert.equal(p.clips[0].out,2);assert.equal(p.clips[1].in,2);assert.equal(p.clips[1].out,5);assert.equal(total(p),2.5);});
test('split at boundaries is rejected',()=>{const p=project();assert.equal(splitClip(p,p.clips[0].id,0),false);assert.equal(splitClip(p,p.clips[0].id,5),false);});
test('audio and text determine final duration after picture ends',()=>{const p=project();p.audio.push({...clip(asset),start:10});p.texts.push({start:0,end:20});assert.equal(total(p),20);});
test('SRT accepts Japanese, multiline and CRLF',()=>{assert.deepEqual(parseSrt('1\r\n00:00:01,250 --> 00:00:03,500\r\n記憶\r\nMemory'),[{start:1.25,end:3.5,text:'記憶\nMemory'}]);});
test('project validation rejects invalid speed and unknown asset',()=>{let p=project();assert.equal(validateProject(p),p);p.clips[0].speed=0;assert.throws(()=>validateProject(p));p=project();p.clips[0].asset='missing';assert.throws(()=>validateProject(p));});
test('aspect ratios use even dimensions',()=>{assert.deepEqual(dimensions('16:9'),[1920,1080]);assert.deepEqual(dimensions('9:16'),[1080,1920]);assert.deepEqual(dimensions('4:3'),[1920,1440]);});

// Exercise the real audio mixer with deterministic decoded input samples.
globalThis.AudioBuffer=class {
 constructor({length,numberOfChannels,sampleRate}){this.length=length;this.numberOfChannels=numberOfChannels;this.sampleRate=sampleRate;this.duration=length/sampleRate;this.channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));}
 getChannelData(c){return this.channels[c];}
};
const rate=100;
function setupAudio(){const buffer=new AudioBuffer({length:500,numberOfChannels:1,sampleRate:rate});buffer.getChannelData(0).fill(.5);assets.set('sample',{audioSink:{async *buffers(){yield {buffer,timestamp:0,duration:5};}}});}
test('audio mixer respects placement, volume, fades and silence',async()=>{setupAudio();const p=project();p.clips[0].volume=0;p.audio=[{...clip(asset),start:1,volume:.5,fadeIn:1}];const buffer=await mixAudio(p,0,3,rate);assert.equal(buffer.getChannelData(0)[50],0);assert.equal(buffer.getChannelData(0)[100],0);assert.ok(Math.abs(buffer.getChannelData(0)[150]-.125)<1e-6);assert.equal(buffer.getChannelData(1)[200],.25);});
test('audio is independent after separation and speed change',async()=>{setupAudio();const p=project();p.audio=[{...structuredClone(p.clips[0]),start:0}];p.clips[0].volume=0;p.clips[0].speed=2;assert.equal(duration(p.audio[0]),5);const b=await mixAudio(p,3,1,rate);assert.equal(b.getChannelData(0)[50],.5);});
test('audio mixer clamps overload and avoids NaNs at boundaries',async()=>{setupAudio();const p=project();p.audio=[{...clip(asset),start:0,volume:2},{...clip(asset),start:0,volume:2}];const b=await mixAudio(p,4.8,.4,rate);assert.ok([...b.getChannelData(0)].every(Number.isFinite));assert.equal(b.getChannelData(0)[0],1);assert.equal(b.getChannelData(0)[30],0);});
test('independent clip grade copies cannot mutate others',()=>{const a=clip(asset),b=clip(asset);a.grade.density=1;assert.deepEqual(b.grade,gradeDefault());});
