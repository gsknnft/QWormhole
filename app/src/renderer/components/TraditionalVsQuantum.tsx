/**
 * ClassicalVsNegentropic.tsx
 *
 * Side-by-side visualization of classical information flow
 * vs adaptive negentropic coupling as defined in NCF.
 *
 * This is the “aha” visual: what traditional systems miss
 * when they don’t regulate flow by coherence and entropy metrics.
 */

import React, { useEffect, useRef } from 'react';
import { getSeverityColor, getSeverityTextColor } from './utils';
import { AnomalyDetection } from '../types';



interface LiqDataPoint {
  timestamp: number;
  price: number;
  volume: number;
}

interface TraditionalVsQuantumProps {
  data: LiqDataPoint[];
  signalData: {
    coherence: number[];
    entropy: number[];
    fieldState: string[];
  };
  anomalies: AnomalyDetection[];
}

export const TraditionalVsQuantum: React.FC<TraditionalVsQuantumProps> = ({
  data,
  signalData,
  anomalies
}) => {
  const traditionalCanvasRef = useRef<HTMLCanvasElement>(null);
  const quantumCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    drawTraditionalChart();
    drawQuantumChart();
  }, [data, signalData]);

  const drawTraditionalChart = () => {
    const canvas = traditionalCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (data.length === 0) return;

    // Draw typocal data flows (** note, this was for markets - we need to adapt for NCT **)
    const prices = data.map(d => d.price);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceRange = maxPrice - minPrice;

    const barWidth = canvas.width / data.length;

    for (let i = 0; i < data.length; i++) {
      const x = i * barWidth;
      const price = data[i].price;
      const normalizedPrice = ((price - minPrice) / priceRange);
      const y = canvas.height - (normalizedPrice * canvas.height * 0.8) - 40;

      // Simple bar chart style
      const barHeight = normalizedPrice * canvas.height * 0.8;
      
      // Color based on trend
      const trend = i > 0 ? data[i].price - data[i-1].price : 0;
      ctx.fillStyle = trend >= 0 ? '#00ff00' : '#ff0000';
      ctx.fillRect(x + 2, y, barWidth - 4, barHeight);

      // Draw volume at bottom
      const volumeHeight = (data[i].volume / Math.max(...data.map(d => d.volume))) * 30;
      ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
      ctx.fillRect(x + 2, canvas.height - volumeHeight, barWidth - 4, volumeHeight);
    }

    // Draw traditional indicators
    drawMovingAverage(ctx, data, canvas.width, canvas.height, minPrice, priceRange);
    
    // Highlight traditional anomalies
    const traditionalAnomalies = anomalies.filter(a => a.type === 'classical');
    for (const anomaly of traditionalAnomalies) {
      const index = data.findIndex(d => d.timestamp === anomaly.timestamp);
      if (index >= 0) {
        const x = index * barWidth + barWidth / 2;
        ctx.fillStyle = getSeverityColor(anomaly.severity);
        ctx.beginPath();
        ctx.arc(x, 20, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('TRADITIONAL ANALYSIS', 10, 30);
    ctx.font = '12px monospace';
    ctx.fillText(`Anomalies: ${traditionalAnomalies.length}`, 10, 50);
  };

  const drawQuantumChart = () => {
    const canvas = quantumCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear with quantum theme
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (signalData.coherence.length === 0) return;

    const width = canvas.width;
    const height = canvas.height;
    const dataLength = signalData.coherence.length;
    const barWidth = width / dataLength;

    // Draw coherence field
    ctx.fillStyle = 'rgba(0, 255, 65, 0.1)';
    ctx.fillRect(0, 0, width, height);

    // Draw coherence wave
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < dataLength; i++) {
      const x = i * barWidth;
      const coherence = signalData.coherence[i];
      const y = height - (coherence * height * 0.8) - 40;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw entropy wave (inverted)
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < dataLength; i++) {
      const x = i * barWidth;
      const entropy = signalData.entropy[i];
      const y = height - ((1 - entropy) * height * 0.8) - 40;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw field state indicators
    for (let i = 0; i < dataLength; i++) {
      const x = i * barWidth;
      const state = signalData.fieldState[i];
      
      if (state === 'coherent') {
        ctx.fillStyle = 'rgba(0, 255, 65, 0.3)';
        ctx.fillRect(x, 0, barWidth, height);
      } else if (state === 'chaos') {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fillRect(x, 0, barWidth, height);
      }
    }

    // Highlight quantum anomalies
    const quantumAnomalies = anomalies.filter(a => a.type === 'negentropic');
    for (const anomaly of quantumAnomalies) {
      const index = data.findIndex(d => d.timestamp === anomaly.timestamp);
      if (index >= 0) {
        const x = index * barWidth + barWidth / 2;
        
        // Draw pulsing quantum anomaly marker
        ctx.fillStyle = getSeverityColor(anomaly.severity);
        ctx.shadowBlur = 20;
        ctx.shadowColor = getSeverityColor(anomaly.severity);
        ctx.beginPath();
        ctx.arc(x, 20, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw resonance lines
        ctx.strokeStyle = getSeverityColor(anomaly.severity);
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x, 30);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Labels
    ctx.fillStyle = '#00ff41';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('QUANTUM SIGNAL ANALYSIS', 10, 30);
    ctx.font = '12px monospace';
    ctx.fillText(`Anomalies: ${quantumAnomalies.length}`, 10, 50);
    ctx.fillText(`Coherence`, 10, height - 50);
    ctx.fillStyle = '#ff00ff';
    ctx.fillText(`Entropy (inverted)`, 10, height - 30);
  };

  const drawMovingAverage = (
    ctx: CanvasRenderingContext2D,
    data: LiqDataPoint[],
    width: number,
    height: number,
    minPrice: number,
    priceRange: number
  ) => {
    const period = 7; // 7-period MA
    if (data.length < period) return;

    ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const barWidth = width / data.length;

    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.price, 0);
      const ma = sum / period;
      const normalizedMA = ((ma - minPrice) / priceRange);
      const y = height - (normalizedMA * height * 0.8) - 40;
      const x = i * barWidth;

      if (i === period - 1) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Traditional Analysis */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
        <canvas
          ref={traditionalCanvasRef}
          width={600}
          height={400}
          className="w-full rounded"
        />
        <div className="mt-4 space-y-2">
          <div className="text-sm text-gray-400">Traditional Technical Analysis</div>
          <div className="text-xs text-gray-500">
            • Price action and candlesticks
            <br />
            • Moving averages (MA)
            <br />
            • Volume analysis
            <br />
            • Chart patterns
          </div>
          {anomalies.filter(a => a.type === 'classical').slice(0, 3).map((anomaly, i) => (
            <div key={i} className="text-xs p-2 bg-gray-800 rounded">
              <span className={`font-bold ${getSeverityTextColor(anomaly.severity)}`}>
                {anomaly.severity.toUpperCase()}:
              </span>{' '}
              {anomaly.description}
            </div>
          ))}
        </div>
      </div>

      {/* Quantum Analysis */}
      <div className="bg-black border border-green-500 rounded-lg p-4">
        <canvas
          ref={quantumCanvasRef}
          width={600}
          height={400}
          className="w-full rounded"
        />
        <div className="mt-4 space-y-2">
          <div className="text-sm text-green-400">Quantum Signal Analysis</div>
          <div className="text-xs text-green-600">
            • Field coherence patterns
            <br />
            • Entropy analysis
            <br />
            • Phase lock detection
            <br />
            • Resonance anomalies
          </div>
          {anomalies.filter(a => a.type === 'negentropic').slice(0, 3).map((anomaly, i) => (
            <div key={i} className="text-xs p-2 bg-green-950 border border-green-800 rounded">
              <span className={`font-bold ${getSeverityTextColor(anomaly.severity)}`}>
                ⚡ {anomaly.severity.toUpperCase()}:
              </span>{' '}
              {anomaly.description}
            </div>
          ))}
        </div>
      </div>

      {/* Comparison Summary */}
      <div className="col-span-1 lg:col-span-2 bg-gray-900 border border-yellow-500 rounded-lg p-6">
        <h3 className="text-xl font-bold text-yellow-400 mb-4">
          🌟 QUANTUM ADVANTAGE
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(() => {
            // Extract calculations to avoid repeated filtering and division by zero
            const quantumAnomalies = anomalies.filter(a => a.type === 'negentropic').length;
            const traditionalAnomalies = anomalies.filter(a => a.type === 'classical').length;
            const coherenceLength = signalData.coherence.length;
            const highCoherence = coherenceLength > 0 
              ? Math.round((signalData.coherence.filter(c => c > 0.7).length / coherenceLength) * 100)
              : 0;
            const coherentStates = signalData.fieldState.filter(s => s === 'coherent').length;

            return (
              <>
                <div className="bg-gray-800 p-4 rounded">
                  <div className="text-2xl font-bold text-green-400">
                    {quantumAnomalies - traditionalAnomalies}
                  </div>
                  <div className="text-sm text-gray-400">More Anomalies Detected</div>
                </div>
                <div className="bg-gray-800 p-4 rounded">
                  <div className="text-2xl font-bold text-green-400">
                    {highCoherence}%
                  </div>
                  <div className="text-sm text-gray-400">Field Coherence</div>
                </div>
                <div className="bg-gray-800 p-4 rounded">
                  <div className="text-2xl font-bold text-green-400">
                    {coherentStates}
                  </div>
                  <div className="text-sm text-gray-400">Coherent States</div>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
