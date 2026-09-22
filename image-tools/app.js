(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fileInput = $('file'), dropzone = $('dropzone'), preview = $('previewImage');
  const state = { file: null, image: null, sourceUrl: null, resultUrl: null, generation: 0 };
  const formatSize = bytes => bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
  const selected = name => document.querySelector(`input[name="${name}"]:checked`).value;
  const status = message => { $('status').textContent = message; };
  function clearResult() {
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = null;
    $('result').hidden = true;
    $('download').removeAttribute('href');
    if (state.sourceUrl) { preview.src = state.sourceUrl; $('previewLabel').textContent = '元画像'; $('previewMeta').textContent = formatSize(state.file.size); }
    status('');
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
  $('quality').addEventListener('input', e => { $('qualityValue').textContent = `${e.target.value}%`; clearResult(); });
  $('matte').addEventListener('input', e => { $('matteValue').textContent = e.target.value.toUpperCase(); clearResult(); });
  $('convert').addEventListener('click', async () => {
    if (!state.image) return;
    const [width,height] = dimensions();
    if (width > 8192 || height > 8192 || width*height > 32000000) { status('出力サイズが大きすぎます。2倍または長辺2560pxを選んでください。'); return; }
    const current = state.generation;
    $('convert').disabled = true; $('convert').textContent='処理中…'; status('画像を処理しています…');
    try {
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 30)));
      const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:selected('format')==='image/png'});
      if (!ctx) throw new Error('画像処理を開始できませんでした。');
      if (selected('format')==='image/jpeg') {ctx.fillStyle=$('matte').value; ctx.fillRect(0,0,width,height);}
      ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
      ctx.drawImage(state.image,0,0,width,height);
      const format=selected('format');
      const blob=await new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('画像の保存データを作れませんでした。')),format,Number($('quality').value)/100));
      canvas.width=canvas.height=0;
      if (current !== state.generation) return;
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
