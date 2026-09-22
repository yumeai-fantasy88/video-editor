/* withoutBG v10 RGB -> continuous alpha. See AI-NOTICES.md. */
'use strict';
const ROOT = 'https://huggingface.co/withoutbg/withoutbg-openweights-onnx/resolve/cfae4da1ee09b27c45af2af2096d4d14721508ba/';
const RUNTIME = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
let session;
let running = false;
const report = (text, value) => self.postMessage({type:'progress',text,value});
async function modelBytes() {
  const url = ROOT + 'withoutbg-open-weights.onnx';
  let cache;
  try { cache = await caches.open('image-tools-matting-v10'); } catch (_) {}
  let response = cache && await cache.match(url);
  const cached = !!response;
  if (!response) response = await fetch(url);
  if (!response.ok) throw new Error('AIデータを取得できませんでした。通信状態を確認して再試行してください。');
  const total = Number(response.headers.get('content-length')) || 454500000;
  const reader = response.body.getReader();
  let chunks = [], length = 0, last = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    chunks.push(value); length += value.byteLength;
    if (length > 550000000) throw new Error('AIデータのサイズが想定と異なります。');
    if (Date.now()-last>300) {
      report(`${cached?'保存済みのAIデータ':'AIデータ'}を読み込み中… ${Math.round(length/1000000)} MB`, Math.min(.65,length/total*.65));
      last=Date.now();
    }
  }
  let bytes = new Uint8Array(length), offset=0;
  for (let i=0;i<chunks.length;i++) { bytes.set(chunks[i],offset); offset+=chunks[i].length; chunks[i]=null; }
  chunks=null;
  if (length < 100000000) throw new Error('AIデータが不完全です。もう一度お試しください。');
  // Cache only complete downloads. Cache quota failures must not block inference.
  if (!cached && cache) {
    try { await cache.put(url,new Response(bytes,{headers:{'content-type':'application/octet-stream','content-length':String(length)}})); } catch (_) {}
  }
  return bytes;
}
self.onmessage = async ({data}) => {
  if (running) return;
  running=true;
  try {
    if (!session) {
      report('AI処理を準備しています…',0);
      importScripts(RUNTIME+'ort.min.js');
      ort.env.wasm.wasmPaths=RUNTIME;
      ort.env.wasm.numThreads=1; // GitHub Pages has no cross-origin isolation headers.
      ort.env.wasm.proxy=false;
      let bytes=await modelBytes();
      report('AIモデルを展開しています…',.68);
      session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
      bytes=null;
      if (session.inputNames[0]!=='rgb' || !session.outputNames.includes('alpha')) throw new Error('AIモデルの形式を確認できませんでした。');
    }
    report('被写体と半透明部分を推定しています…',.75);
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
    self.postMessage({type:'error',text:'自動透過を完了できませんでした。通信・空きメモリを確認して再試行してください。スマートフォンで続く場合はPCでお試しください。',detail:String(error.message||error)});
  } finally { running=false; }
};
