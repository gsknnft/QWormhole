import { FFT } from "@sigilnet/fft-legacy";

export interface Complex {
  real: number;
  imag: number;
  magnitude: number;
  phase: number;
}

/**
 * Simplified FFT implementation
 * In production, replace with optimized FFT library (FFTW, KissFFT, etc.)
 */
export function computeFFT(samples: Float64Array): Complex[] {
  const N = samples;
  const fft = new FFT(N);
  const out = fft.createComplexArray();
  const input = fft.toComplexArray(samples);

  fft.transform(out, input);

  const result: Complex[] = [];
  for (let i = 0; i < N.length; i++) {
    const re = out[2 * i];
    const im = out[2 * i + 1];
    result.push({
      real: re,
      imag: im,
      magnitude: Math.sqrt(re * re + im * im),
      phase: Math.atan2(im, re),
    });
  }

  return result;
}


export function computeFFTSpectrum(data: Float64Array): Float64Array {
  const fft = new FFT(data);
  const out = fft.createComplexArray();
  const storage = fft.createComplexArray();
  const input = fft.toComplexArray(data, storage);

  fft.transform(out, input);

  const spectrum = new Float64Array(data.length / 2);
  for (let i = 0; i < spectrum.length; i++) {
    const re = out[2 * i];
    const im = out[2 * i + 1];
    spectrum[i] = Math.sqrt(re * re + im * im);
  }

  return spectrum;
}
