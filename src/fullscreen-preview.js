// Move the existing viewer: graded frames, captions, audio and playhead stay shared.
export function initFullscreenPreview({canOpen,togglePlay}) {
  const dialog=document.querySelector('#fullscreenPreview');
  const viewer=document.querySelector('.viewer');
  const opener=document.querySelector('#fullscreenOpen');
  const closer=document.querySelector('#fullscreenClose');
  let placeholder,overflow,scrollX,scrollY,nativeActive=false;
  function close() {
    if(!placeholder)return;
    if(document.fullscreenElement===dialog)document.exitFullscreen().catch(()=>{});
    placeholder.replaceWith(viewer);placeholder=null;
    dialog.close();document.body.style.overflow=overflow;
    window.scrollTo(scrollX,scrollY);opener.setAttribute('aria-expanded','false');
    opener.focus({preventScroll:true});nativeActive=false;
  }
  opener.addEventListener('click',()=>{
    if(placeholder||!canOpen())return;
    scrollX=window.scrollX;scrollY=window.scrollY;overflow=document.body.style.overflow;
    placeholder=document.createComment('preview home');viewer.before(placeholder);
    dialog.querySelector('.fullscreen-host').append(viewer);
    document.body.style.overflow='hidden';dialog.showModal();
    opener.setAttribute('aria-expanded','true');closer.focus({preventScroll:true});
    // A full-window dialog remains usable where native fullscreen is unavailable.
    if(dialog.requestFullscreen)dialog.requestFullscreen().then(()=>{
      if(!placeholder&&document.fullscreenElement===dialog)document.exitFullscreen().catch(()=>{});
    }).catch(()=>{});
  });
  closer.addEventListener('click',close);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',close);
  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement===dialog)nativeActive=true;
    else if(nativeActive)close();
  });
  dialog.addEventListener('keydown',e=>{
    if(e.code==='Space'&&!['INPUT','BUTTON','SELECT','TEXTAREA'].includes(e.target.tagName)){
      e.preventDefault();togglePlay();
    }
  });
}
