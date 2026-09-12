import test from 'node:test';
import assert from 'node:assert/strict';
import {readVideoFrame} from '../src/video-frame.js';
test('exact frame lookup returns immediately',async()=>{const f={timestamp:1};assert.equal(await readVideoFrame({getCanvas:async()=>f},1),f);});
test('missing timestamp frame retries sequential decode and closes iterator',async()=>{let closed=false;const f={timestamp:.095};const sink={getCanvas:async()=>null,canvases:()=>({next:async()=>({done:false,value:f}),return:async()=>{closed=true;}})};assert.equal(await readVideoFrame(sink,.1),f);assert.equal(closed,true);});
test('fallback never silently jumps forward in time',async()=>{const sink={getCanvas:async()=>null,canvases:()=>({next:async()=>({done:false,value:{timestamp:2}}),return:async()=>{}})};assert.equal(await readVideoFrame(sink,1),null);});
