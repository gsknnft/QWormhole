// @sigilnet/coherence/src/attractors/aizawa.ts

import { PolarPoint } from "../superformula";

export interface AizawaPoint3D {
  x: number;
  y: number;
  z: number;
}



export const DEFAULT_PARAMS = {
  a: 0.95,
  b: 0.7,
  c: 0.6,
  d: 3.5,
  e: 0.25,
  f: 0.1,
};
export function generateRandomPoints(
  count: number,
  rng: () => number = Math.random,
): PolarPoint[] {
  const points: PolarPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      angle: rng() * 2 * Math.PI,
      radius: rng(),
    });
  }
  return points;
}

export function generateAizawaAttractor(
  x0: number,
  y0: number,
  z0: number,
): PolarPoint[] {
    const a = 0.95;
    const b = 0.7;
    const c = 0.6;
    const d = 3.5;
    const e = 0.25;
    const f = 0.1;
    const dt = 0.01;
    const steps = 10000;
  const trajectory = [];
  let x = x0,
    y = y0,
    z = z0;
  for (let i = 0; i < steps; i++) {
    const dx = (z - b) * x - d * y;
    const dy = d * x + (z - b) * y;
    const dz = c + a * z - (z ** 3) / 3 - (x ** 2 + y ** 2) * (1 + e * z) + f * z * (x ** 3);
    x += dx * dt;
    y += dy * dt;
    z += dz * dt;
    trajectory.push([x, y, z]);
  }
  // Convert trajectory to PolarPoint[]
  return trajectory.map(([x, y, _]) => {
    const angle = Math.atan2(y, x);
    const radius = Math.sqrt(x * x + y * y);
    return { angle, radius };
  });
}

export function computeAizawa({
  params = DEFAULT_PARAMS,
  initialPoint = { x: 0.1, y: 0, z: 0 },
  steps = 50000,
  dt = 0.01,
}: {
  params?: Partial<typeof DEFAULT_PARAMS>;
  initialPoint?: AizawaPoint3D;
  steps?: number;
  dt?: number;
}): Float64Array {
  const p = { ...DEFAULT_PARAMS, ...params };
  const { a, b, c, d, e, f } = p;

  let x = initialPoint.x;
  let y = initialPoint.y;
  let z = initialPoint.z;

  const positions = new Float64Array(steps * 3);

  for (let i = 0; i < steps; i++) {
    // Standard Aizawa attractor ODEs
    const dx = (z - b) * x - d * y;
    const dy = d * x + (z - b) * y;
    const dz =
      c + a * z - z ** 3 / 3 - (x ** 2 + y ** 2) * (1 + e * z) + f * z * x ** 3;

    x += dx * dt;
    y += dy * dt;
    z += dz * dt;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  return positions;
}
