import {gradeDefault} from './model.js';
// Display-referred SDR grading. Density is chroma-weighted attenuation,
// separate from saturation; not a film-stock or Resolve emulation.
export const fragment = `precision highp float;
varying vec2 uv; uniform sampler2D tex;
uniform float density,depth,protect,exposure,contrast,saturation,temperature,tint,shadows,highlights,fade;
uniform float red,yellow,green,cyan,blue,magenta;
uniform float denoiseLuma,denoiseChroma,noiseOn,correctionOn,lookOn,textureOn,pivot,black,white;
uniform float curveLow,curveMid,curveHigh,grain,bloom,bleed,scanlines;
uniform float matchR,matchG,matchB,matchStrength;
uniform float satRed,satYellow,satGreen,satCyan,satBlue,satMagenta;
uniform float pixelX,pixelY,clock;
uniform sampler2D glowTex,softTex;
uniform float softness,shadowWarmth,shadowTint,lightWarmth,lightTint;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 clean(vec2 at){
 vec3 center=texture2D(tex,at).rgb;
 if(noiseOn<.5||max(denoiseLuma,denoiseChroma)<.0001)return center;
 float base=lum(center),sum=0.;vec3 avg=vec3(0.);
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec3 s=texture2D(tex,at+vec2(float(x)*pixelX,float(y)*pixelY)).rgb;
  float w=exp(-abs(lum(s)-base)*24.)* (x==0&&y==0?2.:1.);
  avg+=s*w;sum+=w;
 }
 avg/=sum;float al=lum(avg);
 return vec3(mix(base,al,denoiseLuma))+mix(center-vec3(base),avg-vec3(al),denoiseChroma);
}
float curve(float x){
 float t=clamp(x,0.,1.);
 float delta=t<.25?mix(0.,curveLow,t*4.):t<.5?mix(curveLow,curveMid,(t-.25)*4.):t<.75?mix(curveMid,curveHigh,(t-.5)*4.):mix(curveHigh,0.,(t-.75)*4.);
 return x+delta;
}
float random(vec2 at){return fract(sin(dot(at,vec2(12.9898,78.233)))*43758.5453);}

float hue(vec3 c){float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),d=hi-lo;if(d<0.00001)return 0.;float h=hi==c.r?(c.g-c.b)/d:(hi==c.g?2.+(c.b-c.r)/d:4.+(c.r-c.g)/d);return fract(h/6.+1.);}
float weight(float h,float center){float d=abs(h-center);return max(0.,1.-min(d,1.-d)*6.);}
void main(){vec4 src=texture2D(tex,uv);vec3 c=clean(uv);
if(correctionOn>.5){c*=exp2(exposure);
c*=vec3(1.+temperature*.15,1.+tint*.1,1.-temperature*.15);
c=(c-pivot)*contrast+pivot;c=(c-black)/max(.05,white-black);float l=dot(c,vec3(.2126,.7152,.0722));
c+=shadows*.25*(1.-smoothstep(0.,.6,l))+highlights*.25*smoothstep(.4,1.,l);
l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,saturation);
c*=mix(vec3(1.),vec3(matchR,matchG,matchB),matchStrength);
}
if(lookOn>.5){
c=vec3(curve(c.r),curve(c.g),curve(c.b));
float l=lum(c),hh=hue(c);
float sat=1.+satRed*weight(hh,0.)+satYellow*weight(hh,1./6.)+satGreen*weight(hh,2./6.)+satCyan*weight(hh,3./6.)+satBlue*weight(hh,4./6.)+satMagenta*weight(hh,5./6.);
c=mix(vec3(l),c,sat);
float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b));float chroma=clamp((hi-lo)/max(hi,.0001),0.,1.);
float h=hue(c);float d=density+red*weight(h,0.)+yellow*weight(h,1./6.)+green*weight(h,2./6.)+cyan*weight(h,3./6.)+blue*weight(h,4./6.)+magenta*weight(h,5./6.);
float mask=chroma*(1.-protect*smoothstep(.55,1.,l))*(1.-depth*smoothstep(.25,.85,l));
c*=exp2(-d*mask*1.5);c=mix(c,vec3(.18),fade);
// Split-tone inside the look switch; keep pure black and white anchored.
float toneL=clamp(lum(c),0.,1.);
vec3 shadowColor=vec3(.12*shadowWarmth-.06*shadowTint,.10*shadowTint,-.12*shadowWarmth-.04*shadowTint);
vec3 lightColor=vec3(.12*lightWarmth-.06*lightTint,.10*lightTint,-.12*lightWarmth-.04*lightTint);
c+=mix(shadowColor,lightColor,smoothstep(.2,.8,toneL))*(4.*toneL*(1.-toneL));
}
if(textureOn>.5){
 // Blurred textures are low-resolution separable Gaussian passes, not displaced copies.
 if(softness>.0001)c+=softness*.55*(texture2D(softTex,uv).rgb-src.rgb);
 if(bloom>.0001){
  vec3 glow=texture2D(glowTex,uv).rgb;
  c+=(1.-clamp(c,0.,1.))*glow*bloom*.45;
 }
 // Normalized distances keep the same effect at preview and export resolutions.
 if(bleed>.0001){
  float radius=.02*bleed;
  vec3 spread=src.rgb*.2;
  spread+=texture2D(tex,uv+vec2(radius*.5,0.)).rgb*.25;
  spread+=texture2D(tex,uv-vec2(radius*.5,0.)).rgb*.25;
  spread+=texture2D(tex,uv+vec2(radius,0.)).rgb*.15;
  spread+=texture2D(tex,uv-vec2(radius,0.)).rgb*.15;
  c+=bleed*((spread-vec3(lum(spread)))-(src.rgb-vec3(lum(src.rgb))));
 }
 c+= (random(floor(uv/vec2(pixelX,pixelY))+vec2(clock*17.,clock*29.))-.5)*grain*.12;
 // 72 horizontal bands remain visible after the mobile preview is scaled down.
 c*=1.-scanlines*.8*smoothstep(.2,.8,.5+.5*cos(uv.y*72.*6.2831853));
}
gl_FragColor=vec4(clamp(c,0.,1.),src.a);}`;
// Auxiliary passes use texture coordinates without the canvas presentation flip.
const blurFragment=`precision highp float;
varying vec2 uv; uniform sampler2D tex; uniform vec2 direction; uniform float extract;
vec4 sampleColor(vec2 at){
 vec4 c=texture2D(tex,at);
 if(extract>.5)c.rgb*=smoothstep(.55,.92,dot(c.rgb,vec3(.2126,.7152,.0722)));
 return c;
}
void main(){
 vec4 c=vec4(0.);float sum=0.;
 for(int i=-8;i<=8;i++){
  float x=float(i),weight=exp(-x*x/18.);
  c+=sampleColor(uv+direction*x)*weight;sum+=weight;
 }
 gl_FragColor=c/sum;
}`;
export class Grader {
  constructor(){
    this.canvas=document.createElement('canvas');
    const gl=this.gl=this.canvas.getContext('webgl',{preserveDrawingBuffer:true,alpha:true,premultipliedAlpha:false});
    if(!gl)throw Error('このブラウザではカラー処理を開始できません');
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
    const program=(frag,flip)=>{
      const p=gl.createProgram();
      const v=compile(gl.VERTEX_SHADER,`attribute vec2 pos;varying vec2 uv;void main(){uv=vec2((pos.x+1.)*.5,${flip?'(1.-pos.y)':'(pos.y+1.)'}*.5);gl_Position=vec4(pos,0.,1.);}`),f=compile(gl.FRAGMENT_SHADER,frag);
      gl.attachShader(p,v);gl.attachShader(p,f);gl.bindAttribLocation(p,0,'pos');gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
    };
    this.program=program(fragment,true);this.blurProgram=program(blurFragment,false);
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    this.texture=this.makeTexture();this.targets=[];this.uniforms={};
    this.blurDirection=gl.getUniformLocation(this.blurProgram,'direction');this.blurExtract=gl.getUniformLocation(this.blurProgram,'extract');
  }
  makeTexture(){
    const gl=this.gl,texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,axis,gl.CLAMP_TO_EDGE);
    for(const f of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,f,gl.LINEAR);return texture;
  }
  prepareTargets(w,h){
    const gl=this.gl,scale=Math.min(1,256/Math.max(w,h)),bw=Math.max(1,Math.round(w*scale)),bh=Math.max(1,Math.round(h*scale));
    if(this.blurWidth===bw&&this.blurHeight===bh)return;
    this.blurWidth=bw;this.blurHeight=bh;gl.activeTexture(gl.TEXTURE0);
    for(let i=0;i<3;i++){
      const target=this.targets[i]??={texture:this.makeTexture(),framebuffer:gl.createFramebuffer()};
      gl.bindTexture(gl.TEXTURE_2D,target.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,bw,bh,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.texture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('光の拡散バッファを作成できません');
    }
  }
  blur(target,extract){
    const gl=this.gl,w=this.blurWidth,h=this.blurHeight;
    gl.useProgram(this.blurProgram);gl.viewport(0,0,w,h);gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[0].framebuffer);gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.uniform2f(this.blurDirection,1/w,0);gl.uniform1f(this.blurExtract,extract?1:0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[target].framebuffer);gl.bindTexture(gl.TEXTURE_2D,this.targets[0].texture);
    gl.uniform2f(this.blurDirection,0,1/h);gl.uniform1f(this.blurExtract,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    return this.targets[target].texture;
  }
  dispose(){this.gl.getExtension('WEBGL_lose_context')?.loseContext();}
  render(source,grade,time=0){
    const gl=this.gl,w=source.width,h=source.height,g={...gradeDefault(),...grade};
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
    let glow=this.texture,soft=this.texture;
    if(g.textureOn>.5&&(g.bloom>.0001||g.softness>.0001)){
      this.prepareTargets(w,h);
      if(g.bloom>.0001)glow=this.blur(1,true);
      if(g.softness>.0001)soft=this.blur(2,false);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(this.program);gl.viewport(0,0,w,h);
    for(const [unit,name,texture] of [[0,'tex',this.texture],[1,'glowTex',glow],[2,'softTex',soft]]){
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(this.program,name),unit);
    }
    for(const [k,v] of Object.entries({...g,pixelX:1/w,pixelY:1/h,clock:Math.floor(time*24)})){
      this.uniforms[k]??=gl.getUniformLocation(this.program,k);gl.uniform1f(this.uniforms[k],v);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return this.canvas;
  }
}
