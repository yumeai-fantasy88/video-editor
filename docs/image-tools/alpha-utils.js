/* Continuous alpha compositing helpers, shared by browser and regression tests. */
(function(root){
  'use strict';
  const clamp=(x,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
  function letterbox(width,height,size=448) {
    const scale=size/Math.max(width,height);
    return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),size};
  }
  function rgbTensor(rgba,size=448) {
    const n=size*size,out=new Float32Array(n*3);
    for(let i=0;i<n;i++) for(let c=0;c<3;c++) out[c*n+i]=rgba[i*4+c]/255;
    return out;
  }
  // Infer nearby original background only from confidently transparent pixels.
  // This is a colour-spill approximation, not a reconstruction of refracted scenery.
  function backgroundEstimate(rgba,alpha,width,height,stride=448) {
    const n=width*height,background=new Float32Array(n*3),distance=new Int32Array(n).fill(-1),queue=new Int32Array(n);
    let head=0,tail=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const i=y*width+x,p=y*stride+x;
      if(alpha[p]<.025 && rgba[p*4+3]>250) {
        distance[i]=0;queue[tail++]=i;
        for(let c=0;c<3;c++)background[i*3+c]=rgba[p*4+c];
      }
    }
    while(head<tail){
      const i=queue[head++],x=i%width;
      for(const j of [x?i-1:-1,x+1<width?i+1:-1,i>=width?i-width:-1,i<n-width?i+width:-1]) {
        if(j<0||distance[j]>=0)continue;
        distance[j]=distance[i]+1;queue[tail++]=j;
        for(let c=0;c<3;c++)background[j*3+c]=background[i*3+c];
      }
    }
    return {background,distance};
  }
  function compositePixel(pixels,p,alpha,background,b,strength,confidence=1) {
    const a=clamp(alpha);
    if(a>0 && a<.98 && background && strength) {
      const weight=clamp(strength)*clamp(confidence)*Math.min(1,a/.1);
      for(let c=0;c<3;c++) {
        const foreground=clamp((pixels[p+c]-(1-a)*background[b*3+c])/Math.max(a,.03),0,255);
        pixels[p+c]=Math.round(pixels[p+c]+(foreground-pixels[p+c])*weight);
      }
    }
    pixels[p+3]=Math.round(pixels[p+3]*a);
    if(!pixels[p+3])pixels[p]=pixels[p+1]=pixels[p+2]=0;
  }
  const api={letterbox,rgbTensor,backgroundEstimate,compositePixel};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.ImageAlpha=api;
})(typeof self!=='undefined'?self:globalThis);
