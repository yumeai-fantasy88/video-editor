import test from 'node:test';
import assert from 'node:assert/strict';
import {PreviewVideoSession} from '../src/preview-video.js';
test('playback reuses a decoder, holds the correct frame, and reopens on reverse seek',async()=>{
 let opened=0,closed=0;
 const sink={async *canvases(from){opened++;try{for(let i=0;i<10;i++)if(i/10>=from)yield {timestamp:i/10,canvas:{frame:i}};}finally{closed++;}}};
 const session=new PreviewVideoSession();
 assert.equal((await session.read('clip',sink,0)).canvas.frame,0);
 assert.equal((await session.read('clip',sink,.04)).canvas.frame,0);
 assert.equal((await session.read('clip',sink,.32)).canvas.frame,3);
 assert.equal(opened,1);
 assert.equal((await session.read('clip',sink,.1)).canvas.frame,1);
 assert.equal(opened,2);assert.equal(closed,1);
 await session.close();assert.equal(closed,2);assert.equal(await session.read('clip',sink,.2),null);
});
test('a startup gap can hold the first picture but later missing frames never jump forward',async()=>{
 const sink={async *canvases(){yield {timestamp:.04,canvas:{}};yield {timestamp:.1,canvas:{}};}};
 const session=new PreviewVideoSession();assert.equal((await session.read('first',sink,0)).timestamp,.04);
 const future={async *canvases(){yield {timestamp:2,canvas:{}};}};assert.equal(await session.read('later',future,1),null);
 await session.close();
});

test('overlapping clips get independent decoder canvas pools',async()=>{
 const source={};let opened=0;
 const factory=()=>{const number=++opened;return {async *canvases(){yield {timestamp:0,canvas:{number}};yield {timestamp:.1,canvas:{number}};}};};
 const session=new PreviewVideoSession();
 assert.equal((await session.read('left',source,0,factory)).canvas.number,1);
 assert.equal((await session.read('right',source,0,factory)).canvas.number,2);
 assert.equal((await session.read('left',source,.05,factory)).canvas.number,1);
 assert.equal(opened,2);await session.close();
});
