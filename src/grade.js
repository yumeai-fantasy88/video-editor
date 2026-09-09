// Display-referred SDR grading. Density is chroma-weighted attenuation,
// separate from saturation; not a film-stock or Resolve emulation.
export const fragment = `precision highp float;
varying vec2 uv; uniform sampler2D tex;
uniform float density,depth,protect,exposure,contrast,saturation,temperature,tint,shadows,highlights,fade;
uniform float red,yellow,green,cyan,blue,magenta;
float hue(vec3 c){float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),d=hi-lo;if(d<0.00001)return 0.;float h=hi==c.r?(c.g-c.b)/d:(hi==c.g?2.+(c.b-c.r)/d:4.+(c.r-c.g)/d);return fract(h/6.+1.);}
float weight(float h,float center){float d=abs(h-center);return max(0.,1.-min(d,1.-d)*6.);}
void main(){vec4 src=texture2D(tex,uv);vec3 c=src.rgb*exp2(exposure);
c*=vec3(1.+temperature*.15,1.+tint*.1,1.-temperature*.15);
c=(c-.5)*contrast+.5;float l=dot(c,vec3(.2126,.7152,.0722));
c+=shadows*.25*(1.-smoothstep(0.,.6,l))+highlights*.25*smoothstep(.4,1.,l);
l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,saturation);
float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b));float chroma=clamp((hi-lo)/max(hi,.0001),0.,1.);
float h=hue(c);float d=density+red*weight(h,0.)+yellow*weight(h,1./6.)+green*weight(h,2./6.)+cyan*weight(h,3./6.)+blue*weight(h,4./6.)+magenta*weight(h,5./6.);
float mask=chroma*(1.-protect*smoothstep(.55,1.,l))*(1.-depth*smoothstep(.25,.85,l));
c*=exp2(-d*mask*1.5);c=mix(c,vec3(.18),fade);gl_FragColor=vec4(clamp(c,0.,1.),src.a);}`;
export class Grader {
  constructor(){this.canvas=document.createElement('canvas');const gl=this.gl=this.canvas.getContext('webgl',{preserveDrawingBuffer:true,alpha:true,premultipliedAlpha:false});if(!gl)throw Error('このブラウザではカラー処理を開始できません');
    const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const p=this.program=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,'attribute vec2 pos; varying vec2 uv; void main(){uv=vec2((pos.x+1.)*.5,(1.-pos.y)*.5);gl_Position=vec4(pos,0.,1.);}'));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(p,'pos');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,axis,gl.CLAMP_TO_EDGE);for(const f of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,f,gl.LINEAR);
    this.uniforms={};
  }
  render(source,grade){const gl=this.gl;const w=source.width,h=source.height;if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}gl.viewport(0,0,w,h);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);for(const [k,v] of Object.entries(grade)){this.uniforms[k]??=gl.getUniformLocation(this.program,k);gl.uniform1f(this.uniforms[k],v);}gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return this.canvas;}
}
