import assert from 'node:assert/strict';
export async function checkDreamcore(page){
 const result=await page.evaluate(async()=>{
  const M=await import('/.browser-test/entry.js'),g=new M.Grader();
  const source=document.createElement('canvas'),read=document.createElement('canvas');read.width=320;read.height=180;
  const rc=read.getContext('2d',{willReadFrequently:true});
  const sample=(settings)=>{rc.drawImage(g.render(source,{...M.gradeDefault(),...settings}),0,0,320,180);return rc.getImageData(0,0,320,180).data;};
  const at=(data,x,y=90)=>Array.from(data.slice((y*320+x)*4,(y*320+x)*4+3));
  const profiles=[];
  for(const width of [960,1920]){
   source.width=width;source.height=width*9/16;const c=source.getContext('2d');c.fillStyle='#101010';c.fillRect(0,0,source.width,source.height);c.fillStyle='#ffffff';c.fillRect(width/2,0,width/2,source.height);
   const pixels=sample({bloom:1});profiles.push(Array.from({length:30},(_,x)=>at(pixels,130+x)[0]));
  }
  const monotonicallyIncreasing=profiles.every(row=>row.every((v,i)=>i===0||v>=row[i-1]-1));
  const resolutionError=profiles[0].reduce((sum,v,i)=>sum+Math.abs(v-profiles[1][i]),0)/30;
  // The blur must preserve orientation and must not leak ghosts of a corner shape.
  const c=source.getContext('2d');c.fillStyle='#101010';c.fillRect(0,0,source.width,source.height);c.fillStyle='#ffffff';c.fillRect(0,0,source.width/3,source.height/3);
  const corner=sample({bloom:1,softness:1});const orientation={top:at(corner,50,30)[0],bottom:at(corner,50,150)[0]};
  c.fillStyle='rgb(200,200,200)';c.fillRect(0,0,source.width,source.height);
  const bright=at(sample({bloom:1}),160)[0];
  c.fillStyle='rgb(20,20,20)';c.fillRect(0,0,source.width,source.height);
  const dark=at(sample({bloom:1}),160)[0];
  const bypass=at(sample({...M.looks.Dreamcore,correctionOn:0,lookOn:0,textureOn:0}),160);
  // A synthetic shaded/rust-colored object provides a public review fixture.
  source.width=960;source.height=540;
  const gradient=c.createLinearGradient(0,0,0,540);gradient.addColorStop(0,'#d9c29e');gradient.addColorStop(.45,'#80705e');gradient.addColorStop(1,'#232923');c.fillStyle=gradient;c.fillRect(0,0,960,540);
  for(let i=0;i<12;i++){const x=i*93+15;c.fillStyle=i%2?'#3e4233':'#7f5444';c.fillRect(x,210-(i%3)*30,45,220);}
  const metal=c.createRadialGradient(290,210,10,320,320,365);metal.addColorStop(0,'#b0a28a');metal.addColorStop(.65,'#726c58');metal.addColorStop(1,'#242c27');c.fillStyle=metal;c.beginPath();c.ellipse(280,340,360,150,-.24,0,Math.PI*2);c.fill();
  let seed=417;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<1100;i++){const x=random()*660,y=random()*470;if(((x-280)/340)**2+((y-310)/145)**2>1)continue;c.fillStyle=i%3?'#725441':'#9c9277';c.fillRect(x,y,random()*4+1,random()*3+1);}
  c.fillStyle='#252925';c.beginPath();c.ellipse(260,280,48,27,-.3,0,Math.PI*2);c.fill();c.fillStyle='#777967';c.beginPath();c.ellipse(254,263,48,24,-.3,0,Math.PI*2);c.fill();
  c.font='bold 26px sans-serif';c.fillStyle='#ededdf';c.fillText('DETAIL / 012345',570,455);
  const sheet=document.createElement('canvas');sheet.width=960;sheet.height=596;const sc=sheet.getContext('2d');sc.fillStyle='#111215';sc.fillRect(0,0,960,596);
  const variants={},names=['Original','Dreamcore','Dreamcore Warm','Dreamcore Blue'];
  names.forEach((name,i)=>{
   const settings=name==='Original'?{}:M.looks[name],pixels=sample(settings);let luminance=0,clipped=0;
   for(let p=0;p<pixels.length;p+=4){luminance+=(pixels[p]+pixels[p+1]+pixels[p+2])/3;if(Math.max(pixels[p],pixels[p+1],pixels[p+2])===255)clipped++;}
   variants[name]={mean:luminance/(320*180),clipFraction:clipped/(320*180),shadow:at(pixels,300,170),midtone:at(pixels,85,100)};
   const x=i%2*480,y=Math.floor(i/2)*298;sc.fillStyle='#eee';sc.font='16px sans-serif';sc.fillText(name,x+8,y+20);sc.drawImage(g.render(source,{...M.gradeDefault(),...settings}),x,y+28,480,270);
  });
  // Decode a real 1080p Dreamcore frame and compare it to the preview.
  const asset={id:'dream-fixture',name:'synthetic',kind:'image',duration:1,image:source};M.assets.set(asset.id,asset);
  const p=M.newProject();p.clips=[M.clip(asset)];p.clips[0].out=.125;p.look={...M.gradeDefault(),...M.looks.Dreamcore};
  const previewCanvas=document.createElement('canvas');previewCanvas.width=960;previewCanvas.height=540;const renderer=new M.Renderer(previewCanvas);await renderer.render(p,0);rc.drawImage(previewCanvas,0,0,320,180);const preview=rc.getImageData(0,0,320,180).data;await renderer.close();
  const blob=await M.exportVideo(p,{long:1920,mbps:16,start:0,length:.125,signal:new AbortController().signal});
  const input=new M.Input({source:new M.BufferSource(await blob.arrayBuffer()),formats:M.ALL_FORMATS});const frame=await new M.CanvasSink(await input.getPrimaryVideoTrack()).getCanvas(0);rc.drawImage(frame.canvas,0,0,320,180);const decoded=rc.getImageData(0,0,320,180).data;
  let exportError=0;for(let i=0;i<decoded.length;i++)if(i%4!==3)exportError+=Math.abs(decoded[i]-preview[i])/(320*180*3);
  const exportWidth=frame.canvas.width;input.dispose();M.assets.delete(asset.id);const webglError=g.gl.getError();g.dispose();
  return {monotonicallyIncreasing,resolutionError,profiles,orientation,bright,dark,bypass,variants,exportError,exportWidth,webglError,sheet:sheet.toDataURL('image/jpeg',.8)};
 });
 const {sheet,...stats}=result;
 console.log('DREAMCORE_STATS '+JSON.stringify(stats));console.log('DREAMCORE_REVIEW '+sheet);
 assert.equal(result.monotonicallyIncreasing,true,'bloom must be a smooth halo without displaced outline peaks');
 assert.ok(result.resolutionError<4,'blur appearance must match across resolutions');
 assert.ok(result.profiles[0][25]>16,'bloom halo should be visible near a bright edge');
 assert.ok(result.orientation.top>220&&result.orientation.bottom<22,'offscreen blur orientation');
 assert.ok(result.bright<225,'bloom must preserve highlight headroom');assert.equal(result.dark,20);assert.deepEqual(result.bypass,[20,20,20]);
 for(const name of ['Dreamcore','Dreamcore Warm','Dreamcore Blue']){
  assert.ok(result.variants[name].mean<result.variants.Original.mean*1.1,'preserve overall density');
  assert.ok(result.variants[name].clipFraction<.01,'avoid washed-out clipped highlights');
 }
 assert.equal(result.exportWidth,1920);assert.ok(result.exportError<10,'1080p Dreamcore matches preview');assert.equal(result.webglError,0);
}
