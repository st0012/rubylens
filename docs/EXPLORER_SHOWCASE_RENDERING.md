# Explorer and Showcase rendering

This is an implementation reference for the shared runtime in `assets/runtime/report.js`. [PRODUCT.md](../PRODUCT.md) and [DESIGN.md](../DESIGN.md) remain the product and design contracts.

## Shared scene contract

Explorer and Showcase render the same complete scene model. A presentation mode does not duplicate points, resample dependency declarations, or reclassify the project or package morphologies. Both modes use the same deterministic positions, category colours, morphology rows, point-size calculation, and three-pass additive WebGL2 renderer. The project row governs Core/Test; each package row is independently classified and never inherited from a project, host, or system.

Both surfaces also share deterministic package-plane orientation, package-cloud rotation, and a transient Canvas2D travel overlay whose bounded constant-reference flights follow immutable world-space quadratics. Neither adds scene points or persistent edges.

The point population is:

```text
namespace points + dependency declaration points + package hubs + system hubs
```

For example, the public-safe Discourse evaluation contained 48,723 namespace points, 165,151 dependency declaration points, 303 package hubs, and no system hubs: 214,177 unique scene points. Each of the three renderer passes draws those same points; the model does not contain three copies.

## Unresolved-glow haze population

The milky texture of a real galaxy is not a halo around bright stars; it is millions of separate faint stars too small to resolve. Both renderers therefore append a render-only haze population (`buildHazePoints`) drawn from the same deterministic position law as the data marks — `corePosition`, `testPosition`, and `dependencyPosition` with fresh seeds — so the haze is literally more of the same stellar population, only fainter: arms stay crisp, the exponential radial falloff shows, and structure is never smeared by per-mark blur kernels. Zooming the Explorer resolves the haze into faint individual stars while the per-mark glow sprites fade out (`u_deepDetail` crossfade), the way a telescope resolves the Milky Way.

Haze tuning lives in the frozen `HAZE_RECIPE` block (per-category stars per mark, unit/normal channels, clump and sparkle knobs). Pool sizes follow the per-category mark counts under `HAZE_RECIPE.pointBudget`, a hard cap — rounding and dither tails trim, never spill. Haze alpha derives from each category's mean mark alpha through a steep faint-star curve with a small sparkle tail, and a bounded fraction of each namespace pool lands in tight clumps resampled from the same law (flocculent star-cloud patchiness). Dependency haze resamples per declaration row and keeps that row's package and system indexes (so it travels with dependency expansion); hubs shed no haze. Every haze row encodes its category as data category plus `HAZE_CATEGORY_OFFSET`. The haze and combined render buffer are built lazily on first use by an accepted renderer (`hazeBuffers`), so browsers that take the WebGL2-unavailable path never pay for them; `benchmark/explorer_frame.mjs` reports both the data point count and the drawn-with-haze count.

Dust absorbs rather than glows: for spiral and barred-spiral morphologies, one broad broken lane hugs each arm's inner edge (`dustAttenuation`) and attenuates Core and Test marks and haze by up to `DUST_PRESET.maxAbsorption`, fading out in the bulge, inside the bar, and past the disc edge. Lane angles come from `armCenterTheta` — the same arm-angle law that places arm stars, including seeded pitch jitters and forks — so lanes follow the rendered arms rather than an approximation. Absorption is baked into point alphas at build time — positions are static in galaxy space — so it adds no shader work, no per-frame cost, and no new points.

The Showcase presents the haze as its integrated light rather than as points: its fixed camera never resolves the unresolved population, so each haze row draws as a large, ultra-faint gaussian milk sprite (`SHOWCASE_PRESET.hazeMilkRadius`, `hazeMilkGainPercent`; flagged to the shared fragment shader by a negative radius) whose additive overlap forms a continuous glow tracing the density law — arms as luminous ridges, dust lanes as dark channels against the milk. With the milk carrying softness, the Showcase's per-mark glow pass is off (`pointGlowPercent` 0) and data marks stay crisp. The Explorer keeps the point representation, which its zoom exposure crossfade resolves into individual stars. They live after the data rows in the shared GPU buffer and draw only in the body pass; the glow and white-hot passes draw the data rows alone. Haze never enters interactive points, hit scans, search, annotations, or any reported count: `plottedScenePoints` remains data marks only, and the haze size is reported separately as `data-haze-points`.

## Surface comparison

| Concern | Explorer | Showcase |
| --- | --- | --- |
| Scene data and geometry | Complete shared point population and deterministic geometry | Identical complete population and geometry |
| Point size | Uploads the shared `point.sizeFactor` directly | Uploads the same `point.sizeFactor` directly for every category; there is no Showcase size multiplier |
| Alpha and exposure | Uploads shared `point.alphaBase`; Core/Test follow zoom exposure, while dependency declarations and hubs cannot exceed the exposure at the first zoom-in step from the default. Dependency haze starts from the same capped baseline before its deep-detail crossfade. Category emphasis and bounded focus floors provide interactive context | Multiplies every dependency point's alpha by `0.3`, including package and system hubs; Core and Test use `1.0`. The shader then applies the global Showcase star brightness of 75% |
| Camera and layout | Viewport-aware interactive camera with orbit, pan, zoom, and focus flights | Fixed 1920×1080 stage fitted into the viewport; fixed preset camera with autonomous motion |
| Rendering passes | Core/Test use additive glow, body, and white-hot-core passes; dependency marks omit the glow pass | Body and white-hot-core passes; the fixed preset keeps per-mark glow disabled |
| Motion | Optional, pausable scene drift and independently seeded package-cloud rotation; one seeded stream of staggered travel flights, capped from one to two by complete scene size, runs only while drift is active; reduced-motion disables all three | One autonomous camera turn per 60 seconds plus the same cloud rotation and deterministic continuous travel stream; every motion source closes the loop seam, and reduced-motion presents a static frame |
| Dependency focus | Package or system focus and 2.35× spatial expansion; ordinary dependency declarations remain non-interactive | No focus, selection, expansion, or dependency-point interaction |
| Labels | Search, panel, hover, and locked-selection context; no per-declaration dependency labels | Details mode cycles through a capped annotation set; Minimal mode has no annotations |
| GPU data | One shared static point buffer plus a derived two-texel-per-package anchor/rate/axis texture; package and system indices also drive focus/expansion | The same shared point buffer and derived package texture; interaction-only indices remain inert |
| Per-frame work | Three GPU draws plus one elapsed-time uniform, interactive camera/state updates, and at most two bounded travel streaks; no new per-point CPU layout | Three GPU draws plus one elapsed-time uniform, autonomous camera/annotation updates, and at most two bounded travel streaks; no new per-point CPU layout |

Equal uploaded size factors do not guarantee equal apparent screen size. The fixed Showcase camera, zoom, stage scaling, glow, and additive overlap can make a star look different from the same star in an Explorer viewport.

## Current dependency tuning

Point construction computes `sizeFactor` as `base * (0.62 + signal * 0.46)`; projection clamps rendered size to 3.2 for ordinary points and 5.2 for hubs.

| Point kind | Construction base | Shared construction alpha | Explorer upload | Showcase upload |
| --- | ---: | --- | --- | --- |
| Core namespace | 0.82 | Unscaled | Shared size and alpha | Shared size and alpha |
| Test namespace | 0.68 | Unscaled | Shared size and alpha | Shared size and alpha |
| Dependency declaration | 0.45 | `DEPENDENCY_STAR_ALPHA_SCALE` (`0.85`) | Shared size and alpha; exposure ceiling | Shared size; alpha × `0.3` |
| Package hub | 1.55 when grouped; 1.8 when standalone | Not affected by the ordinary-star `0.85` scale | Shared size and alpha, with bounded focus treatment and exposure ceiling | Shared size; alpha × `0.3` |
| System hub | 2.15 | Not affected by the ordinary-star `0.85` scale | Shared size and alpha, with bounded focus treatment and exposure ceiling | Shared size; alpha × `0.3` |

Dependency brightness uses fixed category and surface scales, not package-population normalization. Explorer caps dependency declarations and hubs at the exposure produced by its existing zoom curve at the first zoom-in step (`200% × 1.7 = 340%`). Wider overview and focus cameras therefore cannot brighten those marks past that level; dependency haze starts from the same capped baseline while retaining its existing crossfade toward deep-detail exposure. Explorer dependency marks skip the additive glow pass, leaving their body, white-hot core, and haze to carry the cloud without rasterizing large, nearly invisible glow sprites. Core and Test keep the original zoom curve and glow, and Showcase/Clip retain their lower `0.3` dependency scale and existing disabled per-mark glow. This avoids adding a package-specific exposure signal, but the independently derived local geometry can still make coarse package aggregate composition more visually legible. Because the renderer is additive, perceived brightness is not linear with alpha: dense overlap can still look brighter than sparse regions.

Dependency cloud centers apply a `1.15` halo-spacing scale after their deterministic system and package layout is complete. This expands every center coordinate uniformly around Core, increasing all pairwise center distances by 15% while leaving each cloud's declaration-count radius, internal morphology, and complete declaration population unchanged. The visual scale is divided out of the distance used by the tidal rotation term, so spacing refinement does not silently rewrite the dynamical-time classification.

## Dependency cloud rotation

Each package's local point field rotates rigidly around its existing package hub. Its package seed first supplies an isotropically distributed plane normal through uniform `cos(inclination)` and azimuth draws; the same orthonormal basis tilts every declaration and haze point in that package before rendering. Planes therefore do not inherit Core's orientation. The change is most visible for flattened package morphologies and naturally subtle for compact or nearly spherical clouds. The runtime does not add a distance-dependent alignment because the observational effect varies by satellite population and the report has no physical signal that could distinguish those populations.

The runtime derives one signed angular rate from data already present: declaration count supplies a mass proxy, the package anchor supplies cloud radius and distance from Core, and the package seed supplies direction. The characteristic score combines `sqrt(declarationCount / cloudRadius³)` with a weaker `(dependencyInnerRadius / coreDistance)³ᐟ²` tidal term, then compresses it to one or two whole turns per 60-second presentation loop. Most clouds use the slower tier; only the densest or most tidally influenced reach the faster one. The renderer stores no new payload field.

Both WebGL2 vertex shaders apply the same Rodrigues-axis transform from a two-texel-per-package float texture: one texel holds the hub and angular rate, the other the package-plane normal. Dependency haze retains its package and system indices, so the resampled micro-stars tilt and rotate with their parent cloud instead of leaving its texture behind. This keeps the point buffer static and adds no per-star CPU work or buffer upload. CPU admission applies the identical transform when it samples a dependency endpoint at launch or landing; the resulting flight path does not reattach to the rotating star. Explorer accumulates its cloud clock only while drift is active; Showcase and Clip use presentation elapsed time, with reduced motion fixed at phase zero. Whole turns close the 60-second Clip seam exactly.

Future brightness changes should preserve exact point counts and geometry, avoid compensating with a Showcase-only size increase, and be inspected in both surfaces. Explorer should be checked at overview and focused/expanded states; Showcase should be checked during autonomous motion.

## Constant-reference travel overlay

`constantReferenceLinks` stores `[referringIndex, referencedIndex]` rows. Both values are global render indexes into `namespaces` followed by `dependencyStars`; the referrer always addresses `namespaces`. The adapter supplies at most 1,024 deduplicated directed candidates; the art builder safely remaps both endpoints after scene shuffling, and the runtime decodes them once. The runtime derives animation seeds from existing artifact morphology, scene/link counts, and endpoint indexes instead of storing them. Package and system hubs are never endpoints.

Eligible rows represent resolved Core-to-Core, Core-to-Test, Test-to-Core, Test-to-Test, and workspace-to-dependency-declaration references whose occurrence belongs to a workspace namespace. The referring endpoint is always Core or Test; top-level, ambiguous, exact-self, and non-workspace origins are omitted. The stored direction remains workspace referrer to referenced declaration; for presentation, a flight travels in reverse from the referenced declaration star to its referrer. These candidates are not call edges or a complete relationship graph.

The schedule keeps the galaxy lively without drawing a web:

- complete scene population selects the visible-flight cap: `1` below 500 points and `2` from 500 upward;
- each individual launch follows the previous one after a seeded-random fraction of `flight duration / cap`; when capacity is full, the launch also waits for the corresponding older flight to end plus a seeded 24–150 ms handoff, preventing synchronized starts and mathematically bounding overlap;
- three of every four launch opportunities prefer workspace-to-dependency-declaration routes; the fourth prefers workspace-only routes, and every opportunity can fall back to the other pool;
- for each scheduled launch, admission samples the departure's world position at launch and the arrival's world position at landing, projects both through the expected mid-flight camera, builds a screen-space quadratic guide on one stable arc side, and checks its control hull and minimum 48-pixel length once;
- routes are admitted in deterministic launch order, with bounded candidate backfill, only when they remain below the cap and do not share an endpoint with an overlapping episode;
- admission unprojects the guide's control point through that camera at the endpoints' mean depth, producing one immutable world-space quadratic; later camera angles need not preserve the admission bounds;
- a rotating dependency may move away from its sampled departure after launch, and the flight lands at its sampled arrival;
- each frame evaluates wake and head samples on that world-space quadratic from absolute flight progress, then projects them through the live camera; Explorer orbit, pan, zoom, camera flights, and viewport changes keep active routes intact, while dependency expansion and category visibility changes reset routes because they change scene geometry or eligibility;
- the timetable retains at most one minute of immutable episodes; its final 80 ms stays clear, Showcase repeats that minute exactly, and Explorer replaces it at the next minute boundary;
- a compact, round-capped same-hue wake tapers into one filled elongated drop, then both fade out without a blurred tail halo, separate white-hot tip, moving orb, or persistent edge; Canvas2D keeps their thickness and head size in screen pixels and limits glow to the head;
- reduced motion disables the overlay, and Explorer enables it only while drift is active;
- live Showcase uses elapsed presentation time, while Clip supplies the same elapsed value from its deterministic synthetic clock.

The continuous timetable is deterministic for a generated artifact. Scheduling considers at most 12 candidates per launch. Each frame binary-searches the bounded minute and scans backward only across the fixed 2.2-second lifetime. For each active flight, drawing evaluates and projects at most 15 world points: 13 wake samples plus the head and its tangent sample. At most two flights are active, so rendering remains O(1) with respect to project size. This world-route change lives entirely in the browser runtime: it reuses the existing candidate payload and Canvas2D overlay without Ruby, payload, schema, or WebGL changes. Minimal Showcase carries the same anonymous candidate rows as Details, which discloses a sparse sample of relationship topology without endpoint names.

## Clip export

`rubylens clip` records the Showcase by driving the runtime's clip hook from an external headless Chrome over the DevTools protocol, streaming each captured frame into ffmpeg.

- `beginShowcaseClip()` cancels the live animation loop, marks `data-rubylens-clip` on the root element, and reports the preset (duration, stage size, details mode). `startShowcase` and `renderShowcase` no-op while clip mode is active so nothing races the capture driver.
- `renderShowcaseClipFrame(frameIndex, fps)` renders a frame as a pure function of `(frameIndex, fps)`: the same `showcaseFrameProgress` quantization and `applyShowcaseCamera` as the live loop, with `elapsed = frameIndex * 1000 / fps` as the synthetic clock. Its promise resolves after two animation frames so the draw has been composited before the driver screenshots, and `data-clip-frame` reports the rendered index.
- One camera loop is `durationMs` long and every cloud completes a whole number of local turns in the same interval, so an exported clip loops seamlessly at any capture fps.
- Travel choreography uses that same synthetic `elapsed` value. The timetable has one 80 ms quiet tail and repeats at 60,000 ms, so the start, final capture frame, and wrapped overlay states match.
- Annotation choreography (slot selection, projection, safe-area fit) is shared with the live path via `trackShowcaseAnnotation`. Presentation differs deliberately: live Showcase fades annotations with staggered CSS transitions on wall-clock time; clip mode disables those transitions and drives a single inline opacity envelope from the synthetic clock, because wall-clock fades would make captured frames nondeterministic. The envelope reuses the preset's reveal window, fade durations, and approximates the reveal easing.
- Capture is full-page (canvas plus masthead, stats, and annotation DOM) at a pinned 1920×1080 viewport, so the stage scale is exactly 1.

## Performance and privacy invariants

- Project and package morphology rows are decoded at load time; buffer and package-spin texture construction remain O(1) work per point or package, with no morphology, brightness, or cloud-position work added to the per-frame CPU path.
- Complete dependency declaration counts are retained; brightness tuning must not introduce a sampling cap.
- Constant-reference candidates are the bounded exception: at most 1,024 anonymous relationships feed one bounded minute of launch episodes and up to two constant-time overlay flights according to scene size, without changing complete inbound reference counts.
- Project and package geometry remain derived from existing numeric aggregates and deterministic seeds, without inherited package decisions.
- Brightness tuning must not add source names, source text, indexing, or per-declaration interaction.
