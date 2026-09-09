# Third-party software

The bundled application uses Mediabunny and @mediabunny/aac-encoder 1.55.7,
Copyright Vanilagy, licensed under MPL-2.0.

- Source: https://github.com/Vanilagy/mediabunny/tree/v1.55.7
- Packages and exact integrity hashes: package-lock.json
- License: https://www.mozilla.org/en-US/MPL/2.0/

The AAC extension embeds an FFmpeg AAC encoder WebAssembly build. Its wrapper's
distributed MPL license is copied to docs/aac-encoder-LICENSE.txt. FFmpeg source
is available at https://github.com/FFmpeg/FFmpeg and the extension's reproducible
build instructions are in https://github.com/Vanilagy/mediabunny/tree/v1.55.7/packages/aac-encoder.

No changes have been made to the third-party library sources. Application source
and build instructions are provided in this repository. The build copies the
distributed licenses into docs/ alongside the deployed bundle.
