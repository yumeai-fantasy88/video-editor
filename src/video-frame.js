// Some decoders return no exact timestamp match. Retry through sequential
// decoding, without silently substituting a frame from later in the video.
export async function readVideoFrame(sink,time){
  const frame=await sink.getCanvas(time);
  if(frame)return frame;
  const frames=sink.canvases(time,time+.25);
  try{
    const result=await frames.next();
    if(!result.done&&result.value.timestamp<=time+.000002)return result.value;
    return null;
  }finally{await frames.return();}
}
