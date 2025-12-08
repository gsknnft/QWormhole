/**
 * Quantum Diagnostics Panel
 * 
 * Displays system health, performance metrics, and decision history
 */

import { useState, useEffect } from 'react';

interface HealthStatus {
  healthy: boolean;
  checks: {
    quantumAdapter: boolean;
    apiServer: boolean;
    memory: boolean;
    cpu: boolean;
    errorRate: boolean;
  };
  metrics: {
    memoryUsage: number;
    memoryLimit: number;
    errorCount: number;
    avgResponseTime: number;
  };
  timestamp: string;
}

interface DecisionStats {
  totalDecisions: number;
  executedCount: number;
  rejectedCount: number;
  averageConfidence: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  recentDecisions: number;
}

export function QuantumDiagnostics() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [stats, setStats] = useState<DecisionStats | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [errors, setErrors] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refreshData = async () => {
    if (!window.quantum) return;

    try {
      const [healthData, statsData, metricsData, errorsData] = await Promise.all([
        window.quantum.getHealth(),
        window.quantum.getHistoryStats(),
        window.quantum.getMetrics(),
        window.quantum.getErrors(),
      ]);

      setHealth(healthData);
      setStats(statsData);
      setMetrics(metricsData);
      setErrors(errorsData);
    } catch (error) {
      console.error('Failed to fetch diagnostics:', error);
    }
  };

  const exportHistory = async () => {
    try {
      const history = await window.quantum.exportHistory(100);
      const blob = new Blob([history], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quantum-history-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export history:', error);
    }
  };

  const clearHistory = async () => {
    if (window.confirm('Are you sure you want to clear the decision history?')) {
      try {
        await window.quantum.clearHistory();
        await refreshData();
      } catch (error) {
        console.error('Failed to clear history:', error);
      }
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Quantum Diagnostics</h2>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4"
            />
            Auto Refresh
          </label>
          <button
            onClick={refreshData}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* System Health */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-green-400 mb-4">System Health</h3>
        {health ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full ${health.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-white font-bold">
                {health.healthy ? 'System Healthy' : 'System Issues Detected'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              {Object.entries(health.checks).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                  <span className={value ? 'text-green-400' : 'text-red-400'}>
                    {value ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-gray-700 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Memory Usage:</span>
                <span className="text-white">
                  {health.metrics.memoryUsage.toFixed(1)} / {health.metrics.memoryLimit} MB
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Recent Errors:</span>
                <span className="text-white">{health.metrics.errorCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Avg Response Time:</span>
                <span className="text-white">{health.metrics.avgResponseTime.toFixed(2)} ms</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-gray-400">Loading...</div>
        )}
      </div>

      {/* Decision Statistics */}
      <div className="bg-gray-900 border border-purple-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-purple-400 mb-4">Decision Statistics</h3>
        {stats ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Decisions:</span>
              <span className="text-white font-bold">{stats.totalDecisions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Executed:</span>
              <span className="text-green-400 font-bold">{stats.executedCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Rejected:</span>
              <span className="text-red-400 font-bold">{stats.rejectedCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Recent (5min):</span>
              <span className="text-white font-bold">{stats.recentDecisions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Avg Confidence:</span>
              <span className="text-white font-bold">
                {(stats.averageConfidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">High Confidence:</span>
              <span className="text-green-400 font-bold">{stats.highConfidenceCount}</span>
            </div>

            <div className="col-span-2 pt-4 border-t border-gray-700 flex gap-2">
              <button
                onClick={exportHistory}
                className="px-4 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
              >
                Export History
              </button>
              <button
                onClick={clearHistory}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
              >
                Clear History
              </button>
            </div>
          </div>
        ) : (
          <div className="text-gray-400">Loading...</div>
        )}
      </div>

      {/* Performance Metrics */}
      {metrics && (
        <div className="bg-gray-900 border border-blue-700 rounded-lg p-6">
          <h3 className="text-xl font-bold text-blue-400 mb-4">Performance Metrics</h3>
          <div className="space-y-3">
            {Object.entries(metrics).map(([operation, stats]: [string, any]) => (
              <div key={operation} className="border-b border-gray-700 pb-3">
                <div className="font-bold text-white mb-2">{operation}</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-gray-400">Avg:</span>
                    <span className="text-white ml-2">{stats.average.toFixed(2)}ms</span>
                  </div>
                  <div>
                    <span className="text-gray-400">P95:</span>
                    <span className="text-white ml-2">{stats.p95.toFixed(2)}ms</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Count:</span>
                    <span className="text-white ml-2">{stats.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Summary */}
      {errors && errors.total > 0 && (
        <div className="bg-gray-900 border border-red-700 rounded-lg p-6">
          <h3 className="text-xl font-bold text-red-400 mb-4">Error Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Errors:</span>
              <span className="text-red-400 font-bold">{errors.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Recent (5min):</span>
              <span className="text-red-400 font-bold">{errors.recentCount}</span>
            </div>
            {Object.entries(errors.byOperation).map(([op, count]: [string, any]) => (
              <div key={op} className="flex justify-between">
                <span className="text-gray-400">{op}:</span>
                <span className="text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
