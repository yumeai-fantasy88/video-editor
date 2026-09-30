/* withoutBG v10 RGB -> continuous alpha. See AI-NOTICES.md. */
'use strict';
const ROOT = 'https://huggingface.co/withoutbg/withoutbg-openweights-onnx/resolve/cfae4da1ee09b27c45af2af2096d4d14721508ba/';
const RUNTIME = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
let session;
let running = false;
const report = (text, value) => self.postMessage({type:'progress',text,value});
const MIN_MODEL_BYTES = 100000000, MAX_MODEL_BYTES = 550000000;
function validSize(size) {
  return Number.isSafeInteger(size) && size >= MIN_MODEL_BYTES && size <= MAX_MODEL_BYTES;
}
// At most one model-sized JS buffer. Never concatenate a second 455 MB copy.
async function readModel(response, size) {
  if (!validSize(size)) throw new Error('AIデータのサイズを確認できませんでした。');
  const bytes = new Uint8Array(size), reader = response.body.getReader();
  let offset = 0, last = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      if (offset + value.byteLength > size) throw new Error('AIデータのサイズが想定と異なります。');
      bytes.set(value,offset); offset += value.byteLength;
      if (Date.now()-last>300) {
        report(`AIデータを展開用に読み込み中… ${Math.round(offset/1000000)} MB`,offset/size);
        last = Date.now();
      }
    }
    if (offset !== size) throw new Error('AIデータが不完全です。もう一度お試しください。');
    return bytes;
  } catch (error) { await reader.cancel().catch(()=>{}); throw error; }
  finally { reader.releaseLock(); }
}
async function modelBytes() {
  const url = ROOT + 'withoutbg-open-weights.onnx';
  let cache;
  try { cache = await caches.open('image-tools-matting-v10'); } catch (_) {}
  let response;
  try { response = cache && await cache.match(url); } catch (_) { cache = null; }
  const cached = !!response;
  if (!response) response = await fetch(url);
  if (!response.ok) throw new Error('AIデータを取得できませんでした。通信状態を確認して再試行してください。');
  let size = Number(response.headers.get('content-length'));
  // Save the response stream before allocating inference bytes. Response.clone()
  // would tee the stream and could queue the whole model in memory.
  if (!cached && cache) {
    let length = 0, last = 0;
    const stream = response.body.pipeThrough(new TransformStream({transform(value,controller) {
      length += value.byteLength;
      if (length > MAX_MODEL_BYTES) throw new Error('AIデータのサイズが想定と異なります。');
      if (Date.now()-last>300) {
        report(`AIデータをダウンロード・保存中… ${Math.round(length/1000000)} MB`,validSize(size)?Math.min(1,length/size):undefined);
        last = Date.now();
      }
      controller.enqueue(value);
    }}));
    try {
      await cache.put(url,new Response(stream,{headers:response.headers}));
      if (!validSize(length) || (validSize(size) && length !== size)) {
        await cache.delete(url); throw new Error('AIデータが不完全です。もう一度お試しください。');
      }
      size = length;
      response = await cache.match(url);
    } catch (error) {
      // The stream may be consumed when storage is full. Re-fetch once, without
      // caching; do not retain/clone it as a speculative fallback.
      await stream.cancel().catch(()=>{});
      try { await cache.delete(url); } catch (_) {}
      report('端末への保存ができないため、AIデータを直接読み込みます…');
      response = await fetch(url);
      if (!response.ok) throw error;
      size = Number(response.headers.get('content-length'));
      cache = null;
    }
  }
  if (!response) throw new Error('保存済みのAIデータを読み込めませんでした。');
  if (!validSize(size) && cache) {
    // Older cache entries may not have Content-Length. Count a streaming pass
    // without retaining chunks, then read the persistent response again.
    let length = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const {done,value} = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > MAX_MODEL_BYTES) { await reader.cancel(); throw new Error('AIデータが大きすぎます。'); }
      }
    } finally { reader.releaseLock(); }
    size = length; response = await cache.match(url);
  }
  if (!validSize(size)) {
    await response.body?.cancel().catch(()=>{});
    throw new Error('AIデータのサイズを確認できませんでした。別のブラウザでお試しください。');
  }
  try { return await readModel(response,size); }
  catch (error) { if (cache) { try { await cache.delete(url); } catch (_) {} } throw error; }
}
self.onmessage = async ({data}) => {
  if (running) return;
  running=true;
  try {
    if (!session) {
      report('AI処理を準備しています…');
      importScripts(RUNTIME+'ort.min.js');
      ort.env.wasm.wasmPaths=RUNTIME;
      ort.env.wasm.numThreads=1; // GitHub Pages has no cross-origin isolation headers.
      ort.env.wasm.proxy=false;
      let bytes=await modelBytes();
      report('AIモデルを展開しています…');
      session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
      bytes=null;
      if (session.inputNames[0]!=='rgb' || !session.outputNames.includes('alpha')) throw new Error('AIモデルの形式を確認できませんでした。');
    }
    report('被写体と半透明部分を推定しています…');
    const tensor=new ort.Tensor('float32',new Float32Array(data.pixels),[1,3,448,448]);
    let outputs;
    try {
      outputs=await session.run({rgb:tensor});
      const result=outputs.alpha;
      if (result.data.length!==448*448) throw new Error('AIの出力サイズが想定と異なります。');
      const alpha=Float32Array.from(result.data, v=>Math.max(0,Math.min(1,v)));
      if (!alpha.every(Number.isFinite)) throw new Error('AIの推定結果を読み取れませんでした。');
      self.postMessage({type:'result',alpha:alpha.buffer},[alpha.buffer]);
    } finally {
      tensor.dispose();
      if(outputs) for(const output of Object.values(outputs)) output.dispose();
    }
  } catch(error) {
    console.error('Image Tools matting:', error);
    self.postMessage({type:'error',text:'自動透過を完了できませんでした。'+String(error.message||error)+' スマートフォンで終了が続く場合、この455MBモデルは端末の処理上限を超える可能性があります。',detail:String(error.message||error)});
  } finally { running=false; }
};
