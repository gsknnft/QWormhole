import React, { useEffect, useRef } from 'react';
import { SimulationState } from '../types';
import { fromFixedPoint } from '../../shared/fixedPoint';

interface SignalScopePanelProps {
  state: SimulationState;
}

export const SignalScopePanel: React.FC<SignalScopePanelProps> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = state.history.slice(-100);
  const regime = state.meshMetrics.regime;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth || 600;
    const height = 220;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0b0c0f';
    ctx.fillRect(0, 0, width, height);

    const negVals = history.map(h => fromFixedPoint(h.negentropy));
    const cohVals = history.map(h => fromFixedPoint(h.coherence));
    const velVals = history.map(h => fromFixedPoint(h.velocity));
    const maxNeg = Math.max(0.001, ...negVals.map(v => Math.abs(v)));
    const maxCoh = Math.max(0.001, ...cohVals.map(v => Math.abs(v)));
    const maxVel = Math.max(0.001, ...velVals.map(v => Math.abs(v)));

    const barCount = Math.max(1, negVals.length);
    const barWidth = width / barCount;

    // Draw negentropy bars
    for (let i = 0; i < barCount; i++) {
      const neg = negVals[i] ?? 0;
      const h = (neg / maxNeg) * (height * 0.5);
      ctx.fillStyle = '#00ff88';
      ctx.fillRect(i * barWidth, height - h, barWidth * 0.6, h);
    }

    // Coherence line
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    cohVals.forEach((v, i) => {
      const x = i * barWidth + barWidth / 2;
      const y = height - (v / maxCoh) * (height * 0.45) - height * 0.05;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Velocity line
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    velVals.forEach((v, i) => {
      const x = i * barWidth + barWidth / 2;
      const y = height / 2 - (v / maxVel) * (height * 0.25);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [history]);

  return (
    <div className="signal-scope-panel">
      <div className="signal-header">
        <div>
          <div className="label">Regime</div>
          <div className="value">{regime ? regime.toUpperCase() : '—'}</div>
        </div>
        <div>
          <div className="label">Negentropy</div>
          <div className="value">{fromFixedPoint(state.meshMetrics.negentropy).toFixed(5)}</div>
        </div>
        <div>
          <div className="label">Coherence</div>
          <div className="value">{fromFixedPoint(state.meshMetrics.coherence).toFixed(5)}</div>
        </div>
        {state.meshMetrics.entropyVelocity && (
          <div>
            <div className="label">Entropy v</div>
            <div className="value">{fromFixedPoint(state.meshMetrics.entropyVelocity).toFixed(6)}</div>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="signal-canvas" />
      <div className="legend">
        <span className="dot neg" /> Negentropy
        <span className="dot coh" /> Coherence
        <span className="dot vel" /> Velocity
      </div>
    </div>
  );
};
