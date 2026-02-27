// packages/QWormhole/src/telemetry/chaos-detection.ts

// export function detectNetworkChaos(packetJitter: number[]) {
//   const polar = jitterToPolar(packetJitter);
//   const sig = extractGeometricSignature(polar, {
//     includeSuperformulaFit: true,
//   });

//   if (sig.fitError > 0.4) {
//     return {
//       status: "DEGRADED",
//       reason: "Packet jitter exhibits chaotic structure",
//       recommendation: "Switch to fallback transport",
//     };
//   }

//   return { status: "HEALTHY" };
// }
