const assert=require('node:assert/strict');
const {letterbox,rgbTensor,backgroundEstimate,compositePixel}=require('../image-tools/alpha-utils.js');
assert.deepEqual(letterbox(1600,900),{width:448,height:252,size:448});
assert.deepEqual(letterbox(900,1600),{width:252,height:448,size:448});
assert.deepEqual(Array.from(rgbTensor(new Uint8Array([255,128,0,255]),1)),[1,Math.fround(128/255),0]);
// Known foreground [45,85,125] at .5 over white has these observed RGB values.
const p=new Uint8ClampedArray([150,170,190,255]);
compositePixel(p,0,.5,new Float32Array([255,255,255]),0,1);
assert.deepEqual(Array.from(p),[45,85,125,128]);
const preserved=new Uint8ClampedArray([100,150,200,80]);
compositePixel(preserved,0,.5,null,0,0);
assert.deepEqual(Array.from(preserved),[100,150,200,40]);
const opaque=new Uint8ClampedArray([20,40,60,255]);
compositePixel(opaque,0,1,new Float32Array([255,255,255]),0,1);
assert.deepEqual(Array.from(opaque),[20,40,60,255]);
const transparent=new Uint8ClampedArray([150,100,80,0]);
compositePixel(transparent,0,.6,null,0,0);
assert.deepEqual(Array.from(transparent),[0,0,0,0]);
// Padding is excluded from background estimation: stride 2, valid region width 1.
const estimated=backgroundEstimate(new Uint8Array([200,210,220,255,0,0,0,255,100,110,120,255,0,0,0,255]),new Float32Array([0,0,.5,0]),1,2,2);
assert.deepEqual(Array.from(estimated.background),[200,210,220,200,210,220]);
assert.deepEqual(Array.from(estimated.distance),[0,1]);
console.log('PASS: tensor layout, letterboxing, continuous alpha, source transparency, opaque pixels, colour recovery, padding exclusion');
