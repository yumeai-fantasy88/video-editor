import test from 'node:test';
import assert from 'node:assert/strict';
import {readVideoFrame} from '../src/video-frame.js';
test('exact frame lookup returns immediately',async()=>{const f={timestamp:1};assert.equal(await readVideoFrame({getCanvas:async()=>f},1),f);});
test('missing timestamp frame retries sequential decode and closes iterator',async()=>{let closed=false;const f={timestamp:.095};const sink={getCanvas:async()=>null,canvases:()=>({next:async()=>({done:false,value:f}),return:async()=>{closed=true;}})};assert.equal(await readVideoFrame(sink,.1),f);assert.equal(closed,true);});
test('fallback never silently jumps forward in time',async()=>{const sink={getCanvas:async()=>null,canvases:()=>({next:async()=>({done:false,value:{timestamp:2}}),return:async()=>{}})};assert.equal(await readVideoFrame(sink,1),null);});
test('startup gap holds earliest decoded picture without changing its timestamp',async()=>{const f={timestamp:.061667};const starts=[];const sink={getCanvas:async()=>null,canvases:(start)=>{starts.push(start);return {next:async()=>({done:false,value:f}),return:async()=>{}};}};for(const time of [0,.01,.033333])assert.equal(await readVideoFrame(sink,time),f);assert.deepEqual(starts,[0,0,0]);assert.equal(f.timestamp,.061667);});
test('startup recovery rejects large gaps and empty decoder output',async()=>{for(const result of [{done:false,value:{timestamp:.5}},{done:true}]){const sink={getCanvas:async()=>null,canvases:()=>({next:async()=>result,return:async()=>{}})};assert.equal(await readVideoFrame(sink,0),null);}});
