import React from 'react';
import { SimulationState } from '../types';
import { fromFixedPoint } from '../../shared/fixedPoint';

interface SimulationDiagnosticsProps {
  state: SimulationState;
  chaosIntensity: number;
  entropyAdapterMode: 'builtin_fft' | 'wavelet' | 'psqs' | 'qwave';
}

export const SimulationDiagnostics: React.FC<SimulationDiagnosticsProps> = ({
  state,
  chaosIntensity,
  entropyAdapterMode,
}) => {
  const mesh = state.meshMetrics;
  const negentropy = fromFixedPoint(mesh.negentropy);
  const coherence = fromFixedPoint(mesh.coherence);
  const velocity = fromFixedPoint(mesh.velocity);
  const throughput = mesh.throughput ? fromFixedPoint(mesh.throughput) : null;
  const loss = mesh.loss ? fromFixedPoint(mesh.loss) : null;
  const regime = mesh.regime;
  const entropyVelocity = mesh.entropyVelocity ? fromFixedPoint(mesh.entropyVelocity) : null;

  const format = (v: number | null, digits = 5) =>
    v === null || Number.isNaN(v) ? '—' : v.toFixed(digits);

  return (
    <div className="simulation-diagnostics">
      <div className="diag-row">
        <span className="pill">Chaos: {chaosIntensity.toFixed(2)}</span>
        <span className="pill">
          Spectrum:{' '}
          {entropyAdapterMode === 'wavelet'
            ? 'Wavelet'
            : entropyAdapterMode === 'psqs'
              ? 'PSQS'
              : entropyAdapterMode === 'qwave'
                ? 'QWave'
                : 'FFT'}
        </span>
        <span className="pill">Nodes: {state.nodes}</span>
        <span className="pill">Edges: {state.edges.length}</span>
        <span className="pill">Time: {state.time}</span>
      </div>
      <div className="diag-grid">
        <div className="diag-item">
          <div className="diag-label">Negentropy</div>
          <div className="diag-value">{format(negentropy)}</div>
        </div>
        <div className="diag-item">
          <div className="diag-label">Coherence</div>
          <div className="diag-value">{format(coherence)}</div>
        </div>
        <div className="diag-item">
          <div className="diag-label">Velocity</div>
          <div className="diag-value">{format(velocity, 6)}</div>
        </div>
        <div className="diag-item">
          <div className="diag-label">Throughput</div>
          <div className="diag-value">{format(throughput)}</div>
        </div>
        <div className="diag-item">
          <div className="diag-label">Loss</div>
          <div className="diag-value">{format(loss)}</div>
        </div>
        <div className="diag-item">
          <div className="diag-label">Regime</div>
          <div className="diag-value">{regime ? regime.toUpperCase() : '—'}</div>
        </div>
        <div className="diag-item">
          <div className="diag-label">Entropy v</div>
          <div className="diag-value">{format(entropyVelocity, 6)}</div>
        </div>
      </div>
    </div>
  );
};
