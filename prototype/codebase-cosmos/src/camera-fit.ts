import type { Composition, RoleField } from "./compositions";

export interface CameraFit {
  readonly distance: number;
  readonly maxDistance: number;
  readonly far: number;
  readonly verticalHalfFov: number;
  readonly horizontalHalfFov: number;
}

function maxRadius(field: RoleField): number {
  if (field.visible === false) return 0;
  let maximum = 0;
  for (let offset = 0; offset < field.positions.length; offset += 3) {
    const halfDiagonal = field.scales
      ? Math.hypot(field.scales[offset]!, field.scales[offset + 1]!, field.scales[offset + 2]!) / 2
      : 0;
    maximum = Math.max(maximum, Math.hypot(field.positions[offset]!, field.positions[offset + 1]!, field.positions[offset + 2]!) + halfDiagonal);
  }
  return maximum;
}

export function compositionRadius(composition: Composition): number {
  return Math.max(...[...composition.fields, ...(composition.decorations ?? [])].map(maxRadius));
}

export function fitCamera(radius: number, verticalFovDegrees: number, aspect: number, margin = 1.15): CameraFit {
  const verticalHalfFov = verticalFovDegrees * Math.PI / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
  const distance = (radius * margin) / Math.sin(limitingHalfFov);
  return {
    distance,
    maxDistance: Math.max(distance * 2.25, distance + radius * 2.5),
    far: Math.max(180, distance + radius * 5),
    verticalHalfFov,
    horizontalHalfFov,
  };
}
