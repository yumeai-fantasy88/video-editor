import {colorDefaults,colorRanges} from './color-settings.js';
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const id = () => crypto.randomUUID();
export const gradeDefault = () => ({density:0,depth:0,protect:0.7,exposure:0,contrast:1,saturation:1,temperature:0,tint:0,shadows:0,highlights:0,fade:0,red:0,yellow:0,green:0,cyan:0,blue:0,magenta:0,...colorDefaults()});
export const newProject = () => ({version:1,name:'Untitled',fps:30,ratio:'16:9',look:gradeDefault(),clips:[],audio:[],texts:[],assets:[]});
export const duration = c => (c.out-c.in)/c.speed;
export function layout(p) {
  let cursor=0;
  return p.clips.map((c,i) => {
    const d=duration(c), previous=p.clips[i-1];
    const overlap=previous ? Math.min(c.transition||0,d/2,duration(previous)/2) : 0;
    cursor-=overlap; const start=cursor; cursor+=d;
    return {...c,start,end:cursor,duration:d,overlap};
  });
}
export function total(p) {return Math.max(0,...layout(p).map(c=>c.end),...p.audio.map(c=>c.start+duration(c)),...p.texts.map(c=>c.end));}
export const frameDuration = (seconds,fps) => Math.max(1,Math.round(seconds*fps))/fps;
export const pictureEnd = p => layout(p).at(-1)?.end ?? 0;
export function textPlacement(p,time,length=3){
  const end=pictureEnd(p);
  if(!end)return {start:0,end:length};
  const start=time>=end-1/p.fps?Math.max(0,end-length):clamp(time,0,end-1/p.fps);
  return {start,end:Math.min(end,start+length)};
}
export function clip(asset) {return {id:id(),asset:asset.id,name:asset.name,in:0,out:asset.kind==='image'?5:asset.duration,speed:1,requested:null,volume:1,fadeIn:0,fadeOut:0,videoFadeIn:0,videoFadeOut:0,transition:0,rotation:0,zoom:1,grade:gradeDefault()};}
export function gainAt(c,t,d=duration(c)) {return c.volume*Math.min(1,c.fadeIn>0?t/c.fadeIn:1,c.fadeOut>0?(d-t)/c.fadeOut:1);}
export function splitClip(p,clipId,time) {
  const arranged=layout(p), placed=arranged.find(c=>c.id===clipId); if(!placed) return false;
  const local=time-placed.start, d=duration(placed);
  if(local<1/p.fps || d-local<1/p.fps) return false;
  const next=arranged[arranged.indexOf(placed)+1];
  // Preserve neighboring overlap lengths rather than silently moving the edit.
  if(local<2*placed.overlap || d-local<2*(next?.overlap||0))return false;
  const i=p.clips.findIndex(c=>c.id===clipId), a=p.clips[i], b=structuredClone(a);
  b.id=id(); b.in=a.in+local*a.speed; b.transition=0;b.videoFadeIn=0;b.fadeIn=0;b.requested=null;
  a.out=b.in;a.videoFadeOut=0;a.fadeOut=0;a.requested=null;
  p.clips.splice(i+1,0,b);return true;
}
export function parseSrt(text) {
  const seconds=s=>{const [h,m,v]=s.replace(',','.').split(':').map(Number);return h*3600+m*60+v;};
  return text.replace(/\r/g,'').trim().split(/\n\s*\n/).flatMap(block=>{
    const lines=block.split('\n'), i=lines.findIndex(l=>l.includes('-->'));
    if(i<0) return [];
    const match=lines[i].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if(!match) return [];
    const start=seconds(match[1]),end=seconds(match[2]);
    return end>start ? [{start,end,text:lines.slice(i+1).join('\n')}] : [];
  });
}
export function validateProject(p) {
  if(p?.version!==1 || ![24,25,30,50,60].includes(p.fps)||!['16:9','9:16','1:1','4:3'].includes(p.ratio)) throw Error('対応していないプロジェクトです');
  for(const key of ['clips','audio','texts','assets']) if(!Array.isArray(p[key])||p[key].length>2000) throw Error('プロジェクト形式が不正です');
  for(const item of [...p.clips,...p.audio,...p.texts,...p.assets])if(!item||typeof item.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id))throw Error('項目IDが不正です');
  const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
  const assets=new Set(p.assets.map(a=>a.id));
  for(const c of [...p.clips,...p.audio]) {
    if(!assets.has(c.asset)||!finite(c.in,0,86400)||!finite(c.out,c.in+0.000001,86400)||!finite(c.speed,0.05,20)||!finite(c.volume,0,2)) throw Error('クリップ設定が不正です');
    for(const key of ['fadeIn','fadeOut','transition','videoFadeIn','videoFadeOut']) if(c[key]!==undefined&&!finite(c[key],0,86400)) throw Error('フェード設定が不正です');
  }
  for(const c of p.clips){if(!finite(c.rotation,-360,360)||!finite(c.zoom,0.1,5)) throw Error('変形設定が不正です');c.grade={...gradeDefault(),...c.grade};for(const v of Object.values(c.grade))if(!finite(v,-4,4))throw Error('カラー設定が不正です');}
  for(const c of p.clips){c.fit??='contain';c.offsetX??=0;c.offsetY??=0;if(!['contain','cover'].includes(c.fit)||!finite(c.offsetX,-100,100)||!finite(c.offsetY,-100,100))throw Error('サイズ・位置設定が不正です');}
  for(const a of p.audio)if(!finite(a.start,0,86400))throw Error('音声位置が不正です');
  for(const t of p.texts)if(!finite(t.start,0,86400)||!finite(t.end,t.start+0.000001,86400)||typeof t.text!=='string'||!finite(t.x,0,100)||!finite(t.y,0,100)||!finite(t.size,1,30)||!finite(t.stroke,0,20))throw Error('字幕設定が不正です');
  p.look={...gradeDefault(),...p.look};
  for(const g of [...p.clips.map(c=>c.grade),p.look]){for(const v of Object.values(g))if(!finite(v,-4,4))throw Error('カラー設定が不正です');for(const [k,[min,max]] of Object.entries(colorRanges))if(!finite(g[k],min,max))throw Error('カラー設定が範囲外です');}
  return p;
}
