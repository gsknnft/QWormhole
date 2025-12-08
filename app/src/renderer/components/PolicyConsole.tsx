import React from 'react';
import { SimulationState } from '../types';
import { fromFixedPoint } from '../../shared/fixedPoint';

interface PolicyConsoleProps {
  state: SimulationState;
}

export const PolicyConsole: React.FC<PolicyConsoleProps> = ({ state }) => {
  const getPolicyStats = () => {
    const stats = {
      macro: 0,
      defensive: 0,
      balanced: 0,
    };

    state.edgeMetrics.forEach((metrics) => {
      stats[metrics.policy]++;
    });

    return stats;
  };

  const stats = getPolicyStats();
  const total = state.edges.length;

  return (
    <div className="policy-console">
      <div className="policy-stats">
        <div className="stat-item macro">
          <div className="stat-label">Macro</div>
          <div className="stat-value">{stats.macro}</div>
          <div className="stat-percentage">
            {total > 0 ? ((stats.macro / total) * 100).toFixed(0) : 0}%
          </div>
        </div>

        <div className="stat-item balanced">
          <div className="stat-label">Balanced</div>
          <div className="stat-value">{stats.balanced}</div>
          <div className="stat-percentage">
            {total > 0 ? ((stats.balanced / total) * 100).toFixed(0) : 0}%
          </div>
        </div>

        <div className="stat-item defensive">
          <div className="stat-label">Defensive</div>
          <div className="stat-value">{stats.defensive}</div>
          <div className="stat-percentage">
            {total > 0 ? ((stats.defensive / total) * 100).toFixed(0) : 0}%
          </div>
        </div>
      </div>

      <div className="edge-list">
        {state.edges.map((edge, idx) => {
          const key = `${edge.source}-${edge.target}`;
          const metrics = state.edgeMetrics.get(key);
          if (!metrics) return null;

          return (
            <div key={idx} className={`edge-item ${metrics.policy}`}>
              <span className="edge-label">
                [{edge.source} → {edge.target}]
              </span>
              <span className="edge-policy">{metrics.policy.toUpperCase()}</span>
              <span className="edge-metrics">
                N={fromFixedPoint(metrics.negentropy).toFixed(5)} C={fromFixedPoint(metrics.coherence).toFixed(5)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
