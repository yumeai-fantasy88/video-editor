import test from 'node:test';
import assert from 'node:assert/strict';
import {Output,BufferTarget,Mp4OutputFormat,AudioBufferSource,Quality,Input,BufferSource,ALL_FORMATS,EncodedPacketSink} from 'mediabunny';
import {registerAacEncoder} from '@mediabunny/aac-encoder';
// Actual WASM AAC encoder + MP4 muxer, independent of a browser UI.
globalThis.AudioBuffer=class {
 constructor({length,numberOfChannels,sampleRate}){this.length=length;this.numberOfChannels=numberOfChannels;this.sampleRate=sampleRate;this.duration=length/sampleRate;this.channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));}
 getChannelData(c){return this.channels[c];}
 copyFromChannel(destination,channel,start=0){destination.set(this.channels[channel].subarray(start,start+destination.length));}
};
test('AAC fallback writes a real MP4 audio track at 48 kHz',async()=>{
 registerAacEncoder();
 const target=new BufferTarget();const output=new Output({format:new Mp4OutputFormat(),target});
 const audio=new AudioBufferSource({codec:'aac',quality:new Quality({bitrate:192000})});output.addAudioTrack(audio);await output.start();
 const b=new AudioBuffer({length:48000,numberOfChannels:2,sampleRate:48000});for(let c=0;c<2;c++)for(let i=0;i<b.length;i++)b.channels[c][i]=.1*Math.sin(2*Math.PI*440*i/48000);
 await audio.add(b);audio.close();await output.finalize();assert.ok(target.buffer.byteLength>1000);
 const input=new Input({source:new BufferSource(target.buffer),formats:ALL_FORMATS});const track=await input.getPrimaryAudioTrack();assert.equal(track.codec,'aac');assert.equal(track.sampleRate,48000);assert.equal(track.numberOfChannels,2);assert.ok(Math.abs(await input.computeDuration()-1)<.05);
 let count=0;for await(const packet of new EncodedPacketSink(track).packets()) {assert.ok(packet.data.byteLength>0);count++;}assert.ok(count>40);input.dispose();
});
