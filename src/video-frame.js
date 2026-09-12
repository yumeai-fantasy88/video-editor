// Retry sequential decoding when timestamp lookup misses. At the very start
// only, allow a decoded frame up to 100 ms late to cover decoder startup gaps.
// This holds the first available picture; it never shifts the media timeline.
export async function readVideoFrame(sink,time){
  const frame=await sink.getCanvas(time);
  if(frame)return frame;
  const startup=time>=0&&time<.1;
  const frames=sink.canvases(startup?0:time,time+.25);
  try{
    const result=await frames.next();
    if(!result.done&&result.value.timestamp<=time+.000002)return result.value;
    if(startup&&!result.done&&result.value.timestamp<=.1)return result.value;
    return null;
  }finally{await frames.return();}
}
