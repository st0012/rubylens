# RubyLens Codebase Cosmos

Three whole-codebase stellar art studies built from the captured Rails and RDoc Rubydex indexes:

- A — Component Galaxy
- B — Dependency Orrery
- C — Semantic Supernova

Every rendered mark is data-bearing. Rails uses 8,051 strict workspace namespaces, 230 dependency packages, and 232 aggregate constant-backed marks. RDoc uses 258 strict workspace namespaces, 35 dependency packages, and 19 aggregate constant-backed marks. The checked-in browser fixtures contain anonymous numeric art fields only—no declaration names, package names, paths, or source text. Dependency presence and observed index data do not prove runtime loading.

```sh
npm install
npm run generate:data
npm run dev
```

Use `?target=rails|rdoc&model=a|b|c` to deep-link a sculpture. Omitting `target` defaults to Rails. Drag to rotate, wheel or pinch to zoom, and use Pause or Reset for the cinematic camera.

The production bundle includes Three.js locally and makes no remote runtime requests. Node.js 20.19 or newer is required.

Verification:

```sh
npm run check:data
npm test
npm run typecheck
npm run build
```
