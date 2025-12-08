/**
 * Echo Index Panel - React Component
 * 
 * Visualizes QLib vs SigilNet alignment in real-time.
 */

import React, { useEffect, useRef } from 'react';

/**
 * Echo index measurement
 */
interface EchoIndexMeasurement {
  timestamp: number;
  qLibN: number;
  veraN: number;
  echoIndex: number;
  alignment: number;
}

/**
 * Echo Index Panel Props
 */
interface EchoIndexPanelProps {
  /** Recent measurements */
  measurements: EchoIndexMeasurement[];
  
  /** Current echo index */
  currentE?: number;
  
  /** Current alignment */
  currentAlignment?: number;
  
  /** Trend */
  trend?: 'improving' | 'declining' | 'stable';
  
  /** Correlation */
  correlation?: number;
}

/**
 * Get color for echo index value
 */
const getEchoColor = (E: number): string => {
  if (E >= 0.8) return '#10b981'; // Green: excellent
  if (E >= 0.6) return '#3b82f6'; // Blue: good
  if (E >= 0.4) return '#f59e0b'; // Orange: fair
  return '#ef4444'; // Red: poor
};

/**
 * Echo Index Panel Component
 */
export const EchoIndexPanel: React.FC<EchoIndexPanelProps> = ({
  measurements,
  currentE,
  currentAlignment,
  trend = 'stable',
  correlation = 0
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Draw chart
  useEffect(() => {
    if (!canvasRef.current || measurements.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
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
    
    // Draw echo index line
    if (measurements.length > 1) {
      const points = measurements.map((m, i) => ({
        x: (i / (measurements.length - 1)) * width,
        y: height - (m.echoIndex * height)
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
    
    // Draw QLib N line (thin, dashed)
    if (measurements.length > 1) {
      const points = measurements.map((m, i) => ({
        x: (i / (measurements.length - 1)) * width,
        y: height - (Math.min(m.qLibN / 3, 1) * height) // Scale to 0-3
      }));
      
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    // Draw SigilNet N line (thin, dashed)
    if (measurements.length > 1) {
      const points = measurements.map((m, i) => ({
        x: (i / (measurements.length - 1)) * width,
        y: height - (Math.min(m.veraN / 3, 1) * height) // Scale to 0-3
      }));
      
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [measurements]);
  
  const trendIcon = trend === 'improving' ? '↗' : trend === 'declining' ? '↘' : '→';
  
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h3 style={styles.title}>📊 Echo Index: QLib ↔ SigilNet Alignment</h3>
      </div>
      
      <div style={styles.content}>
        {/* Current Values */}
        <div style={styles.metricsGrid}>
          <div style={styles.metric}>
            <div style={styles.metricLabel}>Echo Index (E)</div>
            <div style={{ ...styles.metricValue, color: currentE ? getEchoColor(currentE) : '#9ca3af' }}>
              {currentE?.toFixed(3) ?? '—'}
            </div>
            <div style={styles.metricSubtext}>1 - |N_qlib - N_vera|</div>
          </div>
          
          <div style={styles.metric}>
            <div style={styles.metricLabel}>Alignment</div>
            <div style={styles.metricValue}>
              {currentAlignment?.toFixed(3) ?? '—'}
            </div>
            <div style={styles.metricBar}>
              <div style={{
                ...styles.metricBarFill,
                width: `${(currentAlignment ?? 0) * 100}%`,
                backgroundColor: '#3b82f6'
              }} />
            </div>
          </div>
          
          <div style={styles.metric}>
            <div style={styles.metricLabel}>Trend</div>
            <div style={styles.metricValue}>
              {trendIcon}
            </div>
            <div style={styles.metricSubtext}>{trend}</div>
          </div>
          
          <div style={styles.metric}>
            <div style={styles.metricLabel}>Correlation</div>
            <div style={styles.metricValue}>
              {correlation.toFixed(3)}
            </div>
            <div style={styles.metricSubtext}>Pearson r</div>
          </div>
        </div>
        
        {/* Chart */}
        <div style={styles.chartSection}>
          <h4 style={styles.sectionTitle}>
            Timeline ({measurements.length} samples)
          </h4>
          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            style={styles.canvas}
          />
          <div style={styles.legend}>
            <div style={styles.legendItem}>
              <div style={{ ...styles.legendColor, backgroundColor: '#3b82f6' }} />
              <span>Echo Index (E)</span>
            </div>
            <div style={styles.legendItem}>
              <div style={{ ...styles.legendColor, backgroundColor: '#f59e0b' }} />
              <span>QLib N</span>
            </div>
            <div style={styles.legendItem}>
              <div style={{ ...styles.legendColor, backgroundColor: '#10b981' }} />
              <span>SigilNet N</span>
            </div>
          </div>
        </div>
        
        {/* Interpretation */}
        <div style={styles.interpretation}>
          <h4 style={styles.sectionTitle}>Interpretation</h4>
          <div style={styles.interpretationText}>
            {currentE !== undefined && currentE >= 0.8 && (
              <p>✅ <strong>Excellent alignment</strong> - Classical and quantum signals converge</p>
            )}
            {currentE !== undefined && currentE >= 0.6 && currentE < 0.8 && (
              <p>✓ <strong>Good alignment</strong> - Signals track well with minor divergence</p>
            )}
            {currentE !== undefined && currentE >= 0.4 && currentE < 0.6 && (
              <p>⚠ <strong>Fair alignment</strong> - Moderate divergence detected</p>
            )}
            {currentE !== undefined && currentE < 0.4 && (
              <p>❌ <strong>Poor alignment</strong> - Significant divergence, review models</p>
            )}
            
            {Math.abs(correlation) >= 0.7 && (
              <p>📈 Strong correlation (r={correlation.toFixed(2)}) indicates systematic relationship</p>
            )}
            
            {trend === 'improving' && (
              <p>↗ Alignment is improving over time</p>
            )}
            {trend === 'declining' && (
              <p>↘ Alignment is declining - consider recalibration</p>
            )}
          </div>
        </div>
      </div>
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
    marginBottom: '16px'
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
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
  metricSubtext: {
    fontSize: '11px',
    color: '#6b7280',
    marginTop: '4px'
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
  chartSection: {
    backgroundColor: '#1f2937',
    padding: '16px',
    borderRadius: '6px'
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  canvas: {
    width: '100%',
    height: '200px',
    backgroundColor: '#1f2937',
    borderRadius: '6px'
  },
  legend: {
    display: 'flex',
    justifyContent: 'center',
    gap: '24px',
    marginTop: '12px',
    fontSize: '12px'
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  legendColor: {
    width: '16px',
    height: '3px',
    borderRadius: '2px'
  },
  interpretation: {
    backgroundColor: '#1f2937',
    padding: '16px',
    borderRadius: '6px'
  },
  interpretationText: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#d1d5db'
  }
};

export default EchoIndexPanel;
