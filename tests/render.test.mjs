import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer,assets} from '../src/engine.js';
import {newProject,clip} from '../src/model.js';
test('visible frame stays intact while decoding and is replaced only when complete',async()=>{
  const calls=[];
  const context=()=>({fillRect(){},clearRect(){},save(){},restore(){},translate(){},rotate(){},scale(){},drawImage(){}});
  const old=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext:context})};
  let release;
  const pending=new Promise(r=>release=r);
  const a={id:'render-test',name:'clip',kind:'video',duration:5,video:{},sink:{getCanvas:()=>pending}};
  assets.set(a.id,a);
  const p=newProject();p.clips=[clip(a)];
  const renderer=Object.assign(Object.create(Renderer.prototype),{canvas:{width:960,height:540},ctx:{fillRect(){calls.push('clear');},drawImage(){calls.push('present');}},iterators:new Map(),layer:document.createElement('canvas')});
  try{
    const work=renderer.render(p,1,true);
    await Promise.resolve();await Promise.resolve();
    assert.deepEqual(calls,[]);
    release({canvas:{width:1920,height:1080}});
    await work;
    assert.deepEqual(calls,['present']);
    a.sink.getCanvas=async()=>null;
    a.sink.canvases=async function*(){};
    await assert.rejects(renderer.render(p,2,true),/映像フレーム/);
    assert.deepEqual(calls,['present']);
  }finally{assets.delete(a.id);globalThis.document=old;}
});
