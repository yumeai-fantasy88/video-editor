import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,clip,textPlacement,total} from '../src/model.js';
test('adding subtitles at or after the picture end never creates an accidental black tail',()=>{
  const p=newProject();p.clips=[clip({id:'a',name:'a',kind:'video',duration:7.059})];
  for(const time of [0,5,7.059,10]){
    const cue=textPlacement(p,time);assert.ok(cue.start>=0);assert.ok(cue.end>cue.start);assert.ok(cue.end<=7.059);
    p.texts=[cue];assert.equal(total(p),7.059);
  }
});
test('short pictures and retimed clips keep subtitle duration in bounds',()=>{
  const p=newProject();p.clips=[clip({id:'a',name:'a',kind:'video',duration:.5})];p.clips[0].speed=2;
  assert.deepEqual(textPlacement(p,.25),{start:0,end:.25});
});
