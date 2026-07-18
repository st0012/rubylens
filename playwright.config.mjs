import { defineConfig } from "@playwright/test";

// WebGL2 tests share one GPU: serialized workers, readiness comes from the
// runtime's own dataset signals, never from timeouts.
export default defineConfig({
  testDir: "test/browser",
  testMatch: "**/*.spec.mjs",
  globalSetup: "./test/browser/build_fixtures.mjs",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    browserName: "chromium",
    viewport: { width: 1280, height: 800 },
  },
});
