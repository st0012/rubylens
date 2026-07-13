# RubyLens product contract

RubyLens turns a Ruby codebase into a private, self-contained stellar map. It is for Ruby developers who want to understand the shape of a project quickly without uploading its source or operating a separate visualization service.

## Product surfaces

- **Explorer (`rubylens report`)** is the interactive artifact. It supports system visibility, spatial navigation, Ruby-node and dependency-system search, hover and selection, and aggregate Ruby metrics.
- **Showcase (`rubylens showcase`)** is an autonomous presentation. Minimal output shows only the project title and galaxy; explicit `--details` output adds aggregate statistics and capped cinematic labels. It has no controls, hover, selection, search, warning details, or user navigation.

Both outputs are single offline HTML files, written privately by default. Reports intentionally embed the project name plus rendered namespace and dependency-system names; source text, comments, paths, dependency-star names, and per-node dependency identities stay out of the presentation model.

## Meaning and scale

- Core and Test points represent rendered Ruby namespaces. Their labels identify classes or modules already present in the report model.
- Gem systems represent aggregate dependency packages. Their individual stars remain anonymous; package focus describes the system rather than a declaration-by-declaration dependency browser.
- Classes, modules, methods, and constants are Ruby construct counts for the named category or aggregate system. Visual signal metrics guide exploration; they are not type-checking or correctness claims.
- Large reports must remain bounded. Rendering, search results, warning details, and dependency detail use deterministic limits, and interaction-only work must not become per-frame work.

## Non-goals

RubyLens is not a Ruby type checker, a whole-program call graph, a source browser, a route explorer, or a per-dependency-star inspector. Hosting, uploads, and collaborative sharing are outside the current local-first product.
