# RubyLens product contract

RubyLens turns a Ruby codebase into a private, self-contained stellar map. It is for Ruby developers who want to understand the shape of a project quickly without uploading its source or operating a separate visualization service.

## Product surfaces

- **Explorer (`rubylens explorer` or `rubylens report`)** is the interactive artifact. It supports system visibility, spatial navigation, Ruby-node and dependency-system search, hover and selection, and aggregate Ruby metrics. `rubylens explorer --output json` writes the same complete art model in a portable envelope for later stitching.
- **Collection (`rubylens stitch` or `rubylens collection`)** packages two or more independently indexed projects as galaxy clusters in one Explorer universe, with every galaxy visible in one viewport and one set of controls. `stitch` combines artifacts generated inside separate bundles; direct `collection` indexes all targets through the active bundle. Orbit gestures move the shared camera around the whole scene. Projects never share namespaces, dependency systems, morphology, warnings, or reference resolution.
- **Showcase (`rubylens showcase`)** is an autonomous presentation. Minimal output shows the project title and galaxy, including sparse anonymous travel lines; explicit `--details` output adds aggregate statistics and capped cinematic labels. It has no controls, hover, selection, search, warning details, or user navigation.
- **Clip (`rubylens clip`)** is the Showcase rendered as a shareable video: one seamless 1080p camera loop as an MP4, for chat and social posts where an HTML file cannot play. It writes the showcase HTML alongside the video, shows exactly what that showcase shows (`--details` included), and renders locally through an installed Chrome/Chromium and ffmpeg — never through a hosted service.

Explorer, Collection, and Showcase HTML outputs are single offline files, written privately by default; Explorer can also emit a private JSON artifact, and Clip adds a locally rendered MP4 of the Showcase with the same disclosure profile. Explorer artifacts, Reports, and Collections intentionally embed project names plus rendered namespace and dependency-system names. Showcase strips the full name arrays but retains numeric scene data and a bounded anonymous sample of constant-reference topology. Source text, comments, paths, dependency-star names, and per-node dependency identities stay out of the presentation model.

## Meaning and scale

- Core and Test points represent rendered Ruby namespaces. Their labels identify classes or modules already present in the report model.
- Gem systems represent aggregate dependency packages. Materialized multi-package Git sources share one parent system while preserving inspectable package subclouds, roles, and counts. Their individual stars remain anonymous; package focus describes the aggregate rather than a declaration-by-declaration dependency browser.
- Travel lines sample resolved constant references whose occurrence belongs to a workspace namespace. Core-to-Core, Core-to-Test, Test-to-Core, Test-to-Test, and workspace-to-Gem references are eligible; top-level, ambiguous, exact-self, and non-workspace origins are omitted. A Gem endpoint is the exact anonymous dependency declaration star, never a package or system hub. The stored relationship is workspace referrer to referenced declaration; the flight travels from the referenced declaration to the referrer as a visual metaphor. These lines are neither call edges nor a complete relationship graph.
- Classes, modules, methods, and constants are Ruby construct counts for the named category or aggregate system. Visual signal metrics and derived morphology guide presentation; they are not architecture, quality, type-checking, or correctness claims.
- Large reports must remain scalable. Explorer and Showcase render every eligible scene point through WebGL2 or present an explicit unsupported state; search results, warning details, dependency detail, cinematic labels, and travel candidates remain strictly bounded, and interaction-only work must not become per-frame work.
- Collections preserve their input order, assemble their galaxy groups into one world coordinate system, and upload the complete scene through one Explorer renderer and camera. Artifact size and interaction work include every project's complete art data; practical collection size is therefore bounded by browser rendering resources as well as file size.
- Direct Collection can include only dependency gems visible to its active bundle. Separate artifact generation lets each project use its own bundle before Stitch combines the results without indexing again.

## Privacy

- Index and render locally by default; never upload source, index data, or report contents without an explicit future opt-in flow.
- Generated reports ship every script, style, and font locally and must not call CDNs, analytics, telemetry, or remote APIs.
- Derived names, paths, relationships, dependency lists, and aggregate visual shapes are sensitive even when no source text is included. Package-local morphology can make coarse aggregate composition more visually legible without adding names or raw source data.
- Minimal Showcase and Clip disclose a sparse anonymous sample of relationship topology through travel lines even though they omit endpoint names.
- An Explorer JSON artifact has the same disclosure surface as Explorer HTML. It carries no source text or target path, but it contains the complete art model and generation warnings.
- A Collection has the combined disclosure surface of every included Explorer. It never embeds target paths, and duplicate display names are disambiguated from their collection order rather than filesystem information.
- Source snippets and file contents stay out of the model. Any future excerpt feature requires an explicit option with clear sharing warnings.
- Outputs are written owner-only. Project-root defaults are Git-excluded; the current-directory Stitch default is not. RubyLens warns that sharing HTML or JSON can disclose codebase structure.
- Clip rendering drives a local headless browser and ffmpeg over loopback only; the video is a recording of the local Showcase and follows the same sharing warnings.
- Each project indexes through its own Rubydex graph and explicit Git-selected manifest passed to `Graph#index_all`. The bare `index_workspace` mode and upstream MCP indexer can read ignored or untracked Ruby files and are not product paths.
- If hosting is explored later, redaction, retention, access control, deletion, and cost limits come before accepting private data.

## Non-goals

RubyLens is not a Ruby type checker, a whole-program call graph, a source browser, a route explorer, a cross-project relationship graph, or a per-dependency-star inspector. Hosting, uploads, and collaborative sharing are outside the current local-first product.
