# Image Tools v3 — automatic alpha matting (experimental)

Images stay in the browser. The page downloads model/runtime assets from Hugging Face and jsDelivr; it does not upload input images or call a paid inference API. First model download is approximately 455 MB. Cache storage is best effort and can be evicted by the browser. Processing requires substantial memory; mobile devices may fail or reload the page. Cancel terminates the worker.

## Model

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
