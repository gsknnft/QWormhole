import { cosineSimilarity } from "./invariants";

export function metaObserver(prev: { metaEigen: { eigenvectors: number[][]; }; }, current: { metaEigen: { eigenvectors: number[][]; varianceExplained: any[]; }; }) {
  const eigDrift = cosineSimilarity(
    prev.metaEigen.eigenvectors[0],
    current.metaEigen.eigenvectors[0]
  );
  const entropy = -current.metaEigen.varianceExplained
    .map((p: number) => p * Math.log(p + 1e-12))
    .reduce((a: any, b: any) => a + b, 0);
  return { eigDrift, entropy };
}