// Keep a sequential decoder alive during playback rather than seeking afresh
// from a keyframe for every screen refresh. Hold at most two output frames.
export class PreviewVideoSession {
  readers=new Map();
  closed=false;
  async read(key,source,time,makeSink=value=>value){
    if(this.closed)return null;
    let r=this.readers.get(key);
    if(r&&(r.source!==source||time<r.time)){await r.iterator.return();this.readers.delete(key);r=null;}
    if(!r){const sink=makeSink(source);r={source,sink,time,iterator:sink.canvases(Math.max(0,time-.1)),current:null,next:null};this.readers.set(key,r);r.next=(await r.iterator.next()).value;}
    r.time=time;
    while(r.next&&r.next.timestamp<=time+1e-6){r.current=r.next;r.next=(await r.iterator.next()).value;if(this.closed)return null;}
    // Match the existing startup-gap policy; never shift normal timestamps.
    return r.current||(time<.1&&r.next?.timestamp<=.1?r.next:null);
  }
  async close(){this.closed=true;const readers=[...this.readers.values()];this.readers.clear();await Promise.allSettled(readers.map(r=>r.iterator.return()));}
}
