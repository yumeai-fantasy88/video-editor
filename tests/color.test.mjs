import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,clip,validateProject,gradeDefault} from '../src/model.js';
import {matchGains,imageMean,looks} from '../src/color-settings.js';
test('old projects migrate to neutral independent global look and noise off',()=>{
 const p=newProject(),a={id:'a',name:'a',kind:'image',duration:5};p.assets=[a];p.clips=[clip(a)];delete p.look;p.clips[0].grade={density:.4};
 validateProject(p);assert.equal(p.clips[0].grade.density,.4);assert.equal(p.clips[0].grade.denoiseChroma,0);assert.equal(p.clips[0].grade.denoiseLuma,0);
 p.look.density=1;assert.equal(p.clips[0].grade.density,.4);
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
});
test('invalid extended grade values are rejected',()=>{
 const p=newProject();p.look.grain=NaN;assert.throws(()=>validateProject(p));
 p.look=gradeDefault();p.look.white=0;assert.throws(()=>validateProject(p));
});
test('matching gains remain bounded and ignore clipped samples',()=>{
 assert.deepEqual(matchGains([.2,.3,.4],[.4,.3,.2]),{matchR:2,matchG:1,matchB:.5,matchStrength:1});
 const m=imageMean(new Uint8ClampedArray([0,0,0,255,255,255,255,255,100,150,200,255]));assert.deepEqual(m,[100/255,150/255,200/255]);
 assert.throws(()=>imageMean(new Uint8ClampedArray([0,0,0,255])));
});
test('all supplied looks survive project save and validation',()=>{
 for(const setting of Object.values(looks)){const p=newProject();p.look={...gradeDefault(),...setting};assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);}
});


test('dream variants retain highlight headroom and new controls migrate as neutral',()=>{
 const p=newProject();delete p.look.softness;delete p.look.shadowWarmth;validateProject(p);assert.equal(p.look.softness,0);assert.equal(p.look.shadowWarmth,0);
 for(const name of ['Dreamcore','Dreamcore Warm','Dreamcore Blue']){p.look={...gradeDefault(),...looks[name]};assert.equal(p.look.bleed<=.06,true);assert.ok(p.look.bloom<=.22);assert.ok(p.look.highlights<0);assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);}
});
