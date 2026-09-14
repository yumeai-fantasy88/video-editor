export const colorRanges={
 denoiseLuma:[0,1,0],denoiseChroma:[0,1,0],noiseOn:[0,1,0],correctionOn:[0,1,1],lookOn:[0,1,1],textureOn:[0,1,1],
 pivot:[.05,.95,.5],black:[-.3,.3,0],white:[.5,1.5,1],
 curveLow:[-.2,.2,0],curveMid:[-.2,.2,0],curveHigh:[-.2,.2,0],
 grain:[0,1,0],bleed:[0,1,0],scanlines:[0,1,0],
 matchR:[.5,2,1],matchG:[.5,2,1],matchB:[.5,2,1],matchStrength:[0,1,0],
 satRed:[-1,1,0],satYellow:[-1,1,0],satGreen:[-1,1,0],satCyan:[-1,1,0],satBlue:[-1,1,0],satMagenta:[-1,1,0]
};
export const colorDefaults=()=>Object.fromEntries(Object.entries(colorRanges).map(([k,v])=>[k,v[2]]));
export const looks={
 'Cinema Soft':{contrast:.92,curveLow:-.025,curveHigh:.025,saturation:.92,density:.15,grain:.12},
 'Faded Film':{fade:.12,saturation:.82,temperature:.12,grain:.24,curveHigh:-.04},
 'Cool Night':{temperature:-.35,exposure:-.25,saturation:.85,density:.18,curveLow:-.04},
 'Y2K Clean':{contrast:1.1,saturation:1.12,temperature:-.08,curveHigh:.025},
 'CRT/VHS':{contrast:.93,saturation:.85,fade:.06,bleed:.4,scanlines:.3,grain:.15}
};
export function matchGains(source,reference){
 const clamp=(v)=>Math.max(.5,Math.min(2,v));
 return {matchR:clamp(reference[0]/Math.max(.02,source[0])),matchG:clamp(reference[1]/Math.max(.02,source[1])),matchB:clamp(reference[2]/Math.max(.02,source[2])),matchStrength:1};
}
export function imageMean(data){
 let sum=[0,0,0],weight=0;
 for(let i=0;i<data.length;i+=4){const a=data[i+3]/255,l=(data[i]+data[i+1]+data[i+2])/765;if(a<.5||l<.02||l>.98)continue;for(let c=0;c<3;c++)sum[c]+=data[i+c]/255*a;weight+=a;}
 if(!weight)throw Error('色合わせに使える中間色がありません');
 return sum.map(v=>v/weight);
}
