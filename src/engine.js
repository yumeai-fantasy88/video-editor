import {Input,ALL_FORMATS,BlobSource,CanvasSink,AudioBufferSink,Output,BufferTarget,Mp4OutputFormat,CanvasSource,AudioBufferSource,Quality,canEncodeVideo,canEncodeAudio} from 'mediabunny';
import {registerAacEncoder} from '@mediabunny/aac-encoder';
import {Grader} from './grade.js';
import {layout,total,duration,gainAt,clamp} from './model.js';
export const assets=new Map();
export async function loadAsset(file,assetId=crypto.randomUUID()){
  const a={id:assetId,name:file.name,size:file.size,modified:file.lastModified,kind:file.type.startsWith('image/')?'image':'video',file};
  if(a.kind==='image') {a.image=await createImageBitmap(file);a.duration=5;a.width=a.image.width;a.height=a.image.height;}
  else {a.input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
    a.video=await a.input.getPrimaryVideoTrack();a.audio=await a.input.getPrimaryAudioTrack();
    if(!a.video&&!a.audio)throw Error('読み込める映像・音声トラックがありません');
    if(a.video&&!await a.video.canDecode())throw Error('この動画のコーデックは端末でデコードできません。H.264のMP4で試してください');
    if(a.audio&&!await a.audio.canDecode())throw Error('この音声のコーデックは端末でデコードできません');
    a.kind=a.video?'video':'audio';a.duration=await a.input.computeDuration();
    if(!Number.isFinite(a.duration)||a.duration<=0)throw Error('素材の長さを取得できません');
    if(a.video){a.sink=new CanvasSink(a.video,{poolSize:2});const first=await a.sink.getCanvas(await a.video.getFirstTimestamp());if(first){a.width=first.canvas.width;a.height=first.canvas.height;const thumb=document.createElement('canvas');thumb.width=160;thumb.height=90;thumb.getContext('2d').drawImage(first.canvas,0,0,160,90);a.thumb=thumb.toDataURL('image/jpeg',.65);}}
    if(a.audio)a.audioSink=new AudioBufferSink(a.audio);
  }
  const old=assets.get(a.id);old?.input?.dispose();old?.image?.close();assets.set(a.id,a);return a;
}
export function assetMeta(a){return {id:a.id,name:a.name,size:a.size,modified:a.modified,kind:a.kind,duration:a.duration};}
export function dimensions(ratio,long=1920){const [x,y]=ratio.split(':').map(Number);return x>=y?[long,Math.round(long*y/x/2)*2]:[Math.round(long*x/y/2)*2,long];}
export class Renderer {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.grader=new Grader();this.layer=document.createElement('canvas');this.iterators=new Map();}
  async prepare(p,fps){for(const c of layout(p)){const a=assets.get(c.asset);if(!a?.video)continue;const first=Math.ceil((c.start-1e-8)*fps),last=Math.ceil((c.end-1e-8)*fps);function* times(){for(let f=first;f<last;f++)yield Math.min(c.out-1e-6,c.in+(f/fps-c.start)*c.speed);}
    const sink=new CanvasSink(a.video,{poolSize:1});this.iterators.set(c.id,sink.canvasesAtTimestamps(times()));}}
  async close(){for(const it of this.iterators.values())await it.return();this.iterators.clear();}
  async render(p,time,before=false){const {canvas,ctx}=this,w=canvas.width,h=canvas.height;ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
    for(const c of layout(p).filter(c=>time>=c.start-1e-8&&time<c.end-1e-8)){
      const a=assets.get(c.asset);if(!a)throw Error('素材が未接続です。素材を再選択してください');
      let source=a.image;if(a.video){const iterator=this.iterators.get(c.id);const frame=iterator?(await iterator.next()).value:await a.sink.getCanvas(Math.min(c.out-1e-6,c.in+(time-c.start)*c.speed));source=frame?.canvas;}
      if(!source)continue;
      // Transform at preview/export resolution, then apply the identical shader.
      this.layer.width=w;this.layer.height=h;const lc=this.layer.getContext('2d');lc.clearRect(0,0,w,h);lc.save();lc.translate(w*(.5+(c.offsetX??0)/100),h*(.5+(c.offsetY??0)/100));lc.rotate(c.rotation*Math.PI/180);
      const angle=c.rotation*Math.PI/180,cos=Math.abs(Math.cos(angle)),sin=Math.abs(Math.sin(angle));
      const scale=(c.fit==='cover'?Math.max((w*cos+h*sin)/source.width,(w*sin+h*cos)/source.height):Math.min(w/(source.width*cos+source.height*sin),h/(source.width*sin+source.height*cos)))*c.zoom;
      lc.scale(scale,scale);lc.drawImage(source,-source.width/2,-source.height/2);lc.restore();
      const picture=before?this.layer:this.grader.render(this.layer,c.grade);const t=time-c.start;
      const fade=Math.min(1,c.videoFadeIn?t/c.videoFadeIn:1,c.videoFadeOut?(c.duration-t)/c.videoFadeOut:1);
      // Fade incoming image over outgoing image; black for clip fades.
      const alpha=c.overlap&&t<c.overlap?t/c.overlap:1;
      ctx.save();ctx.globalAlpha=clamp(alpha,0,1);ctx.drawImage(picture,0,0);ctx.fillStyle=`rgba(0,0,0,${1-clamp(fade,0,1)})`;ctx.fillRect(0,0,w,h);ctx.restore();
    }
    for(const t of p.texts.filter(t=>time>=t.start&&time<t.end)){
      ctx.save();const size=h*t.size/100;ctx.font=`${t.bold?'700':'400'} ${size}px ${t.font}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
      const lines=t.text.split('\n'),x=w*t.x/100,y=h*t.y/100;
      if(t.background){const width=Math.max(...lines.map(l=>ctx.measureText(l).width));ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(x-width/2-size*.3,y-size*lines.length*.65,width+size*.6,size*lines.length*1.3);}
      ctx.strokeStyle=t.outline||'#000000';ctx.lineWidth=t.stroke*h/1080;ctx.fillStyle=t.color||'#ffffff';
      lines.forEach((line,i)=>{const yy=y+(i-(lines.length-1)/2)*size*1.3;if(t.stroke)ctx.strokeText(line,x,yy);ctx.fillText(line,x,yy);});ctx.restore();
    }
  }
}
export async function mixAudio(p,start,length,rate=48000){
  const count=Math.max(1,Math.round(length*rate)),out=new AudioBuffer({length:count,numberOfChannels:2,sampleRate:rate});
  const tracks=[...layout(p),...p.audio.map(c=>({...c,end:c.start+duration(c),duration:duration(c)}))];
  for(const c of tracks){if(!c.volume||c.end<=start||c.start>=start+length)continue;const a=assets.get(c.asset);if(!a)throw Error('音声素材が未接続です');if(!a.audioSink)continue;
    const left=Math.max(start,c.start),right=Math.min(start+length,c.end);const from=c.in+(left-c.start)*c.speed,to=c.in+(right-c.start)*c.speed;
    for await(const b of a.audioSink.buffers(from,to)){
      const lo=Math.max(0,Math.ceil((c.start+(b.timestamp-c.in)/c.speed-start)*rate),Math.ceil((left-start)*rate));
      const hi=Math.min(count,Math.ceil((c.start+(b.timestamp+b.duration-c.in)/c.speed-start)*rate),Math.ceil((right-start)*rate));
      for(let ch=0;ch<2;ch++){const dst=out.getChannelData(ch),src=b.buffer.getChannelData(Math.min(ch,b.buffer.numberOfChannels-1));
        for(let i=lo;i<hi;i++){const t=start+i/rate,position=(c.in+(t-c.start)*c.speed-b.timestamp)*b.buffer.sampleRate;const j=Math.floor(Math.max(0,position)),f=Math.max(0,position)-j;
          const value=(src[Math.min(j,src.length-1)]||0)*(1-f)+(src[Math.min(j+1,src.length-1)]||0)*f;
          dst[i]+=value*gainAt(c,t-c.start,c.duration);
        }
      }
    }
  }
  // Hard limiting makes excessive summed levels explicit and deterministic.
  for(let ch=0;ch<2;ch++){const dst=out.getChannelData(ch);for(let i=0;i<count;i++)dst[i]=clamp(dst[i],-1,1);}
  return out;
}
export async function exportVideo(p,{long=1920,mbps=16,onProgress=()=>{},signal}){
  const [width,height]=dimensions(p.ratio,long),fps=p.fps,frames=Math.max(1,Math.round(total(p)*fps));
  if(!p.clips.length)throw Error('映像または画像を追加してください');
  if(!await canEncodeVideo('avc',{width,height,bitrate:mbps*1e6}))throw Error('このブラウザはH.264書き出しに対応していません。OS・ブラウザを更新するかPCで開いてください');
  const hasAudio=[...p.clips,...p.audio].some(c=>c.volume>0&&assets.get(c.asset)?.audio);
  if(hasAudio&&!await canEncodeAudio('aac',{sampleRate:48000,numberOfChannels:2}))registerAacEncoder();
  await document.fonts.ready;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const renderer=new Renderer(canvas),target=new BufferTarget(),output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
  const video=new CanvasSource(canvas,{codec:'avc',quality:new Quality({bitrate:mbps*1e6}),keyFrameInterval:2});
  output.addVideoTrack(video,{frameRate:fps});
  const audio=hasAudio?new AudioBufferSource({codec:'aac',quality:new Quality({bitrate:192000})}):null;
  if(audio)output.addAudioTrack(audio);
  let wake;
  try{try{wake=await navigator.wakeLock?.request('screen');}catch{}
    await renderer.prepare(p,fps);await output.start();
    for(let f=0;f<frames;f++){
      if(signal.aborted)throw Error('書き出しを中止しました');
      if(document.hidden)throw Error('画面がバックグラウンドになったため中止しました。画面を開いたまま再実行してください');
      if(audio&&f%fps===0)await audio.add(await mixAudio(p,f/fps,Math.min(1,(frames-f)/fps)));
      await renderer.render(p,f/fps);await video.add(f/fps,1/fps);
      if(f%5===0){onProgress(f/frames);await new Promise(r=>setTimeout(r,0));}
    }
    video.close();audio?.close();await output.finalize();onProgress(1);return new Blob([target.buffer],{type:'video/mp4'});
  }catch(error){try{await output.cancel();}catch{}throw error;}finally{await renderer.close();await wake?.release();}
}
