// Random-access MP4 writes backed by immutable, bounded Blob pieces.
// Final header rewrites never allocate a buffer the size of the video.
export class BlobOutput {
  constructor(blockSize=1048576) {
    if(!Number.isSafeInteger(blockSize)||blockSize<1)throw new TypeError('Invalid block size');
    this.blockSize=blockSize;this.blocks=new Map();this.size=0;
  }
  write({data,position}) {
    if(!(data instanceof Uint8Array)||!Number.isSafeInteger(position)||position<0||!Number.isSafeInteger(position+data.byteLength))throw new TypeError('Invalid media write');
    let offset=0;
    while(offset<data.byteLength) {
      const at=position+offset,index=Math.floor(at/this.blockSize),within=at%this.blockSize;
      const count=Math.min(data.byteLength-offset,this.blockSize-within),old=this.blocks.get(index);
      const parts=[];
      if(within) {
        if(old)parts.push(old.slice(0,within));
        const gap=within-(old?.size??0);if(gap>0)parts.push(new Uint8Array(gap));
      }
      parts.push(data.subarray(offset,offset+count));
      if(old&&old.size>within+count)parts.push(old.slice(within+count));
      this.blocks.set(index,new Blob(parts));offset+=count;
    }
    this.size=Math.max(this.size,position+data.byteLength);
  }
  finish() {
    const parts=[],zero=new Blob([new Uint8Array(this.blockSize)]);
    for(let at=0;at<this.size;at+=this.blockSize) {
      const length=Math.min(this.blockSize,this.size-at),part=this.blocks.get(at/this.blockSize);
      if(part){parts.push(part.slice(0,length));if(part.size<length)parts.push(zero.slice(0,length-part.size));}
      else parts.push(zero.slice(0,length));
    }
    const blob=new Blob(parts,{type:'video/mp4'});this.clear();return blob;
  }
  clear(){this.blocks.clear();this.size=0;}
}
