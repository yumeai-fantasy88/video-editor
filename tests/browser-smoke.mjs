import {chromium} from 'playwright';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,mkdir,rm} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
await mkdir('.browser-test',{recursive:true});
await build({stdin:{contents:"export * from '../src/engine.js';export * from '../src/model.js';export * from '../src/grade.js';export {Input,BufferSource,ALL_FORMATS,CanvasSink,EncodedPacketSink,Output,BufferTarget,Mp4OutputFormat,AudioBufferSource,AudioBufferSink,Quality} from 'mediabunny';export {registerAacEncoder} from '@mediabunny/aac-encoder';",resolveDir:resolve('tests')},bundle:true,format:'esm',outfile:'.browser-test/entry.js'});
const root=resolve('.');
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/'))throw Error();const body=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(body);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/docs/index.html');
 await page.waitForSelector('#panel h2');
 const result=await page.evaluate(async()=>{
  const M=await import('/.browser-test/entry.js'),{Grader,gradeDefault}=M;
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='rgb(90,120,150)';ctx.fillRect(0,0,32,32);
  const grader=new Grader(),read=g=>{const out=grader.render(canvas,g);const copy=document.createElement('canvas');copy.width=32;copy.height=32;const c=copy.getContext('2d');c.drawImage(out,0,0);return [...c.getImageData(16,16,1,1).data];};
  const neutral=read(gradeDefault()),bypass=read({...gradeDefault(),exposure:2,density:1,grain:1,correctionOn:0,lookOn:0,textureOn:0});
  const changed=read({...gradeDefault(),exposure:1});
  ctx.fillStyle='rgb(120,120,120)';ctx.fillRect(0,0,32,32);ctx.fillStyle='rgb(130,130,130)';ctx.fillRect(16,16,1,1);
  const luma=read({...gradeDefault(),noiseOn:1,denoiseLuma:1});
  ctx.fillStyle='rgb(120,120,120)';ctx.fillRect(0,0,32,32);ctx.fillStyle='rgb(150,110,120)';ctx.fillRect(16,16,1,1);
  const chroma=read({...gradeDefault(),noiseOn:1,denoiseChroma:1});
  // Compare texture at preview and 1080p resolutions, after phone-size scaling.
  const textureSource=document.createElement('canvas');
  const thumb=document.createElement('canvas');thumb.width=320;thumb.height=180;
  const tc=thumb.getContext('2d',{willReadFrequently:true});
  function textureFrame(width,grade,edge=false){
   textureSource.width=width;textureSource.height=width*9/16;
   const ctx=textureSource.getContext('2d');ctx.fillStyle=edge?'rgb(200,40,40)':'rgb(160,160,160)';ctx.fillRect(0,0,width,textureSource.height);
   if(edge){ctx.fillStyle='rgb(40,120,200)';ctx.fillRect(width/2,0,width/2,textureSource.height);}
   tc.drawImage(grader.render(textureSource,{...gradeDefault(),...grade}),0,0,320,180);
   return tc.getImageData(0,0,320,180).data;
  }
  const scanPreview=textureFrame(960,{scanlines:1}),scanExport=textureFrame(1920,{scanlines:1});
  const rowRange=data=>{const rows=Array.from({length:180},(_,y)=>data[(y*320+80)*4]);return Math.max(...rows)-Math.min(...rows);};
  const neutralEdge=textureFrame(960,{},true),bleedEdge=textureFrame(960,{bleed:1},true);
  let bleedDifference=0,scanDifference=0;
  for(let y=0;y<180;y++)scanDifference+=Math.abs(scanPreview[(y*320+80)*4]-scanExport[(y*320+80)*4])/180;
  for(let x=152;x<168;x++)bleedDifference=Math.max(bleedDifference,Math.abs(neutralEdge[(80*320+x)*4]-bleedEdge[(80*320+x)*4]));
  const bloomSource=document.createElement('canvas');bloomSource.width=960;bloomSource.height=540;const bc=bloomSource.getContext('2d');bc.fillStyle='rgb(20,20,30)';bc.fillRect(0,0,960,540);bc.fillStyle='white';bc.fillRect(450,250,60,40);textureSource.width=960;textureSource.height=540;textureSource.getContext('2d').drawImage(bloomSource,0,0);tc.drawImage(grader.render(textureSource,{...gradeDefault(),bloom:1}),0,0,320,180);const bloomEdge=[...tc.getImageData(145,90,1,1).data];
  const grayBleed=textureFrame(960,{bleed:1});
  const textureStats={scanPreview:rowRange(scanPreview),scanExport:rowRange(scanExport),scanDifference,bleedDifference,bloomEdge,gray:grayBleed[0]};
  // Verify the actual H.264 file retains the horizontal texture at 1080p.
  textureFrame(1920,{});
  const textureAsset={id:'texture-image',name:'texture',kind:'image',duration:1,image:textureSource};M.assets.set(textureAsset.id,textureAsset);
  const textureProject=M.newProject();textureProject.clips=[M.clip(textureAsset)];textureProject.clips[0].out=.125;textureProject.clips[0].grade.scanlines=1;
  textureProject.texts=[{id:'bg-text',text:' ',start:0,end:.125,font:'sans-serif',size:20,x:50,y:50,stroke:0,color:'#ffffff',background:true,backgroundColor:'#ff0000',backgroundOpacity:1}];
  const textureBlob=await M.exportVideo(textureProject,{long:1920,mbps:8,start:0,length:.125,signal:new AbortController().signal});
  const textureInput=new M.Input({source:new M.BufferSource(await textureBlob.arrayBuffer()),formats:M.ALL_FORMATS});
  const textureTrack=await textureInput.getPrimaryVideoTrack();
  const textureDecoded=await new M.CanvasSink(textureTrack).getCanvas(0);
  tc.drawImage(textureDecoded.canvas,0,0,320,180);textureStats.decodedScan=rowRange(tc.getImageData(0,0,320,180).data);textureStats.exportWidth=textureDecoded.canvas.width;textureStats.textBackground=[...tc.getImageData(160,90,1,1).data];
  textureInput.dispose();
  const a={id:'browser-image',name:'sample',kind:'image',duration:5,image:canvas};M.assets.set(a.id,a);
  const p=M.newProject();p.clips=[M.clip(a)];p.clips[0].out=5;
  // Public synthetic AAC fixture; no user uploads are used by CI.
  M.registerAacEncoder();
  const target=new M.BufferTarget(),audioOut=new M.Output({format:new M.Mp4OutputFormat(),target});
  const source=new M.AudioBufferSource({codec:'aac',quality:new M.Quality({bitrate:192000})});audioOut.addAudioTrack(source);await audioOut.start();
  const tone=new AudioBuffer({length:44100*4,numberOfChannels:2,sampleRate:44100});
  for(let c=0;c<2;c++)for(let i=0;i<tone.length;i++)tone.getChannelData(c)[i]=.2*Math.sin(i*2*Math.PI*443.3/44100)+.1*Math.cos(i*2*Math.PI*613.7/44100);
  await source.add(tone);source.close();await audioOut.finalize();
  const audioAsset=await M.loadAsset(new File([target.buffer],'synthetic.m4a',{type:'audio/mp4'}));
  p.audio=[{...M.clip(audioAsset),start:0}];
  const continuous=(await M.mixAudio(p,0,3)).getChannelData(0),session=new M.AudioReadSession();let maxAudioError=0;
  for(let t=0;t<3;t++){const block=(await M.mixAudio(p,t,1,48000,session)).getChannelData(0);for(let i=0;i<block.length;i++)maxAudioError=Math.max(maxAudioError,Math.abs(block[i]-continuous[t*48000+i]));}
  await session.close();
  const exports=[];
  for(const fps of [24,60]){
   p.fps=fps;
   const blob=await M.exportVideo(p,{long:320,mbps:2,start:1,length:fps===24?3:.5,signal:new AbortController().signal});
   const input=new M.Input({source:new M.BufferSource(await blob.arrayBuffer()),formats:M.ALL_FORMATS}),track=await input.getPrimaryVideoTrack();
   let packets=0,first=null,last=null;for await(const packet of new M.EncodedPacketSink(track).packets()){packets++;first??=packet.timestamp;last=packet.timestamp;}
   const at=await input.getPrimaryAudioTrack();
   exports.push({fps,audioCodec:at?.codec,codec:track.codec,packets,first,last,duration:await input.computeDuration()});input.dispose();
  }
  return {neutral,bypass,changed,luma,chroma,maxAudioError,exports,textureStats};
 });
 assert.ok(result.textureStats.textBackground[0]>220&&result.textureStats.textBackground[1]<25);
 assert.ok(result.textureStats.scanPreview>50);assert.ok(result.textureStats.scanExport>50);
 assert.ok(result.textureStats.scanDifference<20);assert.ok(result.textureStats.bleedDifference>30);assert.ok(result.textureStats.bloomEdge[0]>20);
 assert.ok(Math.abs(result.textureStats.gray-160)<=1);assert.equal(result.textureStats.exportWidth,1920);assert.ok(result.textureStats.decodedScan>50);
 assert.ok(result.luma[0]<128);assert.ok(result.chroma[0]-result.chroma[1]<25);
 assert.deepEqual(result.neutral,result.bypass);assert.ok(Math.abs(result.neutral[0]-90)<=2);assert.ok(result.changed[0]>result.neutral[0]+30);
 assert.ok(result.maxAudioError<1e-5, 'AAC decoder continuity: '+result.maxAudioError);
 for(const e of result.exports){const length=e.fps===24?3:.5;assert.equal(e.codec,'avc');assert.equal(e.audioCodec,'aac');assert.equal(e.packets,e.fps*length);assert.ok(Math.abs(e.first)<.001);assert.ok(Math.abs(e.duration-length)<.1);}
 // Exercise panel rebuilds with an imported image and mobile-width controls.
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;canvas.getContext('2d').fillRect(0,0,64,64);const blob=await new Promise(r=>canvas.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([blob],'ui-fixture.png',{type:'image/png'}));const input=document.querySelector('#mediaInput');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelector('#timeline .block.video')&&!document.querySelector('#workspace').inert);
 await page.locator('[data-tab="color"]').click();
 const look=page.locator('[data-panel-section="clip-look"]'),texture=page.locator('[data-panel-section="clip-texture"]');
 await look.locator('summary').click();await texture.locator('summary').click();
 await page.locator('[data-panel-section="noise"] summary').click();
 for(const key of ['g.density','g.grain']){
   await page.locator('input[type="range"][data-key="'+key+'"]').evaluate(el=>{el.value='.3';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
   assert.equal(await look.evaluate(el=>el.open),true);assert.equal(await texture.evaluate(el=>el.open),true);assert.equal(await page.locator('[data-panel-section="noise"]').evaluate(el=>el.open),false);
 }
 await page.evaluate(()=>{window.originalLookSelect=document.querySelector('#lookSelect');window.originalTexture=document.querySelector('[data-panel-section="clip-texture"]');});
 assert.equal((await page.locator('#lookSelect option').allTextContents()).includes('Faded Film'),false);
 await page.locator('#lookSelect').selectOption('Cinema Soft');
 assert.equal(await page.locator('#lookSelect').inputValue(),'Cinema Soft');
 assert.equal(await page.evaluate(()=>document.querySelector('#lookSelect')===window.originalLookSelect),true);
 assert.equal(await page.locator('[data-panel-section="global-look"]').evaluate(el=>el.open),true);
 await page.locator('input[type="range"][data-key="l.contrast"]').evaluate(el=>{el.value='1.2';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.locator('#lookSelect').inputValue(),'Cinema Soft');
 assert.equal(await page.locator('#lookSelect option:checked').textContent(),'Cinema Soft（調整済み）');
 assert.equal(await page.evaluate(()=>document.querySelector('[data-panel-section="clip-texture"]')===window.originalTexture),true);
 await page.locator('#undo').click();assert.equal(await page.locator('#lookSelect option:checked').textContent(),'Cinema Soft');
 await page.locator('#redo').click();assert.equal(await page.locator('#lookSelect option:checked').textContent(),'Cinema Soft（調整済み）');
 assert.equal(await texture.evaluate(el=>el.open),true);
 await page.locator('[data-tab="edit"]').click();await page.locator('[data-tab="color"]').click();
 assert.equal(await look.evaluate(el=>el.open),true);assert.equal(await texture.evaluate(el=>el.open),true);
 assert.equal(await page.locator('#lookSelect').inputValue(),'Cinema Soft');
 await page.locator('[data-action="lookReset"]').click();assert.equal(await page.locator('#lookSelect').inputValue(),'');
 // Reset scopes and text controls in the live mobile UI.
 await page.locator('[data-action="clipColorReset"]').click();
 assert.equal(await page.locator('input[type="range"][data-key="g.density"]').inputValue(),'0');
 assert.equal(await page.locator('input[type="range"][data-key="g.grain"]').inputValue(),'0.3');
 await page.locator('[data-action="clipTextureReset"]').click();
 assert.equal(await page.locator('input[type="range"][data-key="g.grain"]').inputValue(),'0');
 await page.locator('#lookSelect').selectOption('Dreamcore');
 assert.ok((await page.locator('#lookDescription').textContent()).includes('夢の中'));
 await page.locator('[data-action="allColorReset"]').click();assert.equal(await page.locator('#lookSelect').inputValue(),'');
 await page.locator('[data-tab="text"]').click();await page.locator('[data-action="addText"]').click();
 await page.locator('input[data-field="background"]').check();
 await page.locator('input[data-field="backgroundColor"]').evaluate(el=>{el.value='#ff0000';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('input[type="range"][data-key="backgroundOpacity"]').evaluate(el=>{el.value='.4';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.locator('[data-action="duplicateText"]').click();assert.equal(await page.locator('#panel .item-list button').count(),2);
 assert.equal(await page.locator('input[data-field="backgroundColor"]').inputValue(),'#ff0000');
 assert.equal(await page.locator('input[type="range"][data-key="backgroundOpacity"]').inputValue(),'0.4');
 await page.locator('#undo').click();assert.equal(await page.locator('#panel .item-list button').count(),1);
 await page.locator('#redo').click();assert.equal(await page.locator('#panel .item-list button').count(),2);
 // Exercise the iPhone-style full-window fallback with the original rendered canvas.
 await page.evaluate(()=>{window.originalPreview=document.querySelector('#preview');document.documentElement.requestFullscreen=()=>Promise.reject(new Error('unsupported'));});
 await page.locator('#fullscreenOpen').click();
 assert.equal(await page.locator('#fullscreenPreview').evaluate(el=>el.open),true);
 assert.equal(await page.evaluate(()=>document.querySelector('#fullscreenPreview #preview')===window.originalPreview),true);
 await page.locator('#scrub').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const size of [{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(size);
   const bounds=await page.locator('#fullscreenClose').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=size.width&&bounds.y+bounds.height<=size.height);
   const screen=await page.locator('#fullscreenPreview .screen').boundingBox();assert.ok(screen.width>0&&screen.height>0&&screen.y+screen.height<=size.height);
 }
 await page.locator('#fullscreenClose').click();
 assert.equal(await page.locator('#fullscreenPreview').evaluate(el=>el.open),false);
 assert.equal(await page.evaluate(()=>document.querySelector('#workspace #preview')===window.originalPreview),true);
 assert.equal(await page.locator('#scrub').inputValue(),'1');
 await page.locator('#fullscreenOpen').click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('#fullscreenPreview').evaluate(el=>el.open),false);
 await page.setViewportSize({width:390,height:844});
 await page.locator('#exportOpen').click();assert.deepEqual(await page.locator('#exportFps option').allTextContents(),['24','25','30','50','60']);
 assert.equal(await page.locator('#trialLength option').count(),3);
 assert.deepEqual(errors,[]);
 console.log('Browser shader, neutral bypass, H.264 trial export and FPS checks passed',JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));await rm('.browser-test',{recursive:true,force:true});}

