# Stellar design research

## Recommendation

RubyLens should use an astrophysical **visual grammar**, not attempt a literal simulation. RubyDex and Bundler signals decide which marks exist and how strongly they matter; galaxy morphology decides how density, light, colour, clustering, and negative space make the whole codebase feel natural.

The implemented project and package classifiers, schemas, family recipes, privacy boundary, and accepted comparison prototypes are preserved in the [galaxy morphology design](specs/2026-07-14-galaxy-morphology-design.md).

The strongest direction is one concentrated bulge, an extended irregular disc, and a sparse halo of compact dependency systems. It should never read as three exact rings, a uniform particle sphere, or an orbital diagram.

## Morphology rules

1. **Use continuous density falloff.** Model the broad disc with an exponential radial profile and the compact core with a moderate Sérsic-like profile. Avoid equal-width annuli and hard radial edges. The classic sources are [Freeman’s exponential-disc model](https://adsabs.harvard.edu/pdf/1970ApJ...160..811F) and [Graham and Driver’s Sérsic reference](https://arxiv.org/abs/astro-ph/0503176).

2. **Treat spiral arms as overdensities, not rails.** Put roughly 55–75% of disc points in an interarm distribution and bias the rest toward two to four broad, broken logarithmic arms. PHANGS finds that interarm and non-strong-spiral regions dominate disc area; [its stellar-structure study](https://arxiv.org/abs/2109.04491), the [Galaxy Zoo and SpArcFiRe arm study](https://arxiv.org/abs/1708.04628), and the [Galaxy Zoo 2 catalogue](https://academic.oup.com/mnras/article/435/4/2835/1022913) support a mixed, imperfect morphology rather than perfect curves.

3. **Keep vertical structure bounded.** A thin disc can use a zero-centred vertical distribution with a scale height around 5–12% of disc radius. The core can become spheroidal. Add one bounded warp or lopsidedness field rather than independent large offsets.

4. **Make dependency packages satellite systems.** Give every package a compact local population, then distribute those systems through a thicker, much sparser 3D halo with large empty intervals. This matches the useful visual hierarchy of disc, bulge, diffuse halo, globular clusters, and companion systems shown in [NASA’s Milky Way cluster overview](https://science.nasa.gov/asset/hubble/globular-clusters-around-milky-way/) and [ESA Gaia’s cluster and dwarf-galaxy orbit map](https://www.esa.int/ESA_Multimedia/Images/2018/04/Gaia_s_globular_clusters_and_dwarf_galaxies_with_orbits).

5. **Share a grammar without inheriting decisions.** One project morphology governs the Core/Test body. Each dependency package is classified independently from its own existing numeric aggregates and seed; it never inherits a project, host, or system family. Component phase drift, broken arm segments, package-system inclination, and rare off-plane outliers can vary deterministically inside those recipes. Smooth packages with at least 10,000 declarations receive a deterministic Spiral or Barred Spiral enrichment so their unusually large populations do not collapse into featureless light.

6. **Rotate package clouds on a dynamical timescale, not by arbitrary size bands.** A self-gravitating system's characteristic angular frequency scales as `sqrt(mass / radius³)`. RubyLens uses declaration count as the existing local mass proxy and the derived cloud radius as its size. The host's tidal gradient scales as `distance⁻³`, so a weaker `distance⁻³ᐟ²` frequency term lets otherwise similar clouds nearer Core rotate faster. This is a visual-timescale rule, not a claim that dependencies are tidally locked: [NASA's account of Kepler's laws](https://science.nasa.gov/solar-system/orbits-and-keplers-laws/) supports the distance/period relationship, while [Gaia's measured globular-cluster and dwarf-galaxy orbits](https://www.esa.int/ESA_Multimedia/Images/2018/04/Gaia_s_globular_clusters_and_dwarf_galaxies_with_orbits) support treating these systems as independently moving halo populations. Rigidly rotating the rendered pattern preserves morphology; literal stellar differential rotation would shear it and is outside the visual grammar.

7. **Give satellites independent planes unless the data justifies alignment.** Satellite orientation is not governed by one universal host-disc rule. Inner red satellites can show radial alignment while blue satellites are consistent with isotropic orientations ([Faltenbacher et al.](https://arxiv.org/abs/0704.0674)); the satellites of NGC 4258 appear randomly distributed rather than aligned with their host disc ([Spencer et al.](https://arxiv.org/abs/1404.7222)); and simulations find that most satellite spin axes retain their prior direction unless a close tidal encounter or merger swings them ([Lee et al.](https://arxiv.org/abs/1807.08867)). RubyLens has no physical colour, infall-history, or pericentre signal, so it samples each package plane isotropically from the existing package seed instead of inventing radial alignment. Flattened S0, Spiral, and Barred Spiral clouds reveal the inclination strongly; compact and nearly spherical clouds naturally reveal little.

## Light and material rules

1. **Most marks should be faint.** A practical art distribution is 75–85% faint, 12–22% medium, 1–3% bright, and only a handful of exceptional beacons. This is a rendering heuristic inspired by the steep high-mass tail described in the [stellar initial-mass-function review](https://www.annualreviews.org/content/journals/10.1146/annurev-astro-082708-101642), not a physical claim about code.

2. **Use circular stellar point-spread functions.** The Three.js renderer should replace diamonds, rings, and semantic glyph silhouettes with a bright circular core plus a faint broad halo. Reserve subtle diffraction spikes for at most the brightest 0.5%. [ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html) is the right GPU boundary; [PointsMaterial](https://threejs.org/docs/pages/PointsMaterial.html) documents the point-size limits that motivate billboard quads only for exceptional stars.

3. **Let bright marks carry HDR energy.** The production Three.js path should use `EffectComposer → RenderPass → UnrealBloomPass → OutputPass`, linear values above display white, ACES filmic tone mapping, and thresholded bloom. Start near threshold `1.0`, strength `0.45`, and radius `0.3`, then tune against Rails and RDoc. See the official [EffectComposer](https://threejs.org/docs/pages/EffectComposer.html), [UnrealBloomPass](https://threejs.org/docs/pages/UnrealBloomPass.html), and [OutputPass](https://threejs.org/docs/pages/OutputPass.html) documentation plus NVIDIA’s [real-time glow chapter](https://developer.nvidia.com/gpugems/gpugems/part-iv-image-processing/chapter-21-real-time-glow).

4. **Keep dependency light subordinate.** Use fixed category and surface scales rather than package-population exposure. Dense clouds may still accumulate more light through additive overlap, but they must not overwhelm Core or Tests; do not enlarge Showcase dependency stars to compensate for reduced alpha. Preserve apparent mass while keeping core → disc → satellites as the integrated-light hierarchy.

5. **Use temperature-like cores with category-tinted halos.** Hotter stars appear blue-white and cooler stars orange/red-white; [NASA’s blackbody curves](https://science.nasa.gov/asset/webb/continuous-spectra-blackbody-curves-of-stars/) and [stellar colour overview](https://science.nasa.gov/exoplanets/stars/) provide the physical reference. RubyLens can retain ruby core, cyan tests, and amber dependency identity in subtle halo tints rather than saturated star cores.

6. **Dust should absorb.** Use one to three broad, broken, derived density lanes that attenuate marks by roughly 20–55%. Do not add uniform brown fog or unrelated nebula particles. Real dust produces obscuring lanes, as described in [NASA’s NGC 1672 comparison](https://science.nasa.gov/missions/hubble/hubble-captures-a-galaxy-with-many-lights/) and the [Calzetti dust-opacity review](https://arxiv.org/abs/astro-ph/0109035). A later GPU implementation can derive a `Data3DTexture` from actual code marks using the official [Three.js volume-texture path](https://threejs.org/docs/pages/Data3DTexture.html).

## RubyLens category mapping

| Category | Astronomical role | Data-driven rendering |
| --- | --- | --- |
| Core | Bulge, nucleus, inner disc | Most concentrated population. Members, descendants, references, ancestry, definition sites, and reopenings control light/scale through user weights; they do not create hard depth bands. |
| Tests | Extended disc and flocculent arms | Flatter and radially broader. A minority occupies broken arms while most remains in the interarm disc. |
| Dependency packages | Globular clusters and satellite systems | One anonymous hub per package in a sparse 3D halo. Role sets a broad mean distance, not an exact shell. Each package uses an independently classified local morphology and isotropically seeded plane; tiny populations remain compact, while Spiral arms can taper beyond the nominal cloud radius. |
| Dependency declarations | Stars inside each satellite | Mostly tiny, faint, package-local marks. Fixed category and surface alpha preserve the hierarchy, while local geometry can still make coarse aggregate composition more legible. |
| Cross-origin evidence | Halo outliers or short streams | Use only when a real indexed signal supports it; never add decorative tidal tails without data. |

## Performance strategy

At current whole-codebase scales, point count is cheaper than translucent overdraw and bloom. The renderer should use:

- one complete GPU point field for faint/normal stars, without far/mobile point sampling;
- optional instanced billboard quads for the brightest 0.5–1%;
- half-resolution bloom and density passes on constrained devices;
- hysteresis when changing detail tiers.

Three.js provides the relevant [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) and [LOD](https://threejs.org/docs/pages/LOD.html) primitives. NVIDIA’s [high-speed off-screen particles](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-screen-particles) explains why reduced-resolution translucent effects matter more than vertex count.

## Implementation order

1. Replace categorical star shapes with a circular point-spread shader.
2. Add the HDR composer, thresholded bloom, and final output pass.
3. Replace rigid bands with the bulge/disc/halo mixture and package satellite systems.
4. Add a temperature-like colour lookup with subtle category halos.
5. Add a density-derived absorptive veil.
6. Add deterministic field-level detail tiers and mobile quality settings.

The first Ruby gem report already applies the macro rules—concentrated core, mixed interarm/arm test disc, sparse package systems, deterministic structured randomness, faint-majority light, and separate RubyDex attribute weights. The full HDR and volumetric treatment remains future GPU work; the Three.js design lab that explored it was retired and lives in Git history.
