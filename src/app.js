import {initFullscreenPreview} from './fullscreen-preview.js';
import {looks,matchGains,imageMean} from './color-settings.js';
import {newProject,id,clip,layout,total,duration,frameDuration,splitClip,gradeDefault,parseSrt,validateProject,clamp} from './model.js';
import {assets,loadAsset,assetMeta,Renderer,dimensions,mixAudio,exportVideo,AudioReadSession} from './engine.js';
import {extraFonts} from './fonts.js';
import {pictureEnd,textPlacement} from './model.js';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let p=newProject(),selected=null,tab='edit',time=0,before=false,playing=false,playingToken=0,renderBusy=false,renderAgain=false,busy=false,zoom=60,undo=[],redo=[],reconnecting=false,audioContext,scheduled=[],exportController,downloadUrl;
let previewAudioSession;
let renderer;try{renderer=new Renderer($('#preview'));}catch(e){status(e.message);}
let fonts=['system-ui','sans-serif','serif','monospace','"Hiragino Sans", sans-serif','"Hiragino Mincho ProN", serif','"Yu Gothic", sans-serif','"Yu Mincho", serif'];
const fontNames=['標準','ゴシック','明朝','等幅','ヒラギノ角ゴ','ヒラギノ明朝','游ゴシック','游明朝'];
fonts.push(...extraFonts.map(f=>`"${f}", sans-serif`));fontNames.push(...extraFonts);
let presets={};try{presets=JSON.parse(localStorage.getItem('density-presets')||'{}');}catch{}
function status(s){$('#status').textContent=s;}
function checkpoint(){stop();undo.push(JSON.stringify(p));if(undo.length>60)undo.shift();redo=[];}
function current(){return [...p.clips,...p.audio,...p.texts].find(c=>c.id===selected);}
function format(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(3).padStart(6,'0')}`;}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function refresh(rebuild=true){$('#fullscreenOpen').disabled=!p.clips.length;time=clamp(time,0,total(p));$('.screen').style.setProperty('--preview-ratio',p.ratio.replace(':',' / '));$('#empty').hidden=!!p.clips.length;$('#formatBadge').textContent=`${p.ratio} · ${p.fps} fps`;$('#scrub').max=total(p);$('#scrub').step=1/p.fps;$('#scrub').value=time;$('#timecode').textContent=`${format(time)} / ${format(total(p))}`;$('#projectName').value=p.name;$('#undo').disabled=!undo.length;$('#redo').disabled=!redo.length;timeline();if(rebuild)panel();requestRender();}
async function requestRender(){if(!renderer||busy)return;if(renderBusy){renderAgain=true;return;}renderBusy=true;try{const [w,h]=dimensions(p.ratio,960);if($('#preview').width!==w||$('#preview').height!==h){$('#preview').width=w;$('#preview').height=h;}await renderer.render(p,Math.min(time,Math.max(0,total(p)-1/p.fps)),before);}catch(e){stop();status(e.message);}finally{renderBusy=false;if(renderAgain){renderAgain=false;requestRender();}}}
function timeline(){const placed=layout(p),max=Math.max(total(p)+2,8),width=Math.max(300,max*zoom);let html='<div class="ruler">';const step=zoom<40?5:1;for(let s=0;s<max;s+=step)html+=`<span class="tick" style="left:${s*zoom}px">${s}s</span>`;html+='</div>';
  const track=(items,kind)=>`<div class="track">${items.map(c=>`<button class="block ${kind} ${c.id===selected?'selected':''}" data-select="${c.id}" style="left:${c.start*zoom}px;width:${Math.max(16,(c.end-c.start)*zoom)}px" title="${esc(c.name||c.text)}">${esc(c.name||c.text)}<small>${(c.end-c.start).toFixed(2)}s ${c.speed?`· ${c.speed.toFixed(2)}×`:''}</small></button>`).join('')}</div>`;
  html+=track(placed,'video');
  // Separate lanes keep overlapping audio/text independently selectable.
  function lanes(items,kind){const rows=[];for(const c of items){let r=rows.find(r=>r.every(x=>x.end<=c.start||x.start>=c.end));if(!r)rows.push(r=[]);r.push(c);}return (rows.length?rows:[[]]).map(r=>track(r,kind)).join('');}
  html+=lanes(p.audio.map(c=>({...c,end:c.start+duration(c)})),'audio');html+=lanes(p.texts,'text');html+=`<div class="playhead" style="left:${time*zoom}px"></div>`;$('#timeline').style.width=width+'px';$('#timeline').innerHTML=html;
}
const range=(key,label,value,min,max,step=.01)=>`<div class="control"><div class="control-head"><label for="${key}-slider">${label}</label><input type="number" data-key="${key}" aria-label="${label} 数値" value="${Number(value).toFixed(step>=1?0:step===.001?3:2)}" min="${min}" max="${max}" step="${step}"></div><input id="${key}-slider" type="range" data-key="${key}" aria-label="${label}" value="${value}" min="${min}" max="${max}" step="${step}"></div>`;
const number=(key,label,value,min=0,max=86400,step=.001)=>`<div class="control"><div class="control-head"><label>${label}</label><input type="number" aria-label="${label}" data-key="${key}" value="${Number(value).toFixed(3)}" min="${min}" max="${max}" step="${step}"></div></div>`;
const btn=(action,label,cls='')=>`<button data-action="${action}" class="${cls}">${label}</button>`;
function presetName(grade,name,choices){
  const same=value=>Object.entries({...gradeDefault(),...value}).every(([k,v])=>Math.abs((grade[k]??gradeDefault()[k])-v)<1e-8);
  if(Object.hasOwn(choices,name))return {name,modified:!same(choices[name])};
  return {name:Object.keys(choices).find(k=>same(choices[k]))||'',modified:false};
}
function syncColorControls(){
  const c=current();if(!c||tab!=='color')return;
  for(const el of $('#panel').querySelectorAll('[data-key],[data-color-toggle]')){
    const path=el.dataset.key||el.dataset.colorToggle;if(!/^[gl]\./.test(path))continue;
    const value=(path.startsWith('g.')?c.grade:p.look)?.[path.slice(2)];
    if(el.dataset.colorToggle)el.checked=!!value;else el.value=el.type==='number'?Number(value).toFixed(2):value;
  }
  for(const [id,grade,name,choices] of [['lookSelect',p.look,p.lookPreset,looks],['presetSelect',c.grade,c.gradePreset,presets]]){
    const select=$('#'+id);if(!select)continue;
    const state=presetName(grade,name,choices);
    for(const option of select.options)if(option.value){const value=option.value;option.value=value;option.textContent=value+(value===state.name&&state.modified?'（調整済み）':'');}
    select.value=state.name;
  }
}
const panelSectionState=new Map();
function panel(){
  for(const section of $('#panel').querySelectorAll('details[data-panel-section]'))panelSectionState.set(section.dataset.panelSection,section.open);
  const c=current(),visual=c&&p.clips.includes(c),audio=c&&(p.audio.includes(c)||visual),text=c&&p.texts.includes(c);let html='';
  if(tab==='edit'){
    html='<h2>クリップ編集</h2>';
    if(!visual)html+='<p class="sub">映像トラックのクリップを選択してください。</p>'+btn('import','＋ 動画・画像を追加','wide');
    else{const a=assets.get(c.asset)||p.assets.find(a=>a.id===c.asset);html+=`<p class="sub">${esc(c.name)}</p><div class="button-grid">${btn('left','← 前へ')}${btn('right','後ろへ →')}${btn('split','再生位置で分割')}${btn('duplicate','複製')}</div>`;
      html+='<h3>サイズ・位置</h3><div class="button-grid">'+btn('fill','画面を埋める')+btn('fit','全体を表示')+'</div>'+range('zoom','拡大率（倍）',c.zoom,.1,5,.01)+range('offsetX','左右の位置（％）',c.offsetX??0,-100,100,.1)+range('offsetY','上下の位置（％）',c.offsetY??0,-100,100,.1)+btn('positionReset','位置を中央に戻す','wide')+'<p class="sub">「画面を埋める」は画面外の部分を切り取ります。素材に黒帯が含まれる場合は、拡大率を少し上げて調整してください。</p>';
      html+=number('in','素材の開始位置（秒）',c.in,0,a.kind==='image'?86400:a.duration)+number('out','素材の終了位置（秒）',c.out,0,a.kind==='image'?86400:a.duration);
      html+='<h3>速度と仕上がりの尺</h3>'+number('speed','再生速度（倍）',c.speed,.05,20,.001)+number('target','希望する尺（秒）',c.requested??duration(c),1/p.fps,86400);
      html+=`<p class="notice">実際の尺 <strong>${frameDuration(duration(c),p.fps).toFixed(3)}秒</strong> · ${Math.round(duration(c)*p.fps)}フレーム<br>音声が付いたままの速度変更では音程も変わります。元の速さを保つ場合は先に音声を分離してください。</p>`;
      html+=btn('detach','音声を別トラックへ分離','wide')+btn('delete','クリップを削除','wide danger');
    }
  }
  if(tab==='audio'){
    html='<h2>音声ミックス</h2><p class="sub">元音声・BGM・効果音をそれぞれ調整</p>'+btn('import','＋ BGM・効果音を追加','wide');
    html+='<div class="item-list">'+[...p.clips,...p.audio].map(x=>`<button data-select="${x.id}" class="${selected===x.id?'active':''}">${esc(x.name)} ${p.clips.includes(x)?'［元音声］':''}</button>`).join('')+'</div>';
    if(audio){html+='<h3>'+esc(c.name)+'</h3>'+range('volume','音量',c.volume,0,2)+number('fadeIn','音声フェードイン（秒）',c.fadeIn,0,duration(c))+number('fadeOut','音声フェードアウト（秒）',c.fadeOut,0,duration(c));
      if(p.audio.includes(c))html+=number('start','配置位置（秒）',c.start)+number('in','素材の開始（秒）',c.in)+number('out','素材の終了（秒）',c.out)+number('speed','速度（倍）',c.speed,.05,20)+btn('delete','音声クリップを削除','wide danger');else html+=btn('detach','音声を分離','wide');
      html+='<p class="sub">合計音量が大きいと音割れします。複数の音声を重ねるときは音量を下げてください。</p>';
    }
  }
  if(tab==='text'){
    html='<h2>字幕とテキスト</h2><div class="button-grid">'+btn('addText','＋ テキスト')+btn('srt','SRTを読み込む')+'</div><div class="item-list">'+p.texts.map(x=>`<button data-select="${x.id}" class="${selected===x.id?'active':''}">${esc(x.text)}</button>`).join('')+'</div>';
    if(text){if(pictureEnd(p)&&c.end>pictureEnd(p))html+='<p class="notice">この字幕は映像の終了（'+pictureEnd(p).toFixed(3)+'秒）を越えています。映像がない区間は黒背景になります。</p>'+btn('fitText','字幕を映像の時間内に収める','wide');html+=`<h3>表示内容</h3><textarea data-field="text" aria-label="字幕テキスト">${esc(c.text)}</textarea><label>フォント<select data-field="font">${fonts.map((f,i)=>`<option value="${esc(f)}" ${c.font===f?'selected':''}>${esc(fontNames[i]||f)}</option>`).join('')}</select></label>`+btn('font','＋ フォントファイルを追加','wide');
      html+=number('start','表示開始（秒）',c.start)+number('end','表示終了（秒）',c.end)+range('size','文字サイズ（画面高％）',c.size,1,20,.1)+range('x','横位置（％）',c.x,0,100,1)+range('y','縦位置（％）',c.y,0,100,1)+range('stroke','縁取り（1080p基準px）',c.stroke,0,16,1);
      html+=`<div class="button-grid"><label>文字色 <input type="color" data-field="color" value="${esc(c.color)}"></label><label>縁取り色 <input type="color" data-field="outline" value="${esc(c.outline)}"></label></div><label class="check"><input type="checkbox" data-field="bold" ${c.bold?'checked':''}>太字</label><label class="check"><input type="checkbox" data-field="background" ${c.background?'checked':''}>背景をつける</label>`+btn('delete','テキストを削除','wide danger');
    }
  }
  if(tab==='effects'){
    html='<h2>エフェクト</h2>';
    if(!visual)html+='<p class="sub">映像クリップを選択してください。</p>';
    else html+=`<p class="sub">${esc(c.name)}</p>`+range('rotation','回転（度）',c.rotation,-180,180,1)+range('zoom','ズーム（倍）',c.zoom,.1,5)+number('videoFadeIn','映像フェードイン（秒）',c.videoFadeIn,0,duration(c))+number('videoFadeOut','映像フェードアウト（秒）',c.videoFadeOut,0,duration(c))+number('transition','前の映像とのクロスフェード（秒）',c.transition,0,duration(c)/2)+'<p class="sub">クロスフェードは映像を重ねるため全体の尺が短くなります。前後クリップの半分の長さまで適用します。音声フェードは音声パネルで別に調整できます。</p>';
  }
  if(tab==='color'){
    html='<h2>カラーと質感 <span class="pill">SDR</span></h2>';
    if(!visual)html+='<p class="sub">映像クリップを選択してください。</p>';
    else{
      const g={...gradeDefault(),...c.grade};c.grade=g;p.look??=gradeDefault();const look=p.look;
      const toggle=(key,label,v)=>'<label class="check"><input type="checkbox" data-color-toggle="'+key+'" '+(v?'checked':'')+'>'+label+'</label>';
      const controls=(prefix,obj,rows)=>rows.map(([k,l,min,max])=>range(prefix+k,l,obj[k],min,max)).join('');
      const tone=[['exposure','露出（EV）',-3,3],['contrast','コントラスト',0,2],['pivot','コントラスト・ピボット',.05,.95],['black','黒レベル',-.3,.3],['white','白レベル',.5,1.5],['shadows','シャドウ',-1,1],['highlights','ハイライト',-1,1],['temperature','色温度：寒色 ← → 暖色',-1,1],['tint','色かぶり：マゼンタ ← → 緑',-1,1],['saturation','彩度',0,2]];
      html+='<p class="sub">'+esc(c.name)+'</p><details open data-panel-section="noise"><summary>1 · ノイズを抑える</summary>'+toggle('g.noiseOn','ノイズ除去を有効にする',g.noiseOn)+controls('g.',g,[['denoiseChroma','色ノイズ',0,1],['denoiseLuma','輝度ノイズ',0,1]])+'<p class="sub">初期値は両方0（処理なし）。輪郭を保つ軽量な空間処理です。</p></details>';
      html+='<details open data-panel-section="correction"><summary>2 · クリップの色と明暗</summary>'+toggle('g.correctionOn','クリップ補正 ON',g.correctionOn)+controls('g.',g,tone)+'</details>';
      html+='<details open data-panel-section="matching"><summary>3 · クリップ同士を揃える</summary><label>基準クリップ<select id="referenceClip"><option value="">選択してください</option>'+p.clips.filter(x=>x.id!==c.id).map(x=>'<option value="'+x.id+'" '+(p.referenceClip===x.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label><div class="button-grid">'+btn('referenceView','基準と並べて比較')+btn('matchColor','色合わせを補助')+'</div>'+range('g.matchStrength','色合わせの適用強度',g.matchStrength,0,1)+'<div id="referenceResult"></div><p class="sub">各クリップの中央フレームの平均色・明るさを比較します。構図が異なる場合は強度を下げて調整してください。</p></details>';
      html+='<details data-panel-section="clip-look"><summary>4 · クリップのルック</summary>'+toggle('g.lookOn','クリップルック ON',g.lookOn)+controls('g.',g,[['density','デンシティー',-1,2],['depth','中間色・暗部へ集中',0,1],['protect','ハイライト保護',0,1],['curveLow','カーブ：暗部（25%）',-.2,.2],['curveMid','カーブ：中間（50%）',-.2,.2],['curveHigh','カーブ：明部（75%）',-.2,.2],['fade','退色',0,.5]]);
      for(const [k,label] of [['red','赤'],['yellow','黄'],['green','緑'],['cyan','シアン'],['blue','青'],['magenta','マゼンタ']])html+=range('g.'+k,label+' デンシティー',g[k],-1,1)+range('g.sat'+k[0].toUpperCase()+k.slice(1),label+' 彩度調整',g['sat'+k[0].toUpperCase()+k.slice(1)],-1,1);
      html+='</details><details data-panel-section="clip-texture"><summary>クリップの質感</summary>'+toggle('g.textureOn','クリップ質感 ON',g.textureOn)+controls('g.',g,[['grain','粒子',0,1],['bleed','色のにじみ（横方向）',0,1],['scanlines','走査線（横縞）',0,1]])+'</details>';
      html+='<details open data-panel-section="global-look"><summary>作品全体のルック・質感</summary><p class="sub">すべての映像に適用。字幕にはかかりません。</p><label>作品プリセット<select id="lookSelect"><option value="">選択してください</option>'+Object.keys(looks).map(k=>'<option>'+k+'</option>').join('')+'</select></label>'+toggle('l.lookOn','全体ルック ON',look.lookOn)+controls('l.',look,[...tone,['density','全体デンシティー',-1,2],['curveLow','カーブ：暗部',-.2,.2],['curveMid','カーブ：中間',-.2,.2],['curveHigh','カーブ：明部',-.2,.2],['fade','退色',0,.5]])+toggle('l.textureOn','全体質感 ON',look.textureOn)+controls('l.',look,[['grain','粒子',0,1],['bleed','色のにじみ（横方向）',0,1],['scanlines','走査線（横縞）',0,1]])+'<p class="sub">色のにじみ：輪郭の色が横に広がります。走査線：画面に横縞を重ねます。0で効果なし、1で最大です。</p>'+btn('lookReset','全体ルック・質感をリセット','wide')+'</details>';
      html+='<div class="button-grid">'+btn('gradeAll','クリップ設定を全クリップに適用')+btn('gradeReset','選択クリップをリセット')+btn('presetSave','クリップ設定を保存')+btn('presetExport','クリップ設定をダウンロード')+'</div><label>保存済みクリップ設定<select id="presetSelect"><option value="">選択してください</option>'+Object.keys(presets).map(k=>'<option>'+esc(k)+'</option>').join('')+'</select></label>';
    }
  }
  $('#panel').innerHTML=html;
  syncColorControls();
  for(const section of $('#panel').querySelectorAll('details[data-panel-section]')){
    if(panelSectionState.has(section.dataset.panelSection))section.open=panelSectionState.get(section.dataset.panelSection);
  }
}
async function importFiles(files){stop();busy=true;$('#workspace').inert=true;try{checkpoint();for(const file of files){status(`${file.name} を読み込み中…`);try{
    if(file.name.endsWith('.density.json')){const parsed=JSON.parse(await file.text());if(parsed.type!=='density-grade')throw Error('カラー設定ではありません');const g={...gradeDefault(),...parsed.grade};for(const v of Object.values(g))if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>4)throw Error('カラー値が不正です');presets[file.name.replace('.density.json','')]=g;localStorage.setItem('density-presets',JSON.stringify(presets));continue;}
    const match=reconnecting?p.assets.find(a=>a.name===file.name&&a.size===file.size):null;
    if(reconnecting&&!match){status(`${file.name}: 一致する素材がありません`);continue;}
    const a=await loadAsset(file,match?.id);if(!match){p.assets.push(assetMeta(a));const c=clip(a);if(a.kind==='audio'){c.start=time;p.audio.push(c);tab='audio';}else{p.clips.push(c);tab='edit';time=layout(p).at(-1).start;}selected=c.id;}
  }catch(e){status(`${file.name}: ${e.message}`);alert(`${file.name}\n${e.message}`);}}
  }finally{busy=false;reconnecting=false;$('#workspace').inert=false;updateTabs();refresh();const missing=p.assets.filter(a=>!assets.has(a.id));status(missing.length?`未接続の素材：${missing.map(a=>a.name).join('、')}`:'素材を読み込みました');}}
function chooseMedia(relink=false){reconnecting=relink;$('#mediaInput').accept='video/*,audio/*,image/*,.density.json';$('#mediaInput').click();}
$('#mediaInput').onchange=e=>{importFiles([...e.target.files]);e.target.value='';};
for(const selector of ['#import','#firstImport'])$(selector).onclick=()=>chooseMedia();
function updateTabs(){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));}
$('#tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b){tab=b.dataset.tab;updateTabs();panel();}};
$('#timeline').onclick=e=>{const b=e.target.closest('[data-select]');if(b){stop();selected=b.dataset.select;const c=current();time=p.clips.includes(c)?layout(p).find(x=>x.id===c.id).start:c.start;if(p.texts.includes(c))tab='text';else if(p.audio.includes(c))tab='audio';updateTabs();refresh();}else{stop();const r=$('#timeline').getBoundingClientRect();time=clamp(Math.round((e.clientX-r.left)/zoom*p.fps)/p.fps,0,total(p));refresh(false);}};
$('#panel').onclick=async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.select){stop();selected=b.dataset.select;const item=current();if(p.texts.includes(item))time=item.start;refresh();return;}const action=b.dataset.action,c=current();if(['import','srt','font'].includes(action)){if(action==='import')chooseMedia();else $(action==='srt'?'#srtInput':'#fontInput').click();return;}
  if(action==='presetExport'){saveBlob(new Blob([JSON.stringify({type:'density-grade',grade:c.grade},null,2)],{type:'application/json'}),'look.density.json');return;}
  if(action==='presetSave'){const name=prompt('プリセット名');if(name){presets[name]=structuredClone(c.grade);try{localStorage.setItem('density-presets',JSON.stringify(presets));}catch{status('保存容量が不足しています。設定をダウンロードしてください');}panel();}return;}
  if(action==='referenceView'||action==='matchColor'){await compareClips(action==='matchColor');return;}
  checkpoint();
  if(action==='lookReset'){p.look=gradeDefault();delete p.lookPreset;}
  if(action==='fill'||action==='fit'){c.fit=action==='fill'?'cover':'contain';c.zoom=1;c.offsetX=0;c.offsetY=0;}
  if(action==='positionReset'){c.offsetX=0;c.offsetY=0;}
  if(action==='addText'){const t={id:id(),text:'テキスト',...textPlacement(p,time),font:'sans-serif',size:5,x:50,y:85,stroke:3,color:'#ffffff',outline:'#000000',bold:false,background:false};p.texts.push(t);selected=t.id;time=t.start;}
  if(action==='fitText'){Object.assign(c,textPlacement(p,c.start,c.end-c.start));time=c.start;}
  if(action==='delete'){for(const key of ['clips','audio','texts'])p[key]=p[key].filter(x=>x.id!==selected);selected=null;}
  if(action==='left'||action==='right'){const i=p.clips.indexOf(c),j=i+(action==='left'?-1:1);if(j>=0&&j<p.clips.length)[p.clips[i],p.clips[j]]=[p.clips[j],p.clips[i]];}
  if(action==='duplicate'){const copy=structuredClone(c);copy.id=id();p.clips.splice(p.clips.indexOf(c)+1,0,copy);selected=copy.id;}
  if(action==='split'&&!splitClip(p,c.id,time))status('クリップの内側へ再生位置を動かしてください。クロスフェード付近は先にクロスフェードを短くしてください。');
  if(action==='detach'){const a=assets.get(c.asset);if(!a?.audio)status('このクリップには分離できる音声がありません');else{const copy=structuredClone(c);copy.id=id();copy.start=layout(p).find(x=>x.id===c.id).start;copy.name+=' · 音声';p.audio.push(copy);c.volume=0;selected=copy.id;tab='audio';}}
  if(action==='gradeReset'){c.grade=gradeDefault();delete c.gradePreset;}
  if(action==='gradeAll')p.clips.forEach(x=>x.grade=structuredClone(c.grade));
  updateTabs();refresh();
};
let gestureKey=null;
$('#panel').addEventListener('focusin',()=>gestureKey=null);
$('#panel').addEventListener('pointerdown',()=>gestureKey=null);
function editControl(e){const el=e.target,c=current();if(!c)return;if(e.type==='input'&&(el.tagName==='SELECT'||el.type==='checkbox'))return;
  if(el.id==='referenceClip'){checkpoint();p.referenceClip=el.value;return;}
  if(el.id==='lookSelect'){if(looks[el.value]){checkpoint();p.lookPreset=el.value;p.look={...gradeDefault(),...looks[el.value]};syncColorControls();refresh(false);}return;}
  if(el.dataset.colorToggle){checkpoint();const [scope,key]=el.dataset.colorToggle.split('.');(scope==='g'?c.grade:p.look)[key]=el.checked?1:0;syncColorControls();refresh(false);return;}
  if(el.id==='presetSelect'){if(el.value){checkpoint();c.gradePreset=el.value;c.grade={...gradeDefault(),...structuredClone(presets[el.value])};syncColorControls();refresh(false);}return;}
  const key=el.dataset.key,field=el.dataset.field;if(!key&&!field)return;
  if(gestureKey!==(key||field)){checkpoint();gestureKey=key||field;}
  if(field)c[field]=el.type==='checkbox'?el.checked:el.value;
  else{let v=Number(el.value);if(!Number.isFinite(v)||el.value==='')return;v=clamp(v,Number(el.min),Number(el.max));
    if(key.startsWith('l.'))p.look[key.slice(2)]=v;
    else if(key.startsWith('g.'))c.grade[key.slice(2)]=v;
    else if(key==='target'){const speed=(c.out-c.in)/frameDuration(v,p.fps);if(speed<.05||speed>20){status('指定した尺では速度が範囲外になります（0.05〜20倍）');return;}c.requested=v;c.speed=speed;}
    else if(key==='in'||key==='out'){const a=assets.get(c.asset)||p.assets.find(a=>a.id===c.asset);const limit=a.kind==='image'?86400:a.duration;if(key==='in')c.in=clamp(v,0,c.out-.001);else c.out=clamp(v,c.in+.001,limit);c.requested=null;}
    else if(key==='start'&&p.texts.includes(c))c.start=Math.min(v,c.end-.001);
    else if(key==='end')c.end=Math.max(v,c.start+.001);
    else {c[key]=v;if(key==='speed')c.requested=null;}
    for(const other of $('#panel').querySelectorAll('[data-key]'))if(other!==el&&other.dataset.key===key)other.value=v;
  }
  refresh(false);
}
$('#panel').addEventListener('input',editControl);
$('#panel').addEventListener('change',e=>{if(e.target.tagName==='SELECT'||e.target.type==='checkbox')editControl(e);if(e.target.dataset.key){gestureKey=null;if(/^[gl]\./.test(e.target.dataset.key))syncColorControls();else panel();}});
function stop(){const session=previewAudioSession;previewAudioSession=null;void session?.close();playing=false;playingToken++;$('#play').textContent='▶';$('#play').setAttribute('aria-label','再生');for(const s of scheduled)try{s.stop();}catch{}scheduled=[];}
async function play(){if(playing){stop();return;}if(!p.clips.length||busy)return;audioContext??=new AudioContext();await audioContext.resume();if(time>=total(p)-1/p.fps)time=0;playing=true;const token=++playingToken;$('#play').textContent='Ⅱ';$('#play').setAttribute('aria-label','一時停止');const base=time,session=new AudioReadSession();previewAudioSession=session;let startAt;
  try{const first=await mixAudio(p,base,Math.min(1,total(p)-base),48000,session);if(token!==playingToken)return;startAt=audioContext.currentTime+.08;
    const schedule=(buffer,at)=>{const s=audioContext.createBufferSource();s.buffer=buffer;s.connect(audioContext.destination);s.start(at);scheduled.push(s);s.onended=()=>scheduled=scheduled.filter(x=>x!==s);};schedule(first,startAt);
    (async()=>{let next=base+first.duration;try{while(token===playingToken&&next<total(p)){if(next-base>audioContext.currentTime-startAt+1){await new Promise(r=>setTimeout(r,80));continue;}const length=Math.min(1,total(p)-next),buffer=await mixAudio(p,next,length,48000,session);if(token!==playingToken)return;const at=startAt+next-base;if(at<audioContext.currentTime-.05){stop();status('音声プレビューが追いつきません。停止して再生し直すか、書き出して確認してください');return;}schedule(buffer,Math.max(at,audioContext.currentTime));next+=buffer.duration;}}catch(e){if(token===playingToken){stop();status(e.message);}}finally{await session.close();}})();
    const tick=()=>{if(token!==playingToken)return;time=clamp(base+audioContext.currentTime-startAt,0,total(p));$('#scrub').value=time;$('#timecode').textContent=`${format(time)} / ${format(total(p))}`;const head=$('.playhead');if(head)head.style.left=time*zoom+'px';requestRender();if(time>=total(p)){stop();return;}requestAnimationFrame(tick);};requestAnimationFrame(tick);
  }catch(e){if(token===playingToken){stop();status(e.message);}await session.close();}
}
$('#play').onclick=play;$('#scrub').oninput=e=>{stop();time=Number(e.target.value);refresh(false);};
$('#prevFrame').onclick=()=>{stop();time=Math.max(0,time-1/p.fps);refresh(false);};$('#nextFrame').onclick=()=>{stop();time=Math.min(total(p),time+1/p.fps);refresh(false);};
$('#compare').onclick=()=>{before=!before;$('#compare').setAttribute('aria-pressed',before);$('#beforeBadge').hidden=!before;requestRender();};
$('#timelineZoom').oninput=e=>{zoom=Number(e.target.value);timeline();};
$('#undo').onclick=()=>{if(!undo.length)return;stop();redo.push(JSON.stringify(p));p=JSON.parse(undo.pop());refresh();};$('#redo').onclick=()=>{if(!redo.length)return;stop();undo.push(JSON.stringify(p));p=JSON.parse(redo.pop());refresh();};
$('#projectName').onchange=e=>{checkpoint();p.name=e.target.value||'Untitled';};
$('#projectMenu').onclick=()=>{stop();$('#ratio').value=p.ratio;$('#fps').value=p.fps;$('#projectDialog').showModal();};
$('#ratio').onchange=e=>{checkpoint();p.ratio=e.target.value;refresh();};$('#fps').onchange=e=>{checkpoint();p.fps=Number(e.target.value);refresh();};
$('#saveProject').onclick=()=>saveBlob(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),`${p.name.replace(/[^\p{L}\p{N}_-]/gu,'_')}.json`);
$('#loadProject').onclick=()=>$('#projectInput').click();$('#relink').onclick=()=>{$('#projectDialog').close();chooseMedia(true);};
$('#projectInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const next=validateProject(JSON.parse(await file.text()));checkpoint();p=next;time=0;selected=null;$('#projectDialog').close();refresh();status('編集設定を読み込みました。「素材を再接続」で元のファイルを選んでください');}catch(error){status(error.message);}e.target.value='';};
$('#newProject').onclick=()=>{if(confirm('新規プロジェクトに切り替えますか？未保存の編集は先に保存してください。')){checkpoint();p=newProject();selected=null;time=0;$('#projectDialog').close();refresh();}};
$('#srtInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;const cues=parseSrt(await file.text());checkpoint();for(const cue of cues)p.texts.push({id:id(),...cue,font:'sans-serif',size:5,x:50,y:85,stroke:3,color:'#ffffff',outline:'#000000',bold:false,background:false});selected=p.texts.at(-1)?.id;refresh();status(`${cues.length}件の字幕を追加しました`);e.target.value='';};
$('#fontInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const name='Custom_'+file.name.replace(/[^a-zA-Z0-9]/g,'_'),font=new FontFace(name,await file.arrayBuffer());await font.load();document.fonts.add(font);if(!fonts.includes(name)){fonts.push(name);fontNames.push(file.name);}checkpoint();if(current()&&p.texts.includes(current()))current().font=name;refresh();}catch(error){status('フォントを読み込めませんでした：'+error.message);}e.target.value='';};
$('#exportOpen').onclick=()=>{stop();$('#exportFps').value=p.fps;$('#exportInfo').textContent=`${p.fps} fps · ${Math.round(total(p)*p.fps)}フレーム · 実際の尺 ${(Math.round(total(p)*p.fps)/p.fps).toFixed(3)}秒`;$('#exportDialog').showModal();};
$('#exportStart').onclick=async()=>{if(busy)return;const missing=[...p.clips,...p.audio].some(c=>!assets.has(c.asset));if(missing){$('#exportStatus').textContent='未接続の素材があります。素材を再接続してください。';return;}busy=true;stop();$('#workspace').inert=true;$('#exportStart').disabled=true;$('#exportClose').disabled=true;$('#exportCancel').hidden=false;$('#download').hidden=true;$('#exportPreview').pause();$('#exportPreview').hidden=true;$('#exportPreview').removeAttribute('src');$('#exportStatus').textContent='書き出し準備中…';$('#progress').value=0;exportController=new AbortController();try{const snapshot=structuredClone(p);snapshot.fps=Number($('#exportFps').value);const trial=Number($('#trialLength').value);const trialStart=trial?Math.min(time,Math.max(0,total(snapshot)-1/snapshot.fps)):0;const blob=await exportVideo(snapshot,{long:Number($('#resolution').value),mbps:Number($('#bitrate').value),start:trialStart,length:trial||null,signal:exportController.signal,onProgress:n=>{$('#progress').value=n;$('#exportStatus').textContent=`書き出し中 ${Math.round(n*100)}%`;}});if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(blob);$('#download').href=downloadUrl;$('#download').download=(p.name||'video')+(trial?'-test':'')+'.mp4';$('#exportPreview').src=downloadUrl;$('#exportPreview').hidden=false;$('#download').hidden=false;$('#exportStatus').textContent=`完成 · ${(blob.size/1048576).toFixed(1)} MB。「保存」を押してください。`;}catch(e){$('#exportStatus').textContent=e.message;}finally{busy=false;$('#workspace').inert=false;$('#exportStart').disabled=false;$('#exportClose').disabled=false;$('#exportCancel').hidden=true;}};
$('#exportCancel').onclick=()=>exportController?.abort();$('#exportDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('beforeunload',e=>{if(p.clips.length||p.audio.length||p.texts.length){e.preventDefault();e.returnValue='';}});
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||$('dialog[open]')||busy)return;if(e.code==='Space'){e.preventDefault();play();}if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();$(e.shiftKey?'#redo':'#undo').click();}});
refresh();

let comparisonRenderer;
async function compareClips(apply){
 const c=current(),ref=p.clips.find(x=>x.id===p.referenceClip);
 if(!c||!p.clips.includes(c)||!ref||ref.id===c.id){status('別の基準クリップを選択してください');return;}
 if(busy)return;stop();busy=true;$('#workspace').inert=true;status('中央フレームを比較中…');
 try{
  comparisonRenderer??=new Renderer(document.createElement('canvas'));
  const [w,h]=dimensions(p.ratio,320);comparisonRenderer.canvas.width=w;comparisonRenderer.canvas.height=h;
  const sample=async(source)=>{
   const copy=structuredClone(source);copy.transition=0;copy.videoFadeIn=0;copy.videoFadeOut=0;
   copy.grade={...gradeDefault(),...copy.grade,lookOn:0,textureOn:0,matchStrength:0};
   const project={...p,clips:[copy],texts:[],audio:[],look:gradeDefault()};
   await comparisonRenderer.render(project,duration(copy)/2);
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(comparisonRenderer.canvas,0,0);
   return {url:canvas.toDataURL('image/jpeg',.85),mean:imageMean(ctx.getImageData(0,0,w,h).data)};
  };
  const source=await sample(c),reference=await sample(ref);
  if(apply){checkpoint();Object.assign(c.grade,matchGains(source.mean,reference.mean));}
  panel();
  $('#referenceResult').innerHTML='<div class="reference-pair"><figure><img alt="選択クリップの補正後・色合わせ前" src="'+source.url+'"><figcaption>選択：'+esc(c.name)+'</figcaption></figure><figure><img alt="基準クリップ" src="'+reference.url+'"><figcaption>基準：'+esc(ref.name)+'</figcaption></figure></div>';
  status(apply?'色合わせを適用しました。強度を調整できます。':'クリップ補正後・ルック適用前の中央フレームです。');
 }catch(e){status(e.message);}finally{busy=false;$('#workspace').inert=false;requestRender();}
}
$('#exportFps').onchange=()=>{$('#exportInfo').textContent=$('#exportFps').value+' fps · MP4 / H.264 / AAC';};


initFullscreenPreview({canOpen:()=>!busy&&p.clips.length>0,togglePlay:()=>play()});
