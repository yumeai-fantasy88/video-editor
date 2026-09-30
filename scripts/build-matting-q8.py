import onnx, numpy as np, os
from onnx import numpy_helper, helper
import urllib.request,hashlib,json,pathlib
source=pathlib.Path('/tmp/withoutbg-v10.onnx')
if not source.exists(): urllib.request.urlretrieve('https://huggingface.co/withoutbg/withoutbg-openweights-onnx/resolve/cfae4da1ee09b27c45af2af2096d4d14721508ba/withoutbg-open-weights.onnx',source)
assert hashlib.sha256(source.read_bytes()).hexdigest()=='29930e48e9d5ecc56d6486c53c35a4c1470566c2a3359fa180b08c8d3c34ef0f'
m=onnx.load(source)
nodes=[]; initializers=[]; count=0
for t in m.graph.initializer:
    a=numpy_helper.to_array(t)
    if t.data_type==onnx.TensorProto.FLOAT and a.size>=4096:
        scale=np.float32(max(float(np.max(np.abs(a)))/127,1e-12))
        q=np.clip(np.round(a/scale),-127,127).astype(np.int8)
        initializers.extend([numpy_helper.from_array(q,t.name+'_q8'),numpy_helper.from_array(np.array(scale),t.name+'_scale'),numpy_helper.from_array(np.array(0,dtype=np.int8),t.name+'_zero')])
        nodes.append(helper.make_node('DequantizeLinear',[t.name+'_q8',t.name+'_scale',t.name+'_zero'],[t.name],name=t.name+'_dequant'))
        count+=1
    else: initializers.append(t)
old=list(m.graph.node);del m.graph.node[:];m.graph.node.extend(nodes+old)
del m.graph.initializer[:];m.graph.initializer.extend(initializers)
onnx.checker.check_model(m)

helper.set_model_props(m,{**{p.key:p.value for p in m.metadata_props},'author':'Imran Kocabiyik','license':'Apache-2.0 AND LicenseRef-DINOv3','license_url':'https://withoutbg.com/open-model/license','dinov3.attribution':'Built with DINOv3','modification':'Image Tools v7: symmetric per-tensor INT8 weight storage with DequantizeLinear; original FP32 input/output.'})
output=pathlib.Path('docs/image-tools/models/q8-v1');output.mkdir(parents=True,exist_ok=True)
b= m.SerializeToString()
parts=[]
for i,start in enumerate(range(0,len(b),40000000)):
 part=b[start:start+40000000];name=f'model-{i}.bin';(output/name).write_bytes(part);parts.append({'file':name,'size':len(part),'sha256':hashlib.sha256(part).hexdigest()})
(output/'manifest.json').write_text(json.dumps({'size':len(b),'parts':parts,'source_sha256':'29930e48e9d5ecc56d6486c53c35a4c1470566c2a3359fa180b08c8d3c34ef0f'}))
print('Built lightweight matting model:',len(b),'bytes')
