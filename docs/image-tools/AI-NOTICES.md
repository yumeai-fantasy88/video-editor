# Image Tools v7 — automatic alpha matting (experimental)

Images stay in the browser. The page downloads model/runtime assets from Hugging Face and jsDelivr; it does not upload input images or call a paid inference API. First model download is approximately 455 MB. Cache storage is best effort and can be evicted by the browser. Processing requires substantial memory; mobile devices may fail or reload the page. Cancel terminates the worker.

## Model

withoutBG Open Model (WBGNet), Copyright 2026 Imran Kocabiyik.
Built with DINOv3. This product includes DINOv3 Materials from Meta Platforms.
The preprocessing was adapted for JavaScript from the Apache-2.0 reference implementation; see [APACHE-2.0.txt](APACHE-2.0.txt).

withoutBG Open Weights v10.0.0, pinned to `cfae4da1ee09b27c45af2af2096d4d14721508ba`:
https://huggingface.co/withoutbg/withoutbg-openweights-onnx

The model directly predicts continuous alpha without user masks. It uses a 448 × 448 RGB input, top-left letterboxing with black padding, values in [0,1], NCHW; output `alpha` is already in [0,1] (no additional sigmoid). Pre/postprocessing follows the reference implementation:
https://github.com/withoutbg/withoutbg-python/blob/a44f4b45f5cc34b71b2a5ebd1e5c4e6ceb980b5a/src/withoutbg/models.py

The model is downloaded from the publisher and not bundled in this repository. Model license: withoutBG Open Model License, combining Apache-2.0 for withoutBG portions and Meta DINOv3 terms for backbone weights. Read the publisher's full terms:
https://withoutbg.com/open-model/license
https://github.com/withoutbg/withoutbg-python/blob/main/LICENSE-DINOv3
https://github.com/withoutbg/withoutbg-python/blob/main/NOTICE
Depth Anything V2 Small is Apache-2.0.

## Runtime

ONNX Runtime Web 1.23.2 — Microsoft, MIT license:
https://github.com/microsoft/onnxruntime/blob/v1.23.2/LICENSE
Loaded from jsDelivr on demand. Single-threaded WASM inside a dedicated Worker, compatible with hosting without COOP/COEP headers. No WebGPU requirement.

## Output and limits

- Continuous predicted alpha is multiplied by the input alpha; already transparent pixels stay transparent.
- The optional original-background colour reduction extrapolates colour from confident background pixels. It is an approximation and is less aggressive far from known background. Set to 0 to preserve original RGB.
- This is not a refractive-flow or physical glass reconstruction model. Glass, mirrors, clear interiors over busy scenes, small details, and multiple ambiguous subjects may fail. No universal professional-quality claim is made.
- Preview colours are CSS only and are never included in PNG export.
- 448px model inference limits matte detail even when the exported image is larger. Resizing the PNG does not recover lost details.
- Input JPG/PNG decoding and orientation use the browser's image decoder. PNG alpha is preserved; JPEG output is disabled while removal is enabled.

## Validation

See `tests/image-tools-alpha.cjs` for tensor layout, alpha preservation and foreground-colour recovery checks. Model quality and device compatibility must be assessed with real images; numerical helper tests do not establish inference quality.

2026-09-22: Deployed page tested in desktop Chrome using a synthetic 512px cup fixture. Real ONNX download and inference completed. Downloaded RGBA PNG had 212,505 fully transparent, 37,831 partially transparent and 11,808 opaque pixels; background corner alpha 0, label alpha 255. Original/result comparison and cancellation/re-enabling controls worked. This verifies the processing path, not real-glass restoration quality. iPhone hardware was not tested.


2026-09-30: Model download is streamed into Cache Storage before allocating the ONNX input buffer; it no longer retains all network chunks while allocating a second full model buffer. When storage is unavailable, a bounded single-buffer load uses Content-Length. Downloads without a known length require Cache Storage. Phones/tablets terminate the inference worker immediately after alpha estimation and retain only the small alpha cache before export. The original v10 model and alpha quality are unchanged. Runtime/session initialization still requires substantially more memory than the download size; iPhone hardware success is not established by these changes.



2026-09-30 v7: Optional experimental lightweight derivative: symmetric per-tensor INT8 storage for FP32 initializers with at least 4096 elements, DequantizeLinear nodes, original FP32 input/output contract. About 115 MB instead of 455 MB. Source pinned and SHA-256 verified by scripts/build-matting-q8.py. Built with DINOv3. Copyright 2026 Imran Kocabiyik; Apache-2.0 AND LicenseRef-DINOv3. See APACHE-2.0.txt and LICENSE-DINOv3.txt. Original model metadata retained. This derivative is modified by Image Tools; quantization may change edges and alpha values. Graph optimization and arena/pattern memory are disabled for the lightweight model to avoid retaining expanded FP32 constant weights. Three same-origin chunks are individually cached and verified against SHA-256 in the manifest; no user images are uploaded. Previous interrupted stage/version/model is stored locally, without image data.

Local validation: CPU synthetic cup fixture original versus lightweight mean absolute alpha error 0.000392, with localized differences up to 0.776; this is not evidence of general glass accuracy. Isolated lightweight CPU process peak RSS approximately 350 MiB. Mobile Safari hardware not tested.
