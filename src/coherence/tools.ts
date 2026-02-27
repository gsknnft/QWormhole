// import { wt } from '@gsknnft/qwave';
import { QuantumSignalSuite} from '@sigilnet/qfield';
import {
  FFT
} from "@sigilnet/qtransform";

// import { superformulaRadius, SuperformulaParams, PolarPoint, extractGeometricSignature } from './superformula.js';




// export // Combine 1D spectral + 2D geometric
// function analyzeSystemCoherence(system: SystemState) {
//   // 1D: Model behavior telemetry
//   const spectralNegentropy = computeNegentropy(system.telemetry);

//   // 2D: Token holder distributions
//   const geometricSignature = extractGeometricSignature(system.holders);

//   // Combined coherence
//   const totalCoherence =
//     0.6 * spectralNegentropy +
//     0.4 * geometricSignature.symmetry;

//   return {
//     spectral: spectralNegentropy,
//     geometric: geometricSignature,
//     combined: totalCoherence,
//     regime: classifyRegime(totalCoherence)
//   };
// }


export function radialProfileFFT(histogram: number[]) {
  // ... DFT implementation
  const fft = new FFT(histogram);
  const spectrum = fft.createComplexArray();

  fft.realTransform(spectrum, histogram);

  const { runFullFieldAnalysis } = QuantumSignalSuite;
  const {entropy, hilbertData, imfs } = runFullFieldAnalysis(Float64Array.from(histogram));
  // const log = processAndLog({ spectralEntropy: entropy, hilbertData, imfs });
  // const dft = wt.dft(histogram);
  // for (let k = 1; k <= K; k += 1) {
  //   for (let n = 0; n < N; n += 1) {
  //     const a = (2 * Math.PI * k * n) / N;
  //     re += histogram[n] * Math.cos(a);
  //     im -= histogram[n] * Math.sin(a);
  //   }
  //   mags.push(Math.sqrt(re * re + im * im));
  // }
  return { spectrum, entropy, hilbertData, imfs };
}
// // Visualize current system regime as superellipse
// export function RegimeShape({ negentropy }: { negentropy: number }) {
//   // Map negentropy to superformula params
//   const params = {
//     m: negentropy > 3 ? 4 : negentropy > 1.5 ? 7 : 23,
//     n1: 2,
//     n2: clamp(negentropy, 0.5, 4),
//     n3: clamp(negentropy, 0.5, 4),
//     a: 1,
//     b: 1
//   };

//   // Render animated superellipse
//   return <SuperellipseCanvas params={params} />;
// }
