// One decoder per timeline clip and playback/export session. Keep only the
// current and next decoded buffers, not an entire song in memory.
export class AudioReadSession {
  constructor(){this.readers=new Map();this.closed=false;}
  async *buffers(key,sink,from,to){
    if(this.closed)return;
    let r=this.readers.get(key);
    if(r&&(r.sink!==sink||from<r.from-1e-7)){
      await r.iterator.return?.();this.readers.delete(key);r=null;
    }
    if(!r){
      // AAC needs preceding transform history when playback starts after a seek.
      const iterator=sink.buffers(Math.max(0,from-.25))[Symbol.asyncIterator]();
      r={sink,iterator,current:null,next:null,from};this.readers.set(key,r);
      r.current=(await iterator.next()).value;
      if(r.current)r.next=(await iterator.next()).value;
    }
    r.from=from;
    while(!this.closed&&r.current&&r.current.timestamp<to){
      const b=r.current,n=r.next;
      const contiguous=n&&Math.abs(n.timestamp-(b.timestamp+b.duration))<=1.01/b.buffer.sampleRate;
      const end=contiguous?n.timestamp:b.timestamp+b.duration;
      if(end>from)yield {...b,duration:end-b.timestamp,nextBuffer:contiguous?n.buffer:null};
      // Retain the overlapping buffer for the next output block.
      if(end>to+1e-9)return;
      r.current=r.next;
      r.next=r.current?(await r.iterator.next()).value:null;
    }
  }
  async close(){
    this.closed=true;
    const readers=[...this.readers.values()];this.readers.clear();
    await Promise.allSettled(readers.map(r=>r.iterator.return?.()));
  }
}
