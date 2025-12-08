/**
 * SignalScope - Real-time FFT and Coherence Visualizer
 * 
 * Shows the quantum signal analysis that reveals what traditional charts miss
 */

import React, { useEffect, useRef, useState } from 'react';
import type { SignalFrame } from 'shared';

interface SignalScopeProps {
  data: SignalFrame;
  height?: number;
  showPhase?: boolean;
  showHarmonics?: boolean;
}

export const SignalScope: React.FC<SignalScopeProps> = ({ 
  data, 
  height = 300,
  showPhase = true,
  showHarmonics = true 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animationFrame, setAnimationFrame] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw frequency spectrum
    drawSpectrum(ctx, data, canvas.width, canvas.height);

    // Draw phase overlay if enabled
    if (showPhase) {
      drawPhaseOverlay(ctx, data, canvas.width, canvas.height);
    }

    // Animate
    const anim = requestAnimationFrame(() => setAnimationFrame(f => f + 1));
    return () => cancelAnimationFrame(anim);
  }, [data, showPhase, animationFrame]);

  const getCoherenceColor = (coherence: number): string => {
    if (coherence > 0.8) return '#00ff41'; // Matrix green
    if (coherence > 0.6) return '#00ff88';
    if (coherence > 0.4) return '#ffaa00';
    return '#ff4444';
  };

  const getEntropyColor = (entropy: number): string => {
    if (entropy < 0.3) return '#00ff41';
    if (entropy < 0.5) return '#00ff88';
    if (entropy < 0.7) return '#ffaa00';
    return '#ff4444';
  };

  return (
    <div className="signal-scope bg-black border border-green-500 rounded-lg p-4 font-mono">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-green-400 text-xl font-bold">QUANTUM SIGNAL ANALYZER</h2>
        <div className="flex gap-4">
          <div className="text-right">
            <div className="text-gray-500 text-xs">COHERENCE</div>
            <div 
              className="text-2xl font-bold"
              style={{ color: getCoherenceColor(data.coherence) }}
            >
              {(data.coherence * 100).toFixed(1)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-gray-500 text-xs">ENTROPY</div>
            <div 
              className="text-2xl font-bold"
              style={{ color: getEntropyColor(data.entropy) }}
            >
              {(data.entropy * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      <canvas 
        ref={canvasRef}
        width={800}
        height={height}
        className="w-full border border-green-900 rounded"
      />

      <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
        <div>
          <span className="text-gray-500">Phase:</span>
          <span className="text-green-400 ml-2">{data.phase.toFixed(3)} rad</span>
        </div>
        <div>
          <span className="text-gray-500">Dominant Hz:</span>
          <span className="text-green-400 ml-2">{data.dominantHz.toFixed(2)} Hz</span>
        </div>
        <div>
          <span className="text-gray-500">Harmonics:</span>
          <span className="text-green-400 ml-2">{data.harmonics.length}</span>
        </div>
      </div>

      {showHarmonics && data.harmonics.length > 0 && (
        <div className="mt-4 pt-4 border-t border-green-900">
          <div className="text-gray-500 text-xs mb-2">HARMONIC ANALYSIS</div>
          <div className="flex gap-2">
            {data.harmonics.map((h, i) => (
              <div 
                key={i}
                className="flex-1 bg-green-900 rounded overflow-hidden"
                style={{ height: '40px' }}
              >
                <div 
                  className="bg-green-400 h-full transition-all duration-300"
                  style={{ 
                    width: `${Math.min(100, h * 100)}%`,
                    opacity: 0.7 + (h * 0.3)
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function drawSpectrum(
  ctx: CanvasRenderingContext2D, 
  data: SignalFrame, 
  width: number, 
  height: number
): void {
  const magnitude = data.magnitude;
  if (!magnitude || magnitude.length === 0) return;

  // Sample magnitude data to ensure bars are visible (max 100 bars)
  const maxBars = 100;
  const sampledMagnitude: number[] = [];
  const sampleStep = Math.max(1, Math.floor(magnitude.length / maxBars));
  
  for (let i = 0; i < magnitude.length; i += sampleStep) {
    sampledMagnitude.push(magnitude[i]);
  }

  const barWidth = width / sampledMagnitude.length;
  const maxMagnitude = Math.max(...magnitude, 1);

  // Draw spectrum bars
  for (let i = 0; i < sampledMagnitude.length; i++) {
    const normalized = sampledMagnitude[i] / maxMagnitude;
    const barHeight = normalized * height * 0.8;

    // Gradient based on magnitude
    const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
    gradient.addColorStop(0, '#00ff41');
    gradient.addColorStop(0.5, '#00aa33');
    gradient.addColorStop(1, '#005522');

    ctx.fillStyle = gradient;
    ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);

    // Highlight dominant frequency
    const originalIndex = i * sampleStep;
    if (Math.abs(data.dominantHz - (originalIndex * 10)) < 5) {
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
    }
  }

  // Draw coherence indicator line
  ctx.strokeStyle = data.coherence > 0.7 ? '#00ff41' : '#ff4444';
  ctx.lineWidth = 2;
  const coherenceLine = height * (1 - data.coherence);
  ctx.beginPath();
  ctx.moveTo(0, coherenceLine);
  ctx.lineTo(width, coherenceLine);
  ctx.stroke();

  // Label
  ctx.fillStyle = '#00ff41';
  ctx.font = '12px monospace';
  ctx.fillText(`Coherence Threshold`, 10, coherenceLine - 5);
}

function drawPhaseOverlay(
  ctx: CanvasRenderingContext2D,
  data: SignalFrame,
  width: number,
  height: number
): void {
  // Draw phase wave
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();

  const points = 100;
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * width;
    const t = i / points;
    const y = height / 2 + Math.sin(data.phase + t * Math.PI * 4) * (height * 0.2);
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Phase lock indicator
  const phaseLock = data.coherence * (1 - data.entropy);
  if (phaseLock > 0.7) {
    ctx.fillStyle = 'rgba(0, 255, 65, 0.2)';
    ctx.fillRect(0, 0, width, 30);
    ctx.fillStyle = '#00ff41';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('⚡ PHASE LOCK DETECTED', width / 2 - 100, 20);
  }
}
