# Explorer and Showcase rendering

This is an implementation reference for the shared runtime in `assets/runtime/report.js`. [PRODUCT.md](../PRODUCT.md) and [DESIGN.md](../DESIGN.md) remain the product and design contracts.

## Shared scene contract

Explorer and Showcase render the same complete scene model. A presentation mode does not duplicate points, resample dependency declarations, or reclassify the project or package morphologies. Both modes use the same deterministic positions, category colours, morphology rows, point-size calculation, and three-pass additive WebGL2 renderer. The project row governs Core/Test; each package row is independently classified and never inherited from a project, host, or system.

Both surfaces also share a transient 2D travel overlay derived from bounded constant-reference candidates. The overlay does not add scene points or persistent edges.

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
| Motion | Optional, pausable scene drift; one to three concurrent travel flights, scaled by complete scene size, run only while drift is active; reduced-motion disables both | One autonomous turn per 60 seconds plus one to four launches per deterministic two-second travel cycle, with up to three flights visible concurrently according to complete scene size; reduced-motion presents a static frame |
| Dependency focus | Package or system focus and 2.35× spatial expansion; ordinary dependency declarations remain non-interactive | No focus, selection, expansion, or dependency-point interaction |
| Labels | Search, panel, hover, and locked-selection context; no per-declaration dependency labels | Details mode cycles through a capped annotation set; Minimal mode has no annotations |
| GPU data | One static buffer with package and system indices used by focus/expansion | One smaller static buffer without interaction indices |
| Per-frame work | Three GPU draws plus interactive camera/state updates and at most three bounded travel streaks; no new per-point CPU layout | Three GPU draws plus autonomous camera/annotation updates and at most three bounded travel streaks; no new per-point CPU layout |

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

## Constant-reference travel overlay

`constantReferenceLinks` stores `[referringIndex, referencedIndex]` rows. Both values are global render indexes into `namespaces` followed by `dependencyStars`; the referrer always addresses `namespaces`. The adapter supplies at most 1,024 deduplicated directed candidates; the art builder safely remaps both endpoints after scene shuffling, and the runtime decodes them once. The runtime derives animation seeds from the endpoint indexes instead of storing them. Package and system hubs are never endpoints.

Eligible rows represent resolved Core-to-Core, Core-to-Test, Test-to-Core, Test-to-Test, and workspace-to-dependency-declaration references whose occurrence belongs to a workspace namespace. The referring endpoint is always Core or Test; top-level, ambiguous, exact-self, and non-workspace origins are omitted. The stored direction remains workspace referrer to referenced declaration; for presentation, a flight travels in reverse from the referenced declaration star to its referrer. These candidates are not call edges or a complete relationship graph. Explorer's CPU endpoint projection mirrors the shader's package/system expansion transform so a flight still meets an expanded dependency star.

The schedule keeps the galaxy lively without drawing a web:

- each deterministic two-second cycle scales its candidate launches and visible-flight cap from the complete scene population: `1 / 1` below 500 points, `2 / 2` below 5,000, `3 / 2` below 100,000, and `4 / 3` from 100,000 upward;
- at two or more launches, one slot prefers workspace-only routes and the rest prefer workspace-to-dependency-declaration routes; the one-launch tier prefers dependency routes in two of every three cycles, and every slot can fall back to the other pool;
- for each scheduled launch, admission projects the departure at its launch camera and the arrival at its expected end camera, freezes one broad screen-space quadratic, and checks its complete curve bounds and minimum 48-pixel length once; it does not sample intermediate camera states across the episode;
- routes are admitted in deterministic launch order, with bounded candidate backfill, only when they do not share an endpoint with an overlapping episode;
- each admitted 1.3-second flight remains one continuous immutable episode; manual Explorer camera changes, viewport resizes, or category visibility changes reset its travel clock and plan, so the next episode observes the normal launch delay instead of recomputing or re-entering a route;
- a long, round-capped same-hue wake feathers in, peaks behind its subdued leading edge, and fades out without a white-hot tip, moving orb, or persistent edge;
- reduced motion disables the overlay, and Explorer enables it only while drift is active;
- live Showcase uses elapsed presentation time, while Clip supplies the same elapsed value from its deterministic synthetic clock.

Cycle selection and randomized start placement are deterministic for a generated artifact. The cycle boundary builds plain immutable episode records from the expected launch and end cameras; each frame reads the cached plan and draws at most three fixed-segment trails without reprojecting endpoints or scanning the candidate list. The hard-capped overlay therefore remains O(1) per frame. Minimal Showcase carries the same anonymous candidate rows as Details, which discloses a sparse sample of relationship topology without endpoint names.

## Clip export

`rubylens clip` records the Showcase by driving the runtime's clip hook from an external headless Chrome over the DevTools protocol, streaming each captured frame into ffmpeg.

- `beginShowcaseClip()` cancels the live animation loop, marks `data-rubylens-clip` on the root element, and reports the preset (duration, stage size, details mode). `startShowcase` and `renderShowcase` no-op while clip mode is active so nothing races the capture driver.
- `renderShowcaseClipFrame(frameIndex, fps)` renders a frame as a pure function of `(frameIndex, fps)`: the same `showcaseFrameProgress` quantization and `applyShowcaseCamera` as the live loop, with `elapsed = frameIndex * 1000 / fps` as the synthetic clock. Its promise resolves after two animation frames so the draw has been composited before the driver screenshots, and `data-clip-frame` reports the rendered index.
- One camera loop is `durationMs` long and ends exactly where it starts, so an exported clip loops seamlessly at any capture fps.
- Travel choreography uses that same synthetic `elapsed` value. No flight is active at the cycle boundary, so the 0 ms and 60,000 ms overlay states match.
- Annotation choreography (slot selection, projection, safe-area fit) is shared with the live path via `trackShowcaseAnnotation`. Presentation differs deliberately: live Showcase fades annotations with staggered CSS transitions on wall-clock time; clip mode disables those transitions and drives a single inline opacity envelope from the synthetic clock, because wall-clock fades would make captured frames nondeterministic. The envelope reuses the preset's reveal window, fade durations, and approximates the reveal easing.
- Capture is full-page (canvas plus masthead, stats, and annotation DOM) at a pinned 1920×1080 viewport, so the stage scale is exactly 1.

## Performance and privacy invariants

- Project and package morphology rows are decoded at load time; buffer construction remains O(1) work per point (O(point count) in total), with no morphology or brightness work added to the per-frame CPU path.
- Complete dependency declaration counts are retained; brightness tuning must not introduce a sampling cap.
- Constant-reference candidates are the bounded exception: at most 1,024 anonymous relationships feed one to four scheduled launches and up to three constant-time overlay flights according to scene size, without changing complete inbound reference counts.
- Project and package geometry remain derived from existing numeric aggregates and deterministic seeds, without inherited package decisions.
- Brightness tuning must not add source names, source text, indexing, or per-declaration interaction.
