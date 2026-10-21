# Developer Guide

## Run locally

ES modules must be served over HTTP:

```bash
python3 -m http.server 8080
```

## Test

```bash
npm test
```

Uses Node's built-in test runner (Node 20 or later). The verification pass ran Node v22.22.0 and got 95 of 95 passing. Tests use a fake `AudioContext` and cover frequency maths, programs, presets, noise and nature synthesis, the store, persistence, the controller and the audio engine.

## Deploy

- GitHub Pages: `.github/workflows/static.yml` deploys on push to the default branch.
- Linux server: the README has a copy-paste nginx block.
