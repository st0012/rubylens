import { describe, expect, it } from "vitest";
import { SHOWCASE_SHELL_SOURCE, SHOWCASE_STYLES_SOURCE } from "./helpers/runtime_source.mjs";

// Showcase shell and stylesheet contracts, moved from the retired Ruby file:
// the browser consumes these assets exactly like the runtime, so their
// contracts live in the frontend suite. Ruby proves they arrive verbatim.
describe("showcase shell contract", () => {
  it("marks the artifact and mode in the shell", () => {
    expect(SHOWCASE_SHELL_SOURCE).toContain('<meta name="rubylens-artifact" content="showcase">');
    expect(SHOWCASE_SHELL_SOURCE).toContain('data-rubylens-mode="showcase"');
  });

  it("keeps the stage, status, and annotation containers", () => {
    expect(SHOWCASE_SHELL_SOURCE).toContain('class="showcase-stage"');
    expect(SHOWCASE_SHELL_SOURCE).toContain('id="showcase-status" role="status" aria-live="polite" hidden');
    expect(SHOWCASE_SHELL_SOURCE).toContain('class="cinema-stats" aria-label="Codebase statistics" hidden');
    expect(SHOWCASE_SHELL_SOURCE).toContain('class="cinema-annotation" id="cinema-annotation" aria-hidden="true" hidden');
  });

  it("sits the galaxy summary with the title in both showcase modes", () => {
    expect(SHOWCASE_SHELL_SOURCE).toMatch(/<h1>Ruby project<\/h1>\s*<p class="galaxy-summary" id="galaxy-summary"><\/p>/);
    expect(SHOWCASE_STYLES_SOURCE).toContain('html[data-showcase-layout="widescreen"] .galaxy-summary');
    expect(SHOWCASE_STYLES_SOURCE).toContain("@media (max-width: 600px)");
    expect(SHOWCASE_STYLES_SOURCE).toContain(".galaxy-summary { font-size: 24px; }");
  });

  it("scales the masthead in the widescreen layout styles", () => {
    expect(SHOWCASE_STYLES_SOURCE).toContain("font: 500 38.88px/1.05 ui-serif");
    expect(SHOWCASE_STYLES_SOURCE).toContain('html[data-showcase-layout="widescreen"] .cinema-stats');
  });

  it("styles the webgl2-unavailable status accessibly", () => {
    expect(SHOWCASE_STYLES_SOURCE).toContain(".showcase-status { max-width: 720px; font-size: 24px; }");
  });

  it("disables css annotation fades in clip mode", () => {
    // Inline clip-frame opacity only works because clip mode turns fades off.
    expect(SHOWCASE_STYLES_SOURCE).toContain("html[data-rubylens-clip] .cinema-annotation");
  });

  it("stays offline and non-interactive", () => {
    expect(SHOWCASE_SHELL_SOURCE).not.toMatch(/https?:\/\//);
    expect(SHOWCASE_STYLES_SOURCE).not.toMatch(/https?:\/\//);
    expect(SHOWCASE_SHELL_SOURCE).not.toMatch(/<(?:button|aside|iframe|input|select|textarea)\b/);
    expect(SHOWCASE_SHELL_SOURCE).not.toMatch(/<canvas[^>]*tabindex=/);
  });
});
