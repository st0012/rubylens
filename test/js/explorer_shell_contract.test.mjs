import { describe, expect, it } from "vitest";
import { orderedIndex, SHELL_SOURCE, STYLES_SOURCE } from "./helpers/runtime_source.mjs";

// Explorer shell and stylesheet contracts, moved from the retired Ruby file:
// the browser consumes these assets exactly like the runtime, so their
// contracts live in the frontend suite. Ruby proves they arrive verbatim.
describe("explorer shell contract", () => {
  it("keeps toolbar and footer affordances accessible", () => {
    expect(SHELL_SOURCE).toContain('aria-label="Pan mode"');
    expect(SHELL_SOURCE).toContain('aria-keyshortcuts="Space"');
    expect(SHELL_SOURCE).toContain('id="reset-view" aria-label="Reset to default view"');
    expect(SHELL_SOURCE).toContain("Double-click a dependency system or gem cloud, press Enter or F on its selected marker");
  });

  it("keeps the privacy footer in the shell", () => {
    // A product contract of every generated report: the owner-only warning
    // must reach the reader.
    expect(SHELL_SOURCE).toContain("dependency stars remain anonymous");
    expect(SHELL_SOURCE).toContain("Do not share the HTML unless you intend to disclose codebase structure.");
  });

  it("locks the offline content-security policy", () => {
    expect(SHELL_SOURCE).toContain("connect-src 'none'");
  });

  it("titles the report and panel", () => {
    expect(SHELL_SOURCE).toContain("RubyLens · Explorer");
    expect(SHELL_SOURCE).toContain("Explore this codebase");
  });

  it("sits the galaxy summary with the title", () => {
    expect(SHELL_SOURCE).toMatch(/<h1>Ruby project<\/h1>\s*<p class="galaxy-summary" id="galaxy-summary"><\/p>/);
    expect(STYLES_SOURCE).toContain(".galaxy-summary");
  });

  it("keeps partial index status an accessible bounded disclosure", () => {
    expect(SHELL_SOURCE).toContain('<details class="warning-disclosure" id="status" hidden>');
    expect(SHELL_SOURCE).toContain('<summary id="warning-summary"></summary>');
    expect(STYLES_SOURCE).toContain("max-height: min(360px, calc(100vh - 180px))");
    expect(STYLES_SOURCE).toContain("max-height: clamp(48px, calc(54vh - 220px), 240px)");
    expect(STYLES_SOURCE).toContain('.warning-disclosure > summary::after { content: ""; flex: 0 0 8px; width: 8px; height: 5px;');
    expect(STYLES_SOURCE).toContain("clip-path: polygon(0 0, 50% 70%, 100% 0, 100% 30%, 50% 100%, 0 30%)");
    expect(STYLES_SOURCE).toContain("details.warning-disclosure[open] > summary::after { transform: rotate(180deg); }");
    expect(STYLES_SOURCE).toContain("overflow-wrap: anywhere");
  });

  it("uses 200 percent for initial and reset camera without changing drift", () => {
    expect(SHELL_SOURCE).toContain('id="reset-view" aria-label="Reset to default view" aria-keyshortcuts="0" title="Reset view (0)">Reset</button>');
    expect(SHELL_SOURCE).toContain('<output class="zoom-level" id="zoom-level" aria-label="Zoom level">200%</output>');
    const toolbar = SHELL_SOURCE.match(/<div class="toolbar">([\s\S]*?)<\/div>/)[1];
    const expectedOrder = ['id="motion"', 'id="reset-view"', 'id="pan-mode"', 'id="zoom-out"', 'id="zoom-level"', 'id="zoom-in"'];
    const sorted = [...expectedOrder].sort((a, b) => orderedIndex(toolbar, a) - orderedIndex(toolbar, b));
    expect(sorted).toEqual(expectedOrder);
  });

  it("makes space the only keyboard drift toggle and respects native controls", () => {
    expect(SHELL_SOURCE).toContain('id="motion" aria-label="Pause drift" aria-keyshortcuts="Space" aria-pressed="false"');
  });

  it("keeps view shortcuts working regardless of focus with editable guards", () => {
    expect(SHELL_SOURCE).toContain('id="zoom-out" aria-label="Zoom out" aria-keyshortcuts="-" title="Zoom out (−)"');
    expect(SHELL_SOURCE).toContain('id="zoom-in" aria-label="Zoom in" aria-keyshortcuts="+" title="Zoom in (+)"');
  });

  it("gates the shortcuts overlay as a modal dialog", () => {
    expect(SHELL_SOURCE).toContain('<div class="help-overlay" id="shortcuts-help" role="dialog" aria-modal="true" aria-label="Shortcuts and controls" hidden>');
    expect(SHELL_SOURCE).toContain('id="help-open" aria-label="Keyboard shortcuts" aria-keyshortcuts="?" aria-haspopup="dialog" title="Keyboard shortcuts (?)">?</button>');
    expect(SHELL_SOURCE).toContain('<button type="button" id="help-close" aria-label="Close shortcuts">Close</button>');
    expect(STYLES_SOURCE).toContain(".help-overlay[hidden] { display: none; }");
  });

  it("advertises star hover and hub tooltip interactions", () => {
    expect(STYLES_SOURCE).toContain("canvas.is-star:not(.is-pan):not(.is-dragging-pan):not(:active) { cursor: pointer; }");
  });

  it("keeps the hint clear of the expanded panel", () => {
    expect(STYLES_SOURCE).toContain(".panel:not(.is-collapsed) ~ .hint { right: 380px; }");
    expect(SHELL_SOURCE).toContain('<div class="hint">Drag to orbit · scroll to zoom · press ? for all shortcuts</div>');
  });

  it("keeps search lazy, bounded, progressive, and navigable", () => {
    expect(SHELL_SOURCE).toContain('<input type="search" id="explorer-search"');
    expect(SHELL_SOURCE).toContain('role="region" aria-label="Search results"');
  });

  it("requires webgl2 across every unavailable path", () => {
    expect(STYLES_SOURCE).toContain("button:disabled { opacity: .45; cursor: not-allowed; }");
    expect(STYLES_SOURCE).toContain(".explorer-search[hidden] { display: none; }");
    expect(STYLES_SOURCE).toContain(".toolbar[hidden] { display: none; }");
  });

  it("stays offline", () => {
    expect(SHELL_SOURCE).not.toMatch(/https?:\/\//);
    expect(STYLES_SOURCE).not.toMatch(/https?:\/\//);
  });

  it("never carries the showcase marker", () => {
    // ArtifactMarker distinguishes report and showcase outputs by shell
    // content; a report shell carrying the showcase meta would make every
    // generated report register as a showcase artifact.
    expect(SHELL_SOURCE).not.toContain("rubylens-artifact");
  });
});
