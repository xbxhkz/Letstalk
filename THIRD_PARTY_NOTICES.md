# Third-party notices

## CSSgram

The "Classic" colour filters in `src/studio/filters.ts` (Retro 77, Pastel, Brass, Borough, Crisp, Dawn, Lavender, Frost, Ember, Lark, Punch, Moss, Soirée, Moonlight, Peach, Shore, Faded, Sunrise, Dusk, Blush, Toast, Vale, Wild, Willow, Ink, Cross) are ported from the filter recipes in CSSgram (https://github.com/una/CSSgram) and renamed.

```
The MIT License (MIT)

Copyright (c) 2015 Una Kravets

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## MediaPipe

Face tracking and person segmentation use Google's MediaPipe Tasks (`@mediapipe/tasks-vision`) and its Face Landmarker and Selfie Segmenter models, under the Apache License 2.0 (https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE). The models are downloaded by `scripts/prepare-mediapipe.mjs`.

## Effects

The screen effects (sketch, toon, oil paint/Kuwahara, halftone, crosshatch, emboss, thermal and so on) are original implementations of standard image-processing techniques (Sobel edge detection, Kuwahara filtering, posterisation and others); no third-party shader code is included.
