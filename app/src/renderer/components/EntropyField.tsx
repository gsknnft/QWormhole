import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { SimulationMetrics } from '../types';
import { fromFixedPoint } from '../../shared/fixedPoint';

interface EntropyFieldProps {
  history: SimulationMetrics[];
}

export const EntropyField: React.FC<EntropyFieldProps> = ({ history }) => {
  // Take last 50 data points for better visualization
  const data = history.slice(-50).map((metrics) => ({
    time: metrics.time,
    negentropy: fromFixedPoint(metrics.negentropy),
    coherence: fromFixedPoint(metrics.coherence),
    velocity: fromFixedPoint(metrics.velocity),
  }));

  return (
    <div className="entropy-field">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis 
            dataKey="time" 
            stroke="#888" 
            label={{ value: 'Time Step', position: 'insideBottom', offset: -5 }}
          />
          <YAxis 
            stroke="#888"
            label={{ value: 'Value', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1a1a1a', 
              border: '1px solid #333',
              borderRadius: '4px'
            }}
            labelStyle={{ color: '#fff' }}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="negentropy" 
            stroke="#00ff88" 
            strokeWidth={2}
            dot={false}
            name="Negentropy"
          />
          <Line 
            type="monotone" 
            dataKey="coherence" 
            stroke="#4dabf7" 
            strokeWidth={2}
            dot={false}
            name="Coherence"
          />
          <Line 
            type="monotone" 
            dataKey="velocity" 
            stroke="#ff6b6b" 
            strokeWidth={2}
            dot={false}
            name="Velocity"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
