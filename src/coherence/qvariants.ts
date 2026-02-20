import { QuantumSignalSuite } from "@sigilnet/qfield";

type SignalVector = Record<string, unknown>;
type QuantumFieldState = Record<string, unknown>;

    export async function processAndLogSignal(signal: number[]): Promise<SignalVector> {
      const qss = new QuantumSignalSuite();
      const {signalAnalysis: vec} = await qss.processAndLog(signal);
      return vec as SignalVector;
    }
    export async function sigAnalysis(signal: number[]): Promise<{ signalAnalysis: SignalVector, qfield: QuantumFieldState, imfs: any, hilbertData: any, entropy: number }> {
      const {imfs, hilbertData, entropy} =  QuantumSignalSuite.runFullFieldAnalysis(Float64Array.from(signal));
      const suite = new QuantumSignalSuite();
      const {signalAnalysis} = await suite.processAndLog(signal);
      const qfield = QuantumSignalSuite.evaluateSignalVector(imfs[0]) as QuantumFieldState;
      return {signalAnalysis: signalAnalysis as SignalVector, qfield, imfs, hilbertData, entropy};
    }
