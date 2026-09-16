import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,clip,total,duplicateText,resetClipColor,resetAllColor,gradeDefault,validateProject} from '../src/model.js';
const setup=()=>{const p=newProject(),a={id:'fixture',kind:'image',name:'image',duration:5};p.assets=[a];p.clips=[clip(a),clip(a)];return p;};
const text=()=>({id:'text',text:'字幕',start:1,end:3,font:'serif',size:5,x:50,y:50,stroke:2,color:'#ffffff',outline:'#000000',background:true,backgroundColor:'#123456',backgroundOpacity:.4});
test('text duplicate preserves timing, background and style without extending the project',()=>{
 const p=setup();p.texts=[text()];const length=total(p),copy=duplicateText(p,'text');
 assert.notEqual(copy.id,'text');assert.deepEqual({...copy,id:'text'},p.texts[0]);assert.equal(total(p),length);
 copy.text='changed';copy.backgroundColor='#abcdef';assert.equal(p.texts[0].text,'字幕');assert.equal(p.texts[0].backgroundColor,'#123456');
 validateProject(p);assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
});
test('old text backgrounds retain black at 65 percent and invalid values are rejected',()=>{
 const p=setup(),t=text();delete t.backgroundColor;delete t.backgroundOpacity;p.texts=[t];validateProject(p);
 assert.equal(t.backgroundColor,'#000000');assert.equal(t.backgroundOpacity,.65);
 t.backgroundOpacity=2;assert.throws(()=>validateProject(p));t.backgroundOpacity=.65;t.backgroundColor='invalid';assert.throws(()=>validateProject(p));
});
test('clip and project resets respect scope and leave timing, audio, text and placement unchanged',()=>{
 const p=setup(),c=p.clips[0];p.texts=[text()];p.audio=[{...clip(p.assets[0]),start:0}];c.grade.exposure=1;c.grade.grain=.8;c.grade.matchStrength=.5;p.look.density=.6;p.lookPreset='Cinema Soft';c.gradePreset='saved';
 resetClipColor(c,'color');assert.equal(c.grade.exposure,0);assert.equal(c.grade.matchStrength,0);assert.equal(c.grade.grain,.8);assert.equal(p.look.density,.6);
 c.grade.exposure=1;resetClipColor(c,'texture');assert.equal(c.grade.grain,0);assert.equal(c.grade.exposure,1);
 const layout=JSON.stringify(p.clips.map(({grade,gradePreset,...rest})=>rest)),audio=JSON.stringify(p.audio),texts=JSON.stringify(p.texts);
 p.clips[1].grade.bleed=1;resetAllColor(p);
 for(const x of p.clips)assert.deepEqual(x.grade,gradeDefault());assert.deepEqual(p.look,gradeDefault());assert.equal(p.lookPreset,undefined);
 assert.equal(JSON.stringify(p.clips.map(({grade,gradePreset,...rest})=>rest)),layout);assert.equal(JSON.stringify(p.audio),audio);assert.equal(JSON.stringify(p.texts),texts);
});
