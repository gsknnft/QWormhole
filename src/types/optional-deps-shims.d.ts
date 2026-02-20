declare module "@tensorflow/tfjs" {
  const tf: any;
  export = tf;
}

declare module "@sigilnet/qfield" {
  export class QuantumSignalSuite {
    processAndLog(signal: number[]): Promise<{ signalAnalysis: any }>;
    static runFullFieldAnalysis(input: Float64Array): {
      imfs: any[];
      hilbertData: any;
      entropy: number;
    };
    static evaluateSignalVector(input: any): any;
  }
}

declare module "../../../../src/types/types" {
  export type SignalVector = any;
  export type QuantumFieldState = any;
}

declare module "@vitejs/plugin-react-swc" {
  const react: (...args: any[]) => any;
  export default react;
}
