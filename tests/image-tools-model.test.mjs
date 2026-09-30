import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../image-tools/matting-worker.js',import.meta.url),'utf8');
function fixture({storage=true,quota=false,length=true,truncated=false,oldCache=false}={}) {
  const events=[],messages=[];
  let saved=oldCache?{bytes:new Uint8Array(16),headers:{}}:null,fetches=0;
  const response=()=>new Response(new Uint8Array(truncated?12:16),{headers:length?{'content-length':'16'}:{}});
  const cache={
    async match(){return saved?new Response(saved.bytes,{headers:saved.headers}):undefined;},
    async put(_url,r){events.push('store-start');if(quota)throw new Error('quota');saved={bytes:new Uint8Array(await r.arrayBuffer()),headers:r.headers};events.push('store-finish');},
    async delete(){saved=null;return true;}
  };
  const context=vm.createContext({Response,TransformStream,console,Date,Number,Error,Float32Array,
    Uint8Array:class extends Uint8Array{constructor(size){super(size);events.push(`allocate-${size}`);}},
    self:{postMessage:m=>messages.push(m)},
    caches:{async open(){if(!storage)throw new Error('unavailable');return cache;}},
    fetch:async()=>{fetches++;return response();}
  });
  vm.runInContext(code,context);
  // Small transport fixtures; validate the production bounds separately.
  const productionValid=vm.runInContext('validSize',context);
  vm.runInContext('validSize=size=>Number.isSafeInteger(size)&&size>=8&&size<=32',context);
  return {context,events,messages,productionValid,fetches:()=>fetches,saved:()=>saved};
}
test('model buffering starts only after streaming storage completes',async()=>{
  const f=fixture();const bytes=await vm.runInContext('modelBytes()',f.context);
  assert.equal(bytes.length,16);
  assert.deepEqual(f.events,['store-start','store-finish','allocate-16']);
  assert.equal(f.fetches(),1);
  assert.equal(f.productionValid(99999999),false);
  assert.equal(f.productionValid(455000000),true);
  assert.equal(f.productionValid(550000001),false);
});
test('unknown download size is counted while streaming, without retaining chunks',async()=>{
  const f=fixture({length:false});assert.equal((await vm.runInContext('modelBytes()',f.context)).length,16);
  assert.deepEqual(f.events,['store-start','store-finish','allocate-16']);
});
test('old cache without a size is reused without downloading again',async()=>{
  const f=fixture({oldCache:true});assert.equal((await vm.runInContext('modelBytes()',f.context)).length,16);
  assert.deepEqual(f.events,['allocate-16']);assert.equal(f.fetches(),0);
});
test('storage failure falls back to a single bounded buffer',async()=>{
  const f=fixture({quota:true});assert.equal((await vm.runInContext('modelBytes()',f.context)).length,16);
  assert.deepEqual(f.events,['store-start','allocate-16']);assert.equal(f.fetches(),2);
});
test('truncated model is rejected and not kept as a valid cache',async()=>{
  const f=fixture({truncated:true});await assert.rejects(vm.runInContext('modelBytes()',f.context),/不完全/);
  assert.equal(f.saved(),null);
});
test('unknown size without persistent storage fails before a full allocation',async()=>{
  const f=fixture({storage:false,length:false});await assert.rejects(vm.runInContext('modelBytes()',f.context),/サイズを確認/);
  assert.deepEqual(f.events,[]);
});
