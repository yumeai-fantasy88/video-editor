(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fileInput = $('file'), dropzone = $('dropzone'), preview = $('previewImage');
  const state = { file: null, image: null, sourceUrl: null, resultUrl: null, generation: 0, revision: 0, sampling: false };
  const formatSize = bytes => bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
  const selected = name => document.querySelector(`input[name="${name}"]:checked`).value;
  const status = message => { $('status').textContent = message; };
  function clearResult() {
    state.revision++;
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = null;
    $('result').hidden = true;
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
    if (!file) return;
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
      state.sourceUrl = nextUrl; state.file = file; state.image = img;
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
  $('removeBackground').addEventListener('change', e => {
    const removing=e.target.checked;
    $('backgroundOptions').hidden=!removing;
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
  $('convert').addEventListener('click', async () => {
    if (!state.image) return;
    const [width,height] = dimensions();
    const removing=$('removeBackground').checked;
    const pixelLimit=removing?12000000:32000000;
    if (width > 8192 || height > 8192 || width*height > pixelLimit) { status('出力サイズが大きすぎます。倍率を下げるか、長辺2560pxを選んでください。'); return; }
    const current = state.generation, revision = state.revision;
    $('convert').disabled = true; $('convert').textContent='処理中…'; status('画像を処理しています…');
    try {
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 30)));
      const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:selected('format')==='image/png'});
      if (!ctx) throw new Error('画像処理を開始できませんでした。');
      if (selected('format')==='image/jpeg') {ctx.fillStyle=$('matte').value; ctx.fillRect(0,0,width,height);}
      ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
      ctx.drawImage(state.image,0,0,width,height);
      if (removing) await removeEdgeBackground(ctx,width,height,$('backgroundColor').value,Number($('tolerance').value));
      const format=selected('format');
      const blob=await new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('画像の保存データを作れませんでした。')),format,Number($('quality').value)/100));
      canvas.width=canvas.height=0;
      if (current !== state.generation || revision !== state.revision) return;
      clearResult(); state.resultUrl=URL.createObjectURL(blob);
      preview.src=state.resultUrl; $('previewLabel').textContent='出力画像'; $('previewMeta').textContent=formatSize(blob.size);
      const ext=format==='image/png'?'png':'jpg';
      $('download').href=state.resultUrl;
      $('download').download=(state.file.name.replace(/\.[^.]+$/,'') || 'image')+`_${width}x${height}.${ext}`;
      $('resultInfo').textContent=`${width.toLocaleString()} × ${height.toLocaleString()} px · ${format==='image/png'?'PNG':'JPG'} · ${formatSize(blob.size)}`;
      $('result').hidden=false; status('');
    } catch(e) {status(e.message || '処理できませんでした。小さいサイズを試してください。');}
    finally { $('convert').disabled=false; $('convert').textContent='画像を作成'; }
  });
})();
