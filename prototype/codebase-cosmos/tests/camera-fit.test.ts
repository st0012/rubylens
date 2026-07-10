import { describe, expect, it } from "vitest";
import { compositionRadius, fitCamera } from "../src/camera-fit";
import { compose } from "../src/compositions";
import type { StyleId, TargetId, VariantId } from "../src/cosmos-data";

const targets: readonly TargetId[] = ["rails", "rdoc"];
const styles: readonly StyleId[] = ["galaxy", "city"];
const variants: readonly VariantId[] = ["a", "b", "c"];
const combinations = targets.flatMap((target) => styles.flatMap((style) => variants.map((variant) => ({ target, style, variant }))));

describe("composition camera bounds", () => {
  it.each(combinations)("fits $target/$style/$variant on desktop and portrait", ({ target, style, variant }) => {
    const radius = compositionRadius(compose(target, style, variant));
    expect(radius).toBeGreaterThan(0);
    for (const viewport of [{ width: 1440, height: 900, fov: 42 }, { width: 390, height: 844, fov: 60 }]) {
      const fit = fitCamera(radius, viewport.fov, viewport.width / viewport.height);
      expect(fit.distance).toBeGreaterThan(radius);
      expect(fit.maxDistance).toBeGreaterThan(fit.distance);
      expect(fit.far).toBeGreaterThan(fit.distance + radius);
    }
  });
});
