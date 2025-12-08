/**
 * Field Metrics Panel - Electron Dashboard Component
 * 
 * Visualizes real-time field metrics from WireGuard/FPGA telemetry:
 * - Negentropic Index (N) over time
 * - Entropy vs Coherence scatter plot
 * - Field coherence trend
 * - Peer field states
 */

import React, { useState, useEffect, useRef } from 'react';

/**
 * Field metrics data structure
 */
interface FieldMetrics {
  timestamp: number;
  entropy: number;
  coherence: number;
  negentropicIndex: number;
  peerId?: string;
  sigilHash?: string;
}

/**
 * Peer field state
 */
interface PeerFieldState {
  peerId: string;
  name: string;
  fieldMetrics: FieldMetrics;
  status: 'online' | 'offline' | 'degraded';
}

/**
 * Field Metrics Panel Props
 */
interface FieldMetricsPanelProps {
  /** Current device field metrics */
  deviceMetrics?: FieldMetrics;
  
  /** Peer field states */
  peers?: PeerFieldState[];
  
  /** Historical metrics (last N samples) */
  history?: FieldMetrics[];
  
  /** Update interval in ms */
  updateInterval?: number;
  
  /** Show advanced metrics */
  showAdvanced?: boolean;
}

/**
 * Format number with fixed decimals
 */
const fmt = (n: number, decimals = 3): string => n.toFixed(decimals);

/**
 * Get color based on negentropic index
 */
const getNColor = (N: number): string => {
  if (N < 0.5) return '#ef4444'; // Red: low coherence
  if (N < 1.0) return '#f59e0b'; // Orange: medium
  if (N < 2.0) return '#10b981'; // Green: good
  return '#3b82f6'; // Blue: excellent
};

/**
 * Get coherence trend indicator
 */
const getTrendIndicator = (history: FieldMetrics[]): string => {
  if (history.length < 2) return '→';
  
  const recent = history.slice(-10);
  const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));
  
  const firstAvg = firstHalf.reduce((sum, m) => sum + m.coherence, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, m) => sum + m.coherence, 0) / secondHalf.length;
  
  const diff = secondAvg - firstAvg;
  
  if (diff > 0.05) return '↗';
  if (diff < -0.05) return '↘';
  return '→';
};

/**
 * Field Metrics Panel Component
 */
export const FieldMetricsPanel: React.FC<FieldMetricsPanelProps> = ({
  deviceMetrics,
  peers = [],
  history = [],
  updateInterval = 1000,
  showAdvanced = false
}) => {
  const [expanded, setExpanded] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Draw N(t) graph
  useEffect(() => {
    if (!canvasRef.current || history.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw N(t) line
    if (history.length > 1) {
      const maxN = Math.max(...history.map(m => m.negentropicIndex), 3);
      const points = history.map((m, i) => ({
        x: (i / (history.length - 1)) * width,
        y: height - (m.negentropicIndex / maxN) * height
      }));
      
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    }
    
    // Draw current N marker
    if (deviceMetrics) {
      const y = height - (deviceMetrics.negentropicIndex / 3) * height;
      ctx.fillStyle = getNColor(deviceMetrics.negentropicIndex);
      ctx.beginPath();
      ctx.arc(width - 10, y, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [history, deviceMetrics]);
  
  return (
    <div className="field-metrics-panel" style={styles.panel}>
      <div style={styles.header} onClick={() => setExpanded(!expanded)}>
        <h3 style={styles.title}>
          🔬 Signal Field Metrics
        </h3>
        <span style={styles.toggle}>{expanded ? '▼' : '▶'}</span>
      </div>
      
      {expanded && (
        <div style={styles.content}>
          {/* Current Device Metrics */}
          {deviceMetrics && (
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>Current Field State</h4>
              <div style={styles.metricsGrid}>
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Negentropic Index (N)</div>
                  <div style={{ ...styles.metricValue, color: getNColor(deviceMetrics.negentropicIndex) }}>
                    {fmt(deviceMetrics.negentropicIndex, 3)}
                  </div>
                </div>
                
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Entropy (H)</div>
                  <div style={styles.metricValue}>
                    {fmt(deviceMetrics.entropy, 3)}
                  </div>
                  <div style={styles.metricBar}>
                    <div style={{ ...styles.metricBarFill, width: `${deviceMetrics.entropy * 100}%`, backgroundColor: '#ef4444' }} />
                  </div>
                </div>
                
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Coherence (C)</div>
                  <div style={styles.metricValue}>
                    {fmt(deviceMetrics.coherence, 3)}
                  </div>
                  <div style={styles.metricBar}>
                    <div style={{ ...styles.metricBarFill, width: `${deviceMetrics.coherence * 100}%`, backgroundColor: '#10b981' }} />
                  </div>
                </div>
                
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>Trend</div>
                  <div style={styles.metricValue}>
                    {getTrendIndicator(history)}
                  </div>
                </div>
              </div>
              
              {showAdvanced && deviceMetrics.sigilHash && (
                <div style={styles.hashDisplay}>
                  <span style={styles.hashLabel}>Sigil Hash:</span>
                  <code style={styles.hashValue}>{deviceMetrics.sigilHash.substring(0, 16)}...</code>
                </div>
              )}
            </div>
          )}
          
          {/* N(t) Graph */}
          {history.length > 0 && (
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>
                N(t) Timeline
                <span style={styles.graphLabel}>({history.length} samples)</span>
              </h4>
              <canvas
                ref={canvasRef}
                width={600}
                height={150}
                style={styles.canvas}
              />
              <div style={styles.graphLegend}>
                <span>0</span>
                <span>N(t)</span>
                <span>3.0</span>
              </div>
            </div>
          )}
          
          {/* Peer Field States */}
          {peers.length > 0 && (
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>Peer Field States ({peers.length})</h4>
              <div style={styles.peerGrid}>
                {peers.map(peer => (
                  <div key={peer.peerId} style={styles.peerCard}>
                    <div style={styles.peerHeader}>
                      <span style={styles.peerName}>{peer.name}</span>
                      <span
                        style={{
                          ...styles.peerStatus,
                          backgroundColor: peer.status === 'online' ? '#10b981' : '#6b7280'
                        }}
                      />
                    </div>
                    <div style={styles.peerMetrics}>
                      <div style={styles.peerMetric}>
                        N: <strong style={{ color: getNColor(peer.fieldMetrics.negentropicIndex) }}>
                          {fmt(peer.fieldMetrics.negentropicIndex, 2)}
                        </strong>
                      </div>
                      <div style={styles.peerMetric}>
                        H: {fmt(peer.fieldMetrics.entropy, 2)}
                      </div>
                      <div style={styles.peerMetric}>
                        C: {fmt(peer.fieldMetrics.coherence, 2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Statistics */}
          {history.length > 0 && (
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>Statistics</h4>
              <div style={styles.statsGrid}>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>Avg N</div>
                  <div style={styles.statValue}>
                    {fmt(history.reduce((sum, m) => sum + m.negentropicIndex, 0) / history.length, 3)}
                  </div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>Avg Entropy</div>
                  <div style={styles.statValue}>
                    {fmt(history.reduce((sum, m) => sum + m.entropy, 0) / history.length, 3)}
                  </div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>Avg Coherence</div>
                  <div style={styles.statValue}>
                    {fmt(history.reduce((sum, m) => sum + m.coherence, 0) / history.length, 3)}
                  </div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>Samples</div>
                  <div style={styles.statValue}>{history.length}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Styles
 */
const styles: Record<string, React.CSSProperties> = {
  panel: {
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    padding: '16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#f3f4f6',
    maxWidth: '800px',
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none'
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600
  },
  toggle: {
    fontSize: '14px',
    color: '#9ca3af'
  },
  content: {
    marginTop: '16px'
  },
  section: {
    marginBottom: '24px'
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '16px'
  },
  metric: {
    backgroundColor: '#1f2937',
    padding: '12px',
    borderRadius: '6px'
  },
  metricLabel: {
    fontSize: '12px',
    color: '#9ca3af',
    marginBottom: '4px'
  },
  metricValue: {
    fontSize: '24px',
    fontWeight: 700,
    fontFamily: 'monospace'
  },
  metricBar: {
    height: '4px',
    backgroundColor: '#374151',
    borderRadius: '2px',
    marginTop: '8px',
    overflow: 'hidden'
  },
  metricBarFill: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  hashDisplay: {
    marginTop: '12px',
    padding: '8px',
    backgroundColor: '#1f2937',
    borderRadius: '4px',
    fontSize: '12px'
  },
  hashLabel: {
    color: '#9ca3af',
    marginRight: '8px'
  },
  hashValue: {
    color: '#3b82f6',
    fontFamily: 'monospace'
  },
  canvas: {
    width: '100%',
    height: '150px',
    backgroundColor: '#1f2937',
    borderRadius: '6px'
  },
  graphLabel: {
    fontSize: '12px',
    color: '#6b7280',
    marginLeft: '8px'
  },
  graphLegend: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '8px',
    fontSize: '12px',
    color: '#6b7280'
  },
  peerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px'
  },
  peerCard: {
    backgroundColor: '#1f2937',
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid #374151'
  },
  peerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  peerName: {
    fontSize: '14px',
    fontWeight: 600
  },
  peerStatus: {
    width: '8px',
    height: '8px',
    borderRadius: '50%'
  },
  peerMetrics: {
    display: 'flex',
    gap: '12px',
    fontSize: '12px'
  },
  peerMetric: {
    color: '#9ca3af'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px'
  },
  stat: {
    backgroundColor: '#1f2937',
    padding: '12px',
    borderRadius: '6px',
    textAlign: 'center'
  },
  statLabel: {
    fontSize: '11px',
    color: '#9ca3af',
    marginBottom: '4px'
  },
  statValue: {
    fontSize: '18px',
    fontWeight: 700,
    fontFamily: 'monospace'
  }
};

export default FieldMetricsPanel;
