import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BlobOutput} from '../src/blob-output.js';
test('MP4 header rewrites preserve media bytes across blocks',async()=>{
  const store=new BlobOutput(8);
  const input=Uint8Array.from({length:29},(_,i)=>i+1);
  store.write({data:input,position:0});
  store.write({data:new Uint8Array([90,91,92,93]),position:6});
  const expected=input.slice();expected.set([90,91,92,93],6);
  assert.deepEqual(new Uint8Array(await store.finish().arrayBuffer()),expected);
  assert.equal(store.blocks.size,0);
});
test('out-of-order writes, gaps and reused encoder buffers produce a stable snapshot',async()=>{
  const store=new BlobOutput(8),data=new Uint8Array([1,2,3]);
  store.write({data,position:19});data.fill(9);
  store.write({data:new Uint8Array([4,5]),position:0});
  store.write({data:new Uint8Array([6]),position:7});
  const expected=new Uint8Array(22);expected.set([1,2,3],19);expected.set([4,5]);expected[7]=6;
  const blob=store.finish();assert.equal(blob.type,'video/mp4');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),expected);
});
test('random MP4-style overwrites match a reference file without large retained typed arrays',async()=>{
  const store=new BlobOutput(128),expected=new Uint8Array(4096);let size=0,seed=123;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let i=0;i<200;i++){
    const position=random()%4000,count=1+random()%96;
    const data=Uint8Array.from({length:count},()=>random()%256);
    store.write({data,position});expected.set(data,position);size=Math.max(size,position+count);
    for(const block of store.blocks.values()){assert.ok(block instanceof Blob);assert.ok(block.size<=128);}
  }
  assert.deepEqual(new Uint8Array(await store.finish().arrayBuffer()),expected.slice(0,size));
});
test('cancel clears retained pieces and invalid offsets are rejected',()=>{
  const store=new BlobOutput(8);store.write({data:new Uint8Array(20),position:0});store.clear();
  assert.equal(store.size,0);assert.equal(store.blocks.size,0);
  assert.throws(()=>store.write({data:new Uint8Array(1),position:-1}),TypeError);
});
