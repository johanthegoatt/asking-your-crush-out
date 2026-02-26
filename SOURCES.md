# Sources Used For Improvements

## GitHub

- canvas-confetti by catdad (confetti engine + API):
  https://github.com/catdad/canvas-confetti

## Three.js

- Three.js core docs and examples:
  https://threejs.org/
- GLTFLoader (examples module):
  https://threejs.org/docs/#examples/en/loaders/GLTFLoader

## Vercel

- premalu reference site (interaction/layout inspiration):
  https://premalu.vercel.app/
- Vercel HTML Starter (baseline static setup pattern):
  https://vercel.com/new/templates/other/html-starter
- Vercel Web Analytics docs:
  https://vercel.com/docs/analytics
- Vercel Speed Insights docs:
  https://vercel.com/docs/speed-insights

## Short Link Providers

- TinyURL public API endpoint:
  https://tinyurl.com/app/dev
- is.gd API docs:
  https://is.gd/apishorteningreference.php
- CleanURI API endpoint:
  https://cleanuri.com/docs

## 3D Dataset Sources

- Poly Pizza model page: Heart (Quaternius, CC0)
  https://poly.pizza/m/1yCRUwFnwX
- Poly Pizza model page: Pickup Heart (Quaternius, CC0)
  https://poly.pizza/m/Zj4GUkxCG9
- Static model file used in project (`heart.glb`)
  https://static.poly.pizza/a53d4e74-46dd-43d3-9815-82cef1fa8ccc.glb
- Static model file used in project (`pickup-heart.glb`)
  https://static.poly.pizza/38716c7c-cd82-4254-8cce-51a6c2491e8a.glb

## What was applied in this project

- Added `canvas-confetti` (via CDN) as the primary confetti renderer on `index.html`.
- Kept the original custom canvas confetti logic as a fallback.
- Added Vercel Analytics script (`/_vercel/insights/script.js`) to index + afterpages.
- Added a native `Share` button and retained `Copy` fallback for share links.
- Added a `Shorten` action backed by a Vercel API route (`/api/shorten`) with provider failover.
- Added an envelope teaser interaction inspired by the premalu-style intro animation.
- Added `three.js` WebGL scene rendering with real dataset-backed GLB hearts (Poly Pizza, CC0).
