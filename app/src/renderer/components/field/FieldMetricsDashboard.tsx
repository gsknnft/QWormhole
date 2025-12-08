/**
 * Field Metrics Panel - Usage Example
 * 
 * Demonstrates how to integrate the FieldMetricsPanel into an Electron app
 * and connect it to live telemetry data.
 */

import React, { useState, useEffect } from 'react';
import { FieldMetricsPanel } from './FieldMetricsPanel';
// import type { WireGuardFieldCoupler, FieldCoupledTelemetry } from '@sigilnet/signal-fabric';

/**
 * Example component showing FieldMetricsPanel integration
 */
export const FieldMetricsDashboard: React.FC = () => {
  const [currentMetrics, setCurrentMetrics] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [peers, setPeers] = useState<any[]>([]);
  
  // Simulate telemetry updates
  useEffect(() => {
    const interval = setInterval(() => {
      // In a real app, this would come from IPC bridge to main process
      // which gets telemetry from WireGuardFieldCoupler
      
      const mockMetrics = {
        timestamp: Date.now(),
        entropy: 0.3 + Math.random() * 0.5,
        coherence: 0.4 + Math.random() * 0.4,
        negentropicIndex: 0.5 + Math.random() * 2,
        peerId: 'local-node',
        sigilHash: generateMockHash()
      };
      
      setCurrentMetrics(mockMetrics);
      
      setHistory(prev => {
        const updated = [...prev, mockMetrics];
        // Keep last 50 samples
        return updated.slice(-50);
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Simulate peer updates
  useEffect(() => {
    const mockPeers = [
      {
        peerId: 'peer-001',
        name: 'Pi-FPGA-01',
        status: 'online' as const,
        fieldMetrics: {
          timestamp: Date.now(),
          entropy: 0.45,
          coherence: 0.72,
          negentropicIndex: 1.6
        }
      },
      {
        peerId: 'peer-002',
        name: 'ROG-Ally-X',
        status: 'online' as const,
        fieldMetrics: {
          timestamp: Date.now(),
          entropy: 0.38,
          coherence: 0.81,
          negentropicIndex: 2.13
        }
      },
      {
        peerId: 'peer-003',
        name: 'Gateway-DO',
        status: 'degraded' as const,
        fieldMetrics: {
          timestamp: Date.now(),
          entropy: 0.72,
          coherence: 0.42,
          negentropicIndex: 0.58
        }
      }
    ];
    
    setPeers(mockPeers);
  }, []);
  
  return (
    <div style={{ padding: '20px', backgroundColor: '#0f172a', minHeight: '100vh' }}>
      <FieldMetricsPanel
        deviceMetrics={currentMetrics}
        peers={peers}
        history={history}
        showAdvanced={true}
        updateInterval={1000}
      />
    </div>
  );
};

/**
 * Integration with Electron IPC
 * 
 * In your main process:
 */
export const setupFieldMetricsIPC = () => {
  // Example for main process (Node.js side)
  /*
  import { ipcMain } from 'electron';
  import { WireGuardFieldCoupler } from '@sigilnet/signal-fabric';
  
  const coupler = new WireGuardFieldCoupler();
  
  // Listen for telemetry from FPGA/WireGuard
  setInterval(async () => {
    const telemetry = await getFPGATelemetry(); // Your telemetry source
    const coupled = await coupler.onTelemetry(telemetry);
    
    // Send to all renderer windows
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('field-metrics-update', coupled);
    });
  }, 1000);
  
  // Provide historical data on request
  ipcMain.handle('get-field-history', () => {
    return coupler.getHistory();
  });
  
  // Provide peer field states
  ipcMain.handle('get-peer-field-states', async () => {
    const devices = await getDevices(); // From device registry
    return devices.map(d => ({
      peerId: d.deviceId,
      name: d.name,
      status: d.status,
      fieldMetrics: d.telemetry?.fieldMetrics
    }));
  });
  */
};

/**
 * Integration in renderer process (React)
 */
export const useFieldMetrics = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [peers, setPeers] = useState<any[]>([]);
  
  useEffect(() => {
    // Setup IPC listeners
    // @ts-ignore
    window.electron?.ipcRenderer.on('field-metrics-update', (event: any, data: any) => {
      setMetrics(data);
      setHistory(prev => [...prev, data].slice(-100));
    });
    
    // Fetch initial data
    // @ts-ignore
    window.electron?.ipcRenderer.invoke('get-field-history').then((data: any) => {
      setHistory(data || []);
    });
    
    // @ts-ignore
    window.electron?.ipcRenderer.invoke('get-peer-field-states').then((data: any) => {
      setPeers(data || []);
    });
    
    // Poll for peer updates
    const interval = setInterval(() => {
      // @ts-ignore
      window.electron?.ipcRenderer.invoke('get-peer-field-states').then((data: any) => {
        setPeers(data || []);
      });
    }, 5000);
    
    return () => {
      clearInterval(interval);
      // @ts-ignore
      window.electron?.ipcRenderer.removeAllListeners('field-metrics-update');
    };
  }, []);
  
  return { metrics, history, peers };
};

/**
 * Full dashboard component
 */
export const FullFieldDashboard: React.FC = () => {
  const { metrics, history, peers } = useFieldMetrics();
  
  return (
    <div style={{ padding: '20px', backgroundColor: '#0f172a', minHeight: '100vh' }}>
      <h1 style={{ color: '#f3f4f6', marginBottom: '20px' }}>
        Signal Field Dashboard
      </h1>
      
      <FieldMetricsPanel
        deviceMetrics={metrics}
        peers={peers}
        history={history}
        showAdvanced={true}
      />
      
      {/* Additional panels can go here */}
      {/* - SigilNet routing table */}
      {/* - Negentropic scheduler decisions */}
      {/* - Field coherence heatmap */}
    </div>
  );
};

/**
 * Generate mock hash for demo
 */
function generateMockHash(): string {
  return Array.from({ length: 32 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

export default FieldMetricsDashboard;
