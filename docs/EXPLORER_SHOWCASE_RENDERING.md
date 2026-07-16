# Explorer and Showcase rendering

This is an implementation reference for the shared runtime in `assets/runtime/report.js`. [PRODUCT.md](../PRODUCT.md) and [DESIGN.md](../DESIGN.md) remain the product and design contracts.

## Shared scene contract

Explorer and Showcase render the same complete scene model. A presentation mode does not duplicate points, resample dependency declarations, or reclassify the project or package morphologies. Both modes use the same deterministic positions, category colours, morphology rows, point-size calculation, and three-pass additive WebGL2 renderer. The project row governs Core/Test; each package row is independently classified and never inherited from a project, host, or system.

The point population is:

```text
namespace points + dependency declaration points + package hubs + system hubs
```

For example, the public-safe Discourse evaluation contained 48,723 namespace points, 165,151 dependency declaration points, 303 package hubs, and no system hubs: 214,177 unique scene points. Each of the three renderer passes draws those same points; the model does not contain three copies.

## Surface comparison

| Concern | Explorer | Showcase |
| --- | --- | --- |
| Scene data and geometry | Complete shared point population and deterministic geometry | Identical complete population and geometry |
| Point size | Uploads the shared `point.sizeFactor` directly | Uploads the same `point.sizeFactor` directly for every category; there is no Showcase size multiplier |
| Alpha and exposure | Uploads shared `point.alphaBase`; zoom exposure, category emphasis, and bounded focus floors provide interactive context | Multiplies every dependency point's alpha by `0.3`, including package and system hubs; Core and Test use `1.0`. The shader then applies the global Showcase star brightness of 75% |
| Camera and layout | Viewport-aware interactive camera with orbit, pan, zoom, and focus flights | Fixed 1920×1080 stage fitted into the viewport; fixed preset camera with autonomous motion |
| Rendering passes | Additive glow, body, and white-hot-core passes | The same three additive passes, with Showcase's fixed glow and brightness presets |
| Motion | Optional, pausable scene drift; reduced-motion disables it | One autonomous turn per 60 seconds; reduced-motion presents a static frame |
| Dependency focus | Package or system focus and 2.35× spatial expansion; ordinary dependency declarations remain non-interactive | No focus, selection, expansion, or dependency-point interaction |
| Labels | Search, panel, hover, and locked-selection context; no per-declaration dependency labels | Details mode cycles through a capped annotation set; Minimal mode has no annotations |
| GPU data | One static buffer with package and system indices used by focus/expansion | One smaller static buffer without interaction indices |
| Per-frame work | Three GPU draws plus interactive camera/state updates; no new per-point CPU layout | Three GPU draws plus autonomous camera/annotation updates; no new per-point CPU layout |

Equal uploaded size factors do not guarantee equal apparent screen size. The fixed Showcase camera, zoom, stage scaling, glow, and additive overlap can make a star look different from the same star in an Explorer viewport.

## Current dependency tuning

Point construction computes `sizeFactor` as `base * (0.62 + signal * 0.46)`; projection clamps rendered size to 3.2 for ordinary points and 5.2 for hubs.

| Point kind | Construction base | Shared construction alpha | Explorer upload | Showcase upload |
| --- | ---: | --- | --- | --- |
| Core namespace | 0.82 | Unscaled | Shared size and alpha | Shared size and alpha |
| Test namespace | 0.68 | Unscaled | Shared size and alpha | Shared size and alpha |
| Dependency declaration | 0.45 | `DEPENDENCY_STAR_ALPHA_SCALE` (`0.85`) | Shared size and alpha | Shared size; alpha × `0.3` |
| Package hub | 1.55 when grouped; 1.8 when standalone | Not affected by the ordinary-star `0.85` scale | Shared size and alpha, with bounded focus treatment | Shared size; alpha × `0.3` |
| System hub | 2.15 | Not affected by the ordinary-star `0.85` scale | Shared size and alpha, with bounded focus treatment | Shared size; alpha × `0.3` |

Dependency brightness uses fixed category and surface scales, not package-population normalization. This avoids adding a package-specific exposure signal, but the independently derived local geometry can still make coarse package aggregate composition more visually legible. Because the renderer is additive, perceived brightness is not linear with alpha: dense overlap can still look brighter than sparse regions.

Future brightness changes should preserve exact point counts and geometry, avoid compensating with a Showcase-only size increase, and be inspected in both surfaces. Explorer should be checked at overview and focused/expanded states; Showcase should be checked during autonomous motion.

## Performance and privacy invariants

- Project and package morphology rows are decoded at load time; buffer construction remains O(1) work per point (O(point count) in total), with no morphology or brightness work added to the per-frame CPU path.
- Complete dependency declaration counts are retained; brightness tuning must not introduce a sampling cap.
- Project and package geometry remain derived from existing numeric aggregates and deterministic seeds, without inherited package decisions.
- Brightness tuning must not add source names, source text, indexing, or per-declaration interaction.
