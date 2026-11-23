# three.js (vendored)

- Version: **0.170.0** (`npm pack three@0.170.0`), MIT licence (see `LICENSE`).
- `three.module.min.js`: unmodified copy of `build/three.module.min.js`.
- `STLExporter.js`, `GLTFExporter.js`: copies of `examples/jsm/exporters/*` with the same import change (used by the 3D Design Studio export buttons).
- `OrbitControls.js`: copy of `examples/jsm/controls/OrbitControls.js` with one change: the bare import `from 'three'` is replaced by `from './three.module.min.js'`, so it loads without an import map (the CSP forbids inline scripts).

Used only by the 3D Design Studio (`js/visualisation/view3d.js`), which loads it on demand.
Upgrade: replace both files from the new package, reapply the import change, update this note and the service-worker precache list.
