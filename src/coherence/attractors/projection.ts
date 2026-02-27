// @sigilnet/coherence/src/attractors/projection.ts

import type { PolarPoint } from "../superformula";

export interface SystemState {
  telemetry: number[];
  holders: PolarPoint[];
}

/**
 * Project 3D Aizawa attractor onto 2D plane and convert to polar
 */
export function projectToPolar(
  positions: Float64Array,
  projection: "xy" | "xz" | "yz" = "xy",
): PolarPoint[] {
  const points: PolarPoint[] = [];
  const n = positions.length / 3;

  for (let i = 0; i < n; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    let px: number, py: number;

    switch (projection) {
      case "xy":
        px = x;
        py = y;
        break;
      case "xz":
        px = x;
        py = z;
        break;
      case "yz":
        px = y;
        py = z;
        break;
    }

    const angle = Math.atan2(py, px);
    const radius = Math.sqrt(px * px + py * py);

    points.push({ angle, radius });
  }

  return points;
}
