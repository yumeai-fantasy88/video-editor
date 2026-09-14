import {chromium} from 'playwright';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,mkdir,rm} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
await mkdir('.browser-test',{recursive:true});
await build({stdin:{contents:"export * from '../src/engine.js';export * from '../src/model.js';export * from '../src/grade.js';export {Input,BufferSource,ALL_FORMATS,EncodedPacketSink} from 'mediabunny';",resolveDir:resolve('tests')},bundle:true,format:'esm',outfile:'.browser-test/entry.js'});
const root=resolve('.');
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/'))throw Error();const body=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(body);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader']});
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
  const a={id:'browser-image',name:'sample',kind:'image',duration:5,image:canvas};M.assets.set(a.id,a);
  const p=M.newProject();p.clips=[M.clip(a)];p.clips[0].out=5;
  const exports=[];
  for(const fps of [24,60]){
   p.fps=fps;
   const blob=await M.exportVideo(p,{long:320,mbps:2,start:1,length:.5,signal:new AbortController().signal});
   const input=new M.Input({source:new M.BufferSource(await blob.arrayBuffer()),formats:M.ALL_FORMATS}),track=await input.getPrimaryVideoTrack();
   let packets=0,first=null,last=null;for await(const packet of new M.EncodedPacketSink(track).packets()){packets++;first??=packet.timestamp;last=packet.timestamp;}
   exports.push({fps,codec:track.codec,packets,first,last,duration:await input.computeDuration()});input.dispose();
  }
  return {neutral,bypass,changed,exports};
 });
 assert.deepEqual(result.neutral,result.bypass);assert.ok(Math.abs(result.neutral[0]-90)<=2);assert.ok(result.changed[0]>result.neutral[0]+30);
 for(const e of result.exports){assert.equal(e.codec,'avc');assert.equal(e.packets,e.fps/2);assert.ok(Math.abs(e.first)<.001);assert.ok(Math.abs(e.duration-.5)<.02);}
 await page.locator('#exportOpen').click();assert.deepEqual(await page.locator('#exportFps option').allTextContents(),['24','25','30','50','60']);
 assert.equal(await page.locator('#trialLength option').count(),3);
 assert.deepEqual(errors,[]);
 console.log('Browser shader, neutral bypass, H.264 trial export and FPS checks passed',JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));await rm('.browser-test',{recursive:true,force:true});}
