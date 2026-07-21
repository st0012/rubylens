# RubyLens product contract

RubyLens turns a Ruby codebase into a private, self-contained stellar map. It is for Ruby developers who want to understand the shape of a project quickly without uploading its source or operating a separate visualization service.

## Product surfaces

- **Explorer (`rubylens report`)** is the interactive artifact. It supports system visibility, spatial navigation, Ruby-node and dependency-system search, hover and selection, and aggregate Ruby metrics.
- **Showcase (`rubylens showcase`)** is an autonomous presentation. Minimal output shows only the project title and galaxy; explicit `--details` output adds aggregate statistics and capped cinematic labels. It has no controls, hover, selection, search, warning details, or user navigation.
- **Clip (`rubylens clip`)** is the Showcase rendered as a shareable video: one seamless 1080p camera loop as an MP4, for chat and social posts where an HTML file cannot play. It writes the showcase HTML alongside the video, shows exactly what that showcase shows (`--details` included), and renders locally through an installed Chrome/Chromium and ffmpeg — never through a hosted service.

Explorer and Showcase outputs are single offline HTML files, written privately by default; Clip adds a locally rendered MP4 of the Showcase with the same disclosure profile. Reports intentionally embed the project name plus rendered namespace and dependency-system names; source text, comments, paths, dependency-star names, and per-node dependency identities stay out of the presentation model.

## Meaning and scale

- Core and Test points represent rendered Ruby namespaces. Their labels identify classes or modules already present in the report model.
- Gem systems represent aggregate dependency packages. Materialized multi-package Git sources share one parent system while preserving inspectable package subclouds, roles, and counts. Their individual stars remain anonymous; package focus describes the aggregate rather than a declaration-by-declaration dependency browser.
- Classes, modules, methods, and constants are Ruby construct counts for the named category or aggregate system. Visual signal metrics and derived morphology guide presentation; they are not architecture, quality, type-checking, or correctness claims.
- Large reports must remain scalable. Explorer and Showcase render every eligible scene point through WebGL2 or present an explicit unsupported state; search results, warning details, dependency detail, and cinematic labels remain deterministically bounded, and interaction-only work must not become per-frame work.

## Privacy

- Index and render locally by default; never upload source, index data, or report contents without an explicit future opt-in flow.
- Generated reports ship every script, style, and font locally and must not call CDNs, analytics, telemetry, or remote APIs.
- Derived names, paths, relationships, dependency lists, and aggregate visual shapes are sensitive even when no source text is included. Package-local morphology can make coarse aggregate composition more visually legible without adding names or raw source data.
- Source snippets and file contents stay out of the model. Any future excerpt feature requires an explicit option with clear sharing warnings.
- Default outputs are written owner-only to a Git-excluded path, with a warning that sharing the HTML can disclose codebase structure.
- Clip rendering drives a local headless browser and ffmpeg over loopback only; the video is a recording of the local Showcase and follows the same sharing warnings.
- Indexing passes an explicit Git-selected manifest to Rubydex's `Graph#index_all`. The bare `index_workspace` mode and upstream MCP indexer can read ignored or untracked Ruby files and are not product paths.
- If hosting is explored later, redaction, retention, access control, deletion, and cost limits come before accepting private data.

## Non-goals

RubyLens is not a Ruby type checker, a whole-program call graph, a source browser, a route explorer, or a per-dependency-star inspector. Hosting, uploads, and collaborative sharing are outside the current local-first product.
