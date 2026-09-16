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
}
if(textureOn>.5){
 // Four-tap highlight diffusion: intentionally small enough for mobile preview/export.
 if(bloom>.0001){
  vec2 radius=vec2(.012,.012*pixelY/pixelX);
  vec3 glow=vec3(0.);
  glow+=texture2D(tex,uv+vec2(radius.x,0.)).rgb;
  glow+=texture2D(tex,uv-vec2(radius.x,0.)).rgb;
  glow+=texture2D(tex,uv+vec2(0.,radius.y)).rgb;
  glow+=texture2D(tex,uv-vec2(0.,radius.y)).rgb;
  glow*=.25;float bright=smoothstep(.42,.85,lum(glow));
  c+=glow*bright*bloom*.48;
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
export class Grader {
  constructor(){this.canvas=document.createElement('canvas');const gl=this.gl=this.canvas.getContext('webgl',{preserveDrawingBuffer:true,alpha:true,premultipliedAlpha:false});if(!gl)throw Error('このブラウザではカラー処理を開始できません');
    const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const p=this.program=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,'attribute vec2 pos; varying vec2 uv; void main(){uv=vec2((pos.x+1.)*.5,(1.-pos.y)*.5);gl_Position=vec4(pos,0.,1.);}'));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(p,'pos');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,axis,gl.CLAMP_TO_EDGE);for(const f of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,f,gl.LINEAR);
    this.uniforms={};
  }
  dispose(){this.gl.getExtension('WEBGL_lose_context')?.loseContext();}
  render(source,grade,time=0){const gl=this.gl;const w=source.width,h=source.height;if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}gl.viewport(0,0,w,h);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);for(const [k,v] of Object.entries({...gradeDefault(),...grade,pixelX:1/w,pixelY:1/h,clock:Math.floor(time*24)})){this.uniforms[k]??=gl.getUniformLocation(this.program,k);gl.uniform1f(this.uniforms[k],v);}gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return this.canvas;}
}

