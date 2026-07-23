// Shared source-level access to the shipped runtime for contract tests that
// assert on exact shipped text (GLSL, presets, accessibility strings). Tests
// that can exercise behavior should use loadRuntime from ./runtime.mjs instead.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const RUNTIME_SOURCE = readFileSync(join(process.cwd(), "assets/runtime/report.js"), "utf8");
export const SHELL_SOURCE = readFileSync(join(process.cwd(), "assets/shells/report.html"), "utf8");
export const SHOWCASE_SHELL_SOURCE = readFileSync(join(process.cwd(), "assets/shells/showcase.html"), "utf8");

// Mirrors the extraction the retired Ruby helper performed: a top-level
// `function name(...)` through its closing four-space brace.
export function runtimeFunction(name) {
  const match = RUNTIME_SOURCE.match(new RegExp(`^    function ${name}\\b[\\s\\S]*?^    \\}\\n`, "m"));
  if (!match) throw new Error(`${name} function not found in the runtime`);
  return match[0];
}
