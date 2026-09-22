(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fileInput = $('file'), dropzone = $('dropzone'), preview = $('previewImage');
  const state = { file: null, image: null, sourceUrl: null, resultUrl: null, generation: 0, revision: 0, sampling: false, busy: false, worker: null, rejectAI: null, alphaCache: null, job: 0 };
  const formatSize = bytes => bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
  const selected = name => document.querySelector(`input[name="${name}"]:checked`).value;
  const status = message => { $('status').textContent = message; };
  function clearResult() {
    state.revision++;
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = null;
    $('result').hidden = true;
    $('compareOriginal').hidden = true; $('compareOriginal').textContent='元画像を見る';
    $('download').removeAttribute('href');
    if (state.sourceUrl) { preview.src = state.sourceUrl; $('previewLabel').textContent = '元画像'; $('previewMeta').textContent = formatSize(state.file.size); }
    status('');
  }
  function hexToRgb(hex) { return [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)); }
  async function removeEdgeBackground(ctx, width, height, hex, tolerance) {
    const image = ctx.getImageData(0,0,width,height);
    const data = image.data, count = width*height;
    const visited = new Uint8Array(count), queue = new Uint32Array(count);
    const [red,green,blue] = hexToRgb(hex);
    const core = 8 + tolerance*2.2, feather = 18;
    let head = 0, tail = 0;
    function tryPixel(index) {
      if (visited[index]) return;
      visited[index] = 1;
      const p = index*4;
      const dr=data[p]-red, dg=data[p+1]-green, db=data[p+2]-blue;
      const distance = Math.sqrt(dr*dr+dg*dg+db*db);
      if (data[p+3] !== 0 && distance > core+feather) return;
      data[p+3] = Math.round(data[p+3] * Math.min(1,Math.max(0,(distance-core)/feather)));
      queue[tail++] = index;
    }
    for (let x=0;x<width;x++) { tryPixel(x); tryPixel((height-1)*width+x); }
    for (let y=1;y<height-1;y++) { tryPixel(y*width); tryPixel(y*width+width-1); }
    while (head<tail) {
      const stop=Math.min(tail,head+120000);
      while (head<stop) {
        const i=queue[head++], x=i%width;
        if (x>0) tryPixel(i-1);
        if (x<width-1) tryPixel(i+1);
        if (i>=width) tryPixel(i-width);
        if (i<count-width) tryPixel(i+width);
      }
      if (head<tail) await new Promise(resolve => setTimeout(resolve,0));
    }
    ctx.putImageData(image,0,0);
  }
  function dimensions() {
    const factor = Number(selected('size'));
    const width = state.image.naturalWidth, height = state.image.naturalHeight;
    const scale = factor === 2560 ? Math.max(1, 2560 / Math.max(width, height)) : factor;
    return [Math.round(width * scale), Math.round(height * scale)];
  }
  function updateDimensions() {
    if (!state.image) return;
    const [w,h] = dimensions();
    $('outputDimensions').textContent = `${w.toLocaleString()} × ${h.toLocaleString()} px`;
    clearResult();
  }
  async function loadFile(file) {
    if (!file || state.busy) return;
    const valid = ['image/png','image/jpeg'].includes(file.type) || /\.(png|jpe?g)$/i.test(file.name);
    if (!valid) { status('PNGまたはJPG画像を選んでください。'); return; }
    const current = ++state.generation;
    const nextUrl = URL.createObjectURL(file);
    const img = new Image();
    try {
      await new Promise((resolve,reject) => { img.onload=resolve; img.onerror=reject; img.src=nextUrl; });
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('画像のサイズを読み取れませんでした。');
      if (current !== state.generation) { URL.revokeObjectURL(nextUrl); return; }
      clearResult();
      if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
      state.sourceUrl = nextUrl; state.file = file; state.image = img; state.alphaCache=null;
      $('sourceInfo').hidden = false;
      $('sourceInfo').replaceChildren();
      const strong = document.createElement('strong'); strong.textContent = file.name;
      $('sourceInfo').append(strong, document.createElement('br'), `${img.naturalWidth.toLocaleString()} × ${img.naturalHeight.toLocaleString()} px · ${formatSize(file.size)}`);
      $('empty').hidden = true; preview.hidden = false; preview.src = nextUrl;
      $('previewLabel').textContent = '元画像'; $('previewMeta').textContent = formatSize(file.size);
      $('convert').disabled = false;
      updateDimensions();
    } catch(e) { URL.revokeObjectURL(nextUrl); if (current === state.generation) status(e.message || '画像を開けませんでした。'); }
  }
  fileInput.addEventListener('change', () => { loadFile(fileInput.files[0]); fileInput.value=''; });
  ['dragenter','dragover'].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
  document.querySelectorAll('input[name="size"]').forEach(el => el.addEventListener('change',updateDimensions));
  document.querySelectorAll('input[name="format"]').forEach(el => el.addEventListener('change', () => { $('jpgOptions').hidden = selected('format') !== 'image/jpeg'; clearResult(); }));
  function methodUI() {
    const ai=$('removalMethod').value==='ai';
    $('aiOptions').hidden=!ai; $('colorOptions').hidden=ai;
    state.sampling=false; $('sampleHint').hidden=true; preview.classList.remove('sampling');
  }
  $('removalMethod').addEventListener('change',()=>{methodUI();clearResult();});
  $('decontaminate').addEventListener('input',e=>{$('decontaminateValue').textContent=e.target.value+'%';clearResult();});
  document.querySelectorAll('[data-bg]').forEach(button=>button.addEventListener('click',()=>{
    const box=$('previewBox'),colour=button.dataset.bg;
    box.style.backgroundImage=colour==='checker'?'':'none';
    box.style.backgroundColor=colour==='checker'?'':colour;
    document.querySelectorAll('[data-bg]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  }));
  $('compareOriginal').addEventListener('click',()=>{
    const original=$('compareOriginal').textContent==='元画像を見る';
    preview.src=original?state.sourceUrl:state.resultUrl;
    $('previewLabel').textContent=original?'元画像':'出力画像';
    $('compareOriginal').textContent=original?'出力画像を見る':'元画像を見る';
  });
  $('removeBackground').addEventListener('change', e => {
    const removing=e.target.checked;
    $('backgroundOptions').hidden=!removing; methodUI();
    $('jpegFormat').disabled=removing;
    if (removing) document.querySelector('input[name="format"][value="image/png"]').checked=true;
    $('jpgOptions').hidden=removing || selected('format') !== 'image/jpeg';
    state.sampling=false; $('sampleHint').hidden=true; preview.classList.remove('sampling');
    clearResult();
  });
  $('backgroundColor').addEventListener('input', e => { $('backgroundColorValue').textContent=e.target.value.toUpperCase(); clearResult(); });
  $('tolerance').addEventListener('input', e => { $('toleranceValue').textContent=e.target.value; clearResult(); });
  $('sampleColor').addEventListener('click', () => {
    if (!state.image) { status('先に画像を選択してください。'); return; }
    clearResult(); state.sampling=true; $('sampleHint').hidden=false;
    preview.classList.add('sampling'); $('previewBox').scrollIntoView({behavior:'smooth',block:'center'});
  });
  preview.addEventListener('click', e => {
    if (!state.sampling || !state.image) return;
    const rect=preview.getBoundingClientRect();
    const sx=Math.min(state.image.naturalWidth-1,Math.max(0,Math.floor((e.clientX-rect.left)/rect.width*state.image.naturalWidth)));
    const sy=Math.min(state.image.naturalHeight-1,Math.max(0,Math.floor((e.clientY-rect.top)/rect.height*state.image.naturalHeight)));
    const canvas=document.createElement('canvas'); canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(state.image,sx,sy,1,1,0,0,1,1);
    const rgb=ctx.getImageData(0,0,1,1).data;
    const color='#'+Array.from(rgb.slice(0,3),v=>v.toString(16).padStart(2,'0')).join('');
    $('backgroundColor').value=color; $('backgroundColorValue').textContent=color.toUpperCase();
    state.sampling=false; $('sampleHint').hidden=true; preview.classList.remove('sampling'); clearResult();
  });
  $('quality').addEventListener('input', e => { $('qualityValue').textContent = `${e.target.value}%`; clearResult(); });
  $('matte').addEventListener('input', e => { $('matteValue').textContent = e.target.value.toUpperCase(); clearResult(); });
  let disabledBefore=[];
  function busy(value) {
    state.busy=value;
    const panel=document.querySelector('.settings'); panel.setAttribute('aria-busy',String(value));
    if(value) {
      disabledBefore=Array.from(panel.querySelectorAll('input,select,button')).map(el=>[el,el.disabled]);
      disabledBefore.forEach(([el])=>{if(el.id!=='cancel')el.disabled=true;});
    } else {disabledBefore.forEach(([el,disabled])=>el.disabled=disabled);disabledBefore=[];}
    $('cancel').hidden=!value; $('progress').hidden=!value;
    $('convert').textContent=value?'処理中…':'画像を作成';
  }
  function stopAI() {
    state.worker?.terminate();state.worker=null;
    if(state.rejectAI){state.rejectAI(new DOMException('処理を中止しました。','AbortError'));state.rejectAI=null;}
  }
  $('cancel').addEventListener('click',()=>{state.job++;stopAI();busy(false);status('処理を中止しました。');});
  async function estimateAlpha(image) {
    if(state.alphaCache)return state.alphaCache;
    const shape=ImageAlpha.letterbox(image.naturalWidth,image.naturalHeight);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=448;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#000';ctx.fillRect(0,0,448,448);
    ctx.drawImage(image,0,0,shape.width,shape.height);
    const rgba=ctx.getImageData(0,0,448,448).data;
    const tensor=ImageAlpha.rgbTensor(rgba);
    canvas.width=canvas.height=0;
    const worker=new Worker('matting-worker.js?v=3');state.worker=worker;
    const alpha=await new Promise((resolve,reject)=>{
      state.rejectAI=reject;
      worker.onmessage=({data})=>{
        if(data.type==='progress') {status(data.text);$('progress').value=data.value;}
        if(data.type==='result')resolve(new Float32Array(data.alpha));
        if(data.type==='error')reject(new Error(data.text));
      };
      worker.onerror=()=>reject(new Error('AI処理を起動できませんでした。通信状態とブラウザを確認してください。'));
      worker.postMessage({pixels:tensor.buffer},[tensor.buffer]);
    }).finally(()=>{worker.terminate();if(state.worker===worker){state.worker=null;state.rejectAI=null;}});
    const estimate=ImageAlpha.backgroundEstimate(rgba,alpha,shape.width,shape.height);
    state.alphaCache={alpha,shape,...estimate};return state.alphaCache;
  }
  async function applyMatting(ctx,width,height,cache,strength,job) {
    status('半透明PNGを作成しています…');$('progress').value=.92;
    const {alpha,shape,background,distance}=cache;
    const mask=document.createElement('canvas');mask.width=shape.width;mask.height=shape.height;
    const mc=mask.getContext('2d'),maskData=mc.createImageData(shape.width,shape.height);
    for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++) {
      const i=y*shape.width+x,a=Math.round(alpha[y*448+x]*255);
      maskData.data[i*4]=maskData.data[i*4+1]=maskData.data[i*4+2]=a;maskData.data[i*4+3]=255;
    }
    mc.putImageData(maskData,0,0);
    const scaled=document.createElement('canvas');scaled.width=width;scaled.height=height;
    const sc=scaled.getContext('2d',{willReadFrequently:true});sc.drawImage(mask,0,0,width,height);
    const alphas=sc.getImageData(0,0,width,height).data;
    const output=ctx.getImageData(0,0,width,height),pixels=output.data;
    for(let y=0;y<height;y++) {
      const sy=Math.min(shape.height-1,Math.floor((y+.5)*shape.height/height));
      for(let x=0;x<width;x++) {
        const i=y*width+x,p=i*4,a=alphas[p]/255;
        const sx=Math.min(shape.width-1,Math.floor((x+.5)*shape.width/width)),b=sy*shape.width+sx;
        const confidence=distance[b]<0?0:Math.max(0,1-distance[b]/(Math.max(shape.width,shape.height)*.35));
        ImageAlpha.compositePixel(pixels,p,a,background,b,strength,confidence);
      }
      if(y%64===0) {await new Promise(r=>setTimeout(r,0));if(job!==state.job)throw new DOMException('中止','AbortError');}
    }
    ctx.putImageData(output,0,0);mask.width=mask.height=scaled.width=scaled.height=0;
  }
  $('convert').addEventListener('click', async () => {
    if (!state.image || state.busy) return;
    const [width,height]=dimensions(),removing=$('removeBackground').checked;
    if(width>8192 || height>8192 || width*height>(removing?12000000:32000000)) {
      status('出力サイズが大きすぎます。倍率を下げてください。');return;
    }
    const image=state.image,format=selected('format'),method=$('removalMethod').value;
    const strength=Number($('decontaminate').value)/100,current=state.generation,job=++state.job;
    clearResult();const revision=state.revision;
    busy(true);$('progress').removeAttribute('value');status('画像を処理しています…');
    let canvas;
    try {
      const cache=removing&&method==='ai'?await estimateAlpha(image):null;
      if(job!==state.job)return;
      canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:format==='image/png',willReadFrequently:removing});
      if(!ctx)throw new Error('画像処理を開始できませんでした。');
      if(format==='image/jpeg'){ctx.fillStyle=$('matte').value;ctx.fillRect(0,0,width,height);}
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,width,height);
      if(cache)await applyMatting(ctx,width,height,cache,strength,job);
      else if(removing)await removeEdgeBackground(ctx,width,height,$('backgroundColor').value,Number($('tolerance').value));
      if(job!==state.job)return;
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('保存データを作れませんでした。')),format,Number($('quality').value)/100));
      if(current!==state.generation || revision!==state.revision || job!==state.job)return;
      state.resultUrl=URL.createObjectURL(blob);preview.src=state.resultUrl;
      $('previewLabel').textContent='出力画像';$('previewMeta').textContent=formatSize(blob.size);
      const ext=format==='image/png'?'png':'jpg';
      $('download').href=state.resultUrl;
      $('download').download=(state.file.name.replace(/\.[^.]+$/,'')||'image')+`_${width}x${height}.${ext}`;
      $('resultInfo').textContent=`${width.toLocaleString()} × ${height.toLocaleString()} px · ${ext.toUpperCase()} · ${formatSize(blob.size)}`;
      $('result').hidden=false;$('compareOriginal').hidden=false;
      status(cache?'自動透過を作成しました。白・黒の背景で、半透明部分と元背景の残りを確認できます。':'');
    } catch(e) {if(job===state.job)status(e.message||'処理できませんでした。');}
    finally {if(canvas)canvas.width=canvas.height=0;if(job===state.job)busy(false);}
  });
})();
