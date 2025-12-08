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
// import { EntropyField } from './EntropyField';
// import { NegentropyGauge } from './NegentropyGauge';
// import { CouplingMap } from './CouplingMap';

interface DataPoint {
  timestamp: number;
  throughput: number;
  entropy: number;
}


interface ClassicalVsNegentropicProps {
  data: DataPoint[];
  signalData: {
    coherence: number[];
    negentropy: number[];
    fieldState: string[];
  };
  anomalies: AnomalyDetection[];
}

export const ClassicalVsNegentropic: React.FC<ClassicalVsNegentropicProps> = ({
  data,
  signalData,
  anomalies
}) => {
  const classicalCanvasRef = useRef<HTMLCanvasElement>(null);
  const negentropicCanvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    drawClassicalChart();
    drawNegentropicChart();
  }, [data, signalData]);
  const drawClassicalChart = () => {
    const canvas = classicalCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (data.length === 0) return;

    // Draw typical data flows
    // Draw axis
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 0);
    ctx.lineTo(40, canvas.height);
    ctx.moveTo(0, canvas.height - 40);
    ctx.lineTo(canvas.width, canvas.height - 40);
    ctx.stroke();
    ctx.font = '10px monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Throughput', 45, 15);
    ctx.save();
    ctx.translate(10, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Time', 0, 0);
    ctx.restore();
    const throughputs = data.map(d => d.throughput);
    const maxThroughput = Math.max(...throughputs);
    const minThroughput = Math.min(...throughputs);
    const throughputRange = maxThroughput - minThroughput;

    const barWidth = canvas.width / data.length;

    for (let i = 0; i < data.length; i++) {
      const x = i * barWidth;
      const throughput = data[i].throughput;
      const normalizedThroughput = ((throughput - minThroughput) / throughputRange);
      const y = canvas.height - (normalizedThroughput * canvas.height * 0.8) - 40;

      // Simple bar chart style
      const barHeight = normalizedThroughput * canvas.height * 0.8;
      
      // Color based on trend
      const trend = i > 0 ? data[i].throughput - data[i-1].throughput : 0;
      ctx.fillStyle = trend >= 0 ? '#00ff00' : '#ff0000';
      ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
    }

    // Draw classical indicators
    drawMovingAverage(ctx, data, canvas.width, canvas.height, minThroughput, throughputRange);
    
    // Highlight classical anomalies
    const classicalAnomalies = anomalies.filter(a => a.type === 'classical');
    for (const anomaly of classicalAnomalies) {
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
    ctx.fillText('CLASSICAL INFORMATION FLOW', 10, 30);
    ctx.font = '12px monospace';
    ctx.fillText(`Anomalies: ${classicalAnomalies.length}`, 10, 50);
  };

  const drawNegentropicChart = () => {
    const canvas = negentropicCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear with negentropic theme
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (signalData.coherence.length === 0) return;

    const width = canvas.width;
    const height = canvas.height;
    const dataLength = signalData.coherence.length;
    const barWidth = width / dataLength;


    // Draw axis
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 0);
    ctx.lineTo(40, height);
    ctx.moveTo(0, height - 40);
    ctx.lineTo(width, height - 40);
    ctx.stroke();

    // Draw coherence wave
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < dataLength; i++) {
      const x = 40 + i * ((width - 40) / dataLength);
      const coherence = signalData.coherence[i];
      const y = height - 40 - (coherence * (height - 80));
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw negentropy wave
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < dataLength; i++) {
      const x = 40 + i * ((width - 40) / dataLength);
      const negentropy = signalData.negentropy[i];
      const y = height - 40 - (negentropy * (height - 80));
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Add legend
    ctx.font = '12px monospace';
    ctx.fillStyle = '#00ff41';
    ctx.fillText('Coherence', width - 120, 30);
    ctx.fillStyle = '#ff00ff';
    ctx.fillText('Negentropy', width - 120, 50);

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

    // Highlight negentropic anomalies
    const negentropicAnomalies = anomalies.filter(a => a.type === 'negentropic');
    for (const anomaly of negentropicAnomalies) {
      const index = data.findIndex(d => d.timestamp === anomaly.timestamp);
      if (index >= 0) {
        const x = index * barWidth + barWidth / 2;
        
        // Draw pulsing negentropic anomaly marker
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
    ctx.fillText('NEGENTROPIC COUPLING FLOW', 10, 30);
    ctx.font = '12px monospace';
    ctx.fillText(`Anomalies: ${negentropicAnomalies.length}`, 10, 50);
    ctx.fillText(`Coherence`, 10, height - 50);
    ctx.fillStyle = '#ff00ff';
    ctx.fillText(`Negentropy`, 10, height - 30);
  }   ;

  const drawMovingAverage = (
    ctx: CanvasRenderingContext2D,
    data: DataPoint[],
    width: number,
    height: number,
    minThroughput: number,
    throughputRange: number
  ) => {
    const period = 7; // 7-period MA
    if (data.length < period) return;

    ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const barWidth = width / data.length;

    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.throughput, 0);
      const ma = sum / period;
      const normalizedMA = ((ma - minThroughput) / throughputRange);
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
      {/* Classical Information Flow */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
        <canvas 
          ref={classicalCanvasRef}
          width={600}
          height={400}
          className="w-full rounded"
        />
        <div className="mt-4 space-y-2">
          <div className="text-sm text-gray-400">Classical Information Flow Analysis</div>
          <div className="text-xs text-gray-500">
            • Throughput monitoring
            <br />
            • Moving averages (MA)
            <br />
            • Trend analysis
            <br />
            • Anomaly detection
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
      {/* Negentropic Coupling Flow */}
      <div className="bg-black border border-green-500 rounded-lg p-4">
        <canvas

          ref={negentropicCanvasRef}
          width={600}
          height={400}
          className="w-full rounded"
        />
        <div className="mt-4 space-y-2">
          <div className="text-sm text-green-400">Negentropic Coupling Flow Analysis</div>
          <div className="text-xs text-green-600">
            • Field coherence patterns
            <br />
            • Negentropy analysis
            <br />
            • Phase lock detection
            <br />
            • Resonance anomalies
          </div>
          {anomalies.filter(a => a.type === 'negentropic').slice(0, 3).map((anomaly, i) => (
            <div key={i} className="text-xs p-2 bg-green-950 border border-green-800 rounded">
              <span className={`font-bold ${getSeverityTextColor(anomaly.severity)}`}>
                {anomaly.severity.toUpperCase()}:
              </span>{' '}
              {anomaly.description}
            </div>
          ))}

          {/* <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EntropyField history={simulationHistory} />
            <NegentropyGauge metrics={currentMetrics} />
            <CouplingMap state={currentState} />
          </div> */}
        </div>
      </div>
    </div>
  );

}
  