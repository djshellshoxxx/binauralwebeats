# Architecture

- `index.html` with `css/styles.css` and the ES modules under `js/`.
- `js/engine/` contains the audio engine: the audio graph, frequency maths, noise and nature synthesis, programs, the breath pacer, the WAV writer, and an ambience worker.
- `js/app/` contains the store, controller, presets, persistence, session sharing and exporter.
- `js/ui/` contains the controls, knobs, editor, visualizer, PWA and system glue.
- `sw.js` and `manifest.webmanifest` provide offline use and install.
- The design specs are in `docs/specs/`. They are authoritative for behaviour.
