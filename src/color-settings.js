export const colorRanges={
 denoiseLuma:[0,1,0],denoiseChroma:[0,1,0],noiseOn:[0,1,0],correctionOn:[0,1,1],lookOn:[0,1,1],textureOn:[0,1,1],
 pivot:[.05,.95,.5],black:[-.3,.3,0],white:[.5,1.5,1],
 curveLow:[-.2,.2,0],curveMid:[-.2,.2,0],curveHigh:[-.2,.2,0],
 grain:[0,1,0],bloom:[0,1,0],softness:[0,1,0],
 shadowWarmth:[-1,1,0],shadowTint:[-1,1,0],lightWarmth:[-1,1,0],lightTint:[-1,1,0],bleed:[0,1,0],scanlines:[0,1,0],
 matchR:[.5,2,1],matchG:[.5,2,1],matchB:[.5,2,1],matchStrength:[0,1,0],
 satRed:[-1,1,0],satYellow:[-1,1,0],satGreen:[-1,1,0],satCyan:[-1,1,0],satBlue:[-1,1,0],satMagenta:[-1,1,0]
};
export const colorDefaults=()=>Object.fromEntries(Object.entries(colorRanges).map(([k,v])=>[k,v[2]]));
export const looks={
 'Cinema Soft':{contrast:.92,curveLow:-.025,curveHigh:.025,saturation:.92,density:.15,grain:.12},
 'Dreamcore':{exposure:-.12,contrast:1.04,saturation:.86,highlights:-.18,fade:.025,curveLow:-.012,curveHigh:-.025,shadowWarmth:-.15,shadowTint:.55,lightWarmth:.1,lightTint:-.55,density:.08,softness:.24,bloom:.16,grain:.18},
 'Dreamcore Warm':{exposure:-.08,contrast:1.08,saturation:.94,highlights:-.15,fade:.018,temperature:.18,curveLow:-.02,curveHigh:-.035,shadowWarmth:.1,shadowTint:.13,lightWarmth:.65,lightTint:.02,softness:.32,bloom:.22,grain:.23},
 'Dreamcore Blue':{exposure:-.12,contrast:1.1,saturation:1.02,highlights:-.12,curveLow:-.018,curveHigh:-.018,shadowWarmth:-.95,shadowTint:-.18,lightWarmth:.55,lightTint:0,softness:.42,bloom:.2,bleed:.06,grain:.13,scanlines:.035},
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


export const lookDescriptions={
 'Cinema Soft':'穏やかなコントラストと控えめな彩度。色の深みを残す仕上がり。',
 'Dreamcore':'緑寄りの影とくすんだピンクの明部。陰影を残し、柔らかなにじみと粒子を加えます。',
 'Dreamcore Warm':'琥珀色の光、深い影、柔らかな輪郭と粒子。暖かい古い記憶のような仕上がり。',
 'Dreamcore Blue':'青い影と黄みの光。柔らかな輪郭とごく薄い走査線で、冷たい夢のような仕上がり。',
 'Cool Night':'青寄りの色温度と少し暗めの露出。夜の雰囲気。',
 'Y2K Clean':'コントラストと彩度を上げた、明快な色づかい。',
 'CRT/VHS':'色のにじみ、走査線、粒子を組み合わせたビデオ風。'
};
