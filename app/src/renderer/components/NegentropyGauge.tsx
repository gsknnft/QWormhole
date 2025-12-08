import React from 'react';
import { SimulationMetrics } from '../types';
import { fromFixedPoint } from '../../shared/fixedPoint';


interface NegentropyGaugeProps {
  metrics: SimulationMetrics;
}

export const NegentropyGauge: React.FC<NegentropyGaugeProps> = ({ metrics }) => {
  const negentropy = fromFixedPoint(metrics.negentropy);
  const coherence = fromFixedPoint(metrics.coherence);
  const velocity = fromFixedPoint(metrics.velocity);
  const radius = 50;
  const center = { x: 60, y: 60 };

  const getColorForValue = (value: number): string => {
    if (value > 0.8) return '#00ff88'; // High - green
    if (value > 0.5) return '#ffaa00'; // Medium - orange
    return '#ff4444'; // Low - red
  };

  const polarToCartesian = (cx: number, cy: number, r: number, angleRad: number) => ({
    x: cx + r * Math.cos(angleRad),
    y: cy - r * Math.sin(angleRad),
  });

  const describeArc = (value: number): string => {
    const clamped = Math.max(0, Math.min(1, value));
    const startAngle = Math.PI;
    const endAngle = Math.PI * (1 - clamped);
    const start = polarToCartesian(center.x, center.y, radius, startAngle);
    const end = polarToCartesian(center.x, center.y, radius, endAngle);
    const largeArc = clamped > 0.5 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  const formatValue = (value: number): string => {
    return value.toFixed(5);
  };

  return (
    <div className="negentropy-gauge">
      <div className="gauge-item">
        <div className="gauge-label">Negentropy (N)</div>
        <div className="gauge-bar-container">
          <div 
            className="gauge-bar" 
            style={{ 
              width: `${negentropy * 100}%`,
              backgroundColor: getColorForValue(negentropy)
            }}
          />
        </div>
        <div className="gauge-value">{formatValue(negentropy)}</div>
        <div className="gauge-description">
          {negentropy > 0.8 ? 'High Order (Macro)' : 
           negentropy < 0.3 ? 'Low Order (Defensive)' : 
           'Balanced State'}
        </div>
      </div>

      <div className="gauge-item">
        <div className="gauge-label">Coherence (C)</div>
        <div className="gauge-bar-container">
          <div 
            className="gauge-bar" 
            style={{ 
              width: `${coherence * 100}%`,
              backgroundColor: getColorForValue(coherence)
            }}
          />
        </div>
        <div className="gauge-value">{formatValue(coherence)}</div>
        <div className="gauge-description">Bidirectional Alignment</div>
      </div>
      <svg width={120} height={120}>
        <circle cx={60} cy={60} r={50} fill="#222" stroke="#444" strokeWidth={4} />
        {/* Arc for gauge background */}
        <path d={describeArc(1)} fill="none" stroke="#555" strokeWidth={8} strokeLinecap="round" />
        <path d={describeArc(negentropy)} fill="none" stroke={getColorForValue(negentropy)} strokeWidth={6} strokeLinecap="round" />
        {/* Needle */}
        <line
          x1={60}
          y1={60}
          x2={60 + 45 * Math.cos(Math.PI * (1 - negentropy))}
          y2={60 - 45 * Math.sin(Math.PI * (1 - negentropy))}
          stroke={getColorForValue(negentropy)}
          strokeWidth={4}
        />
        {/* Center dot */}
        <circle cx={60} cy={60} r={6} fill="#fff" />
      </svg>
      <div className="gauge-item">
        <div className="gauge-label">Entropy Velocity (v)</div>
        <div className="gauge-bar-container velocity">
          <div className="gauge-center-line" />
          <div 
            className="gauge-bar velocity-bar" 
            style={{ 
              width: `${Math.abs(velocity) * 100}%`,
              left: velocity < 0 ? `${50 - Math.abs(velocity) * 50}%` : '50%',
              backgroundColor: velocity > 0 ? '#ff6b6b' : '#4dabf7'
            }}
          />
        </div>
        <div className="gauge-value">{velocity > 0 ? '+' : ''}{formatValue(velocity)}</div>
        <div className="gauge-description">
          {velocity > 0 ? 'Increasing Entropy' : 
           velocity < 0 ? 'Decreasing Entropy' : 
           'Stable'}
        </div>
      </div>
    </div>
  );
};
