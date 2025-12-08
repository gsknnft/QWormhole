import React, { useState, useEffect } from 'react';
import { ZodError } from 'zod';
import {
  SimulationState,
  EdgeMetrics,
  SimulationStatePayload,
} from './types';
import { EntropyField } from './components/EntropyField';
import { NegentropyGauge } from './components/NegentropyGauge';
import { CouplingMap } from './components/CouplingMap';
import { PolicyConsole } from './components/PolicyConsole';
import { SimulationDiagnostics } from './components/SimulationDiagnostics';
import { SignalScopePanel } from './components/SignalScopePanel';
import './styles/theme.css';
import { ClassicalVsNegentropic } from './components/ClassicalVsNegentropic';
import { SimulationStateSchema } from '../shared/schemas';
import { ScenarioDiagnostics } from './components/ScenarioDiagnostics';
import { fromFixedPoint } from '../shared/fixedPoint';

type EdgeMetricPayload =
  | Map<string, EdgeMetrics>
  | Array<[string, EdgeMetrics]>
  | Record<string, EdgeMetrics>
  | undefined
  | null;

const normalizeState = (raw: SimulationStatePayload): SimulationState => {
  const maybeEdgeMetrics = (raw as SimulationStatePayload & {
    edgeMetrics: EdgeMetricPayload;
  }).edgeMetrics;

  const normalizedEdgeMetrics =
    maybeEdgeMetrics instanceof Map
      ? maybeEdgeMetrics
      : Array.isArray(maybeEdgeMetrics)
        ? new Map(maybeEdgeMetrics as [string, EdgeMetrics][])
        : new Map(
            Object.entries(
              (maybeEdgeMetrics ?? {}) as Record<string, EdgeMetrics>,
            ) as [string, EdgeMetrics][],
          );

  return {
    ...raw,
    edgeMetrics: normalizedEdgeMetrics,
  };
};

const formatBytes = (value?: number): string | null => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return null;
  }
  if (value < 1024) return `${value.toFixed(0)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

const formatZodIssues = (error: ZodError): string => {
  return error.issues
    .map(issue => {
      const path = issue.path.join('.') || 'root';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
};

type StatusLevel = 'info' | 'success' | 'error';

export const App: React.FC = () => {
  const [state, setState] = useState<SimulationState | null>(null);
  const [scenarioMeta, setScenarioMeta] =
    useState<SimulationState['scenarioMetadata'] | null>(null);
  const [status, setStatus] = useState<{ message: string; level: StatusLevel }>(
    { message: 'Ready', level: 'info' },
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scenarioPath, setScenarioPath] = useState<string>('../examples/entropy_mesh_example.json');
  const [chaosIntensity, setChaosIntensity] = useState<number>(0.12);
  const [entropyMode, setEntropyMode] = useState<'builtin_fft' | 'wavelet' | 'psqs' | 'qwave'>('builtin_fft');
  const [waveletName, setWaveletName] = useState<string>('haar');
  const [waveletLevel, setWaveletLevel] = useState<number>(3);
  const [availableScenarios, setAvailableScenarios] = useState([
    { label: 'Entropy Mesh Example', value: '../examples/entropy_mesh_example.json' },
    { label: 'NCF Python Model', value: '../models/NCF_simulation.py' },
    { label: 'NCF Wolfram Model', value: '../models/NCF_simulation.wl' },
    { label: 'Run Simulation Notebook', value: '../examples/run_simulation.ipynb' },
  ]);
  const updateStatus = (message: string, level: StatusLevel = 'info') =>
    setStatus({ message, level });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = reader.result;
          if (!data || typeof data === 'string') {
            throw new Error('Unable to read uploaded scenario');
          }
          const uploadResult = await window.ncf.uploadScenario({
            name: file.name,
            type: file.type,
            data: data as ArrayBuffer,
            saveToFile: true,
          });
          if (!uploadResult.success || !uploadResult.state) {
            setErrorMessage(uploadResult.error ?? 'Scenario upload failed');
            updateStatus('Scenario upload failed', 'error');
            return;
          }
          const virtualPath =
            uploadResult.state.path ??
            uploadResult.state.name ??
            `uploads/${file.name}`;
          setAvailableScenarios(prev => {
            const existing = prev.filter(s => s.value !== virtualPath);
            return [
              ...existing,
              { label: `Uploaded: ${file.name}`, value: virtualPath },
            ];
          });
          setScenarioPath(virtualPath);
          updateStatus('Scenario uploaded', 'success');
          setErrorMessage(null);
        } catch (err) {
          console.error('Scenario upload failed:', err);
          setErrorMessage(err instanceof Error ? err.message : 'Scenario upload failed');
          updateStatus('Scenario upload failed', 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };
  const [autoDemo, setAutoDemo] = useState(false);
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null);
  // const [mode, setMode] = useState<'demo' | 'real'>('demo');
  // const [quantumMode, setQuantumMode] = useState(true);
  // const [viewMode, setViewMode] = useState<'swap' | 'comparison' | 'diagnostics'>('swap');
  // const [quantumStatus, setQuantumStatus] = useState<{ initialized: boolean }>({ initialized: false });
  // const [comparisonData, setComparisonData] = useState({
  //   data: [] as any[],
  //   signalData: {
  //     coherence: [] as number[],
  //     entropy: [] as number[],
  //     fieldState: [] as string[],
  //   },
  //   anomalies: [] as any[],
  // });

  // Check quantum adapter status on mount
  // useEffect(() => {
  //   if (window.quantum) {
  //     window.quantum.getStatus().then(status => {
  //       setQuantumStatus(status);
  //     });
  //   }
  // }, []);
  // Initialize simulation on mount
  useEffect(() => {
    initializeSimulation();
  }, [scenarioPath, chaosIntensity, entropyMode]);

  // Auto-demo mode
  useEffect(() => {
    if (autoDemo && !intervalId) {
      const id = setInterval(() => {
        stepSimulation();
      }, 100);
      setIntervalId(id);
    } else if (!autoDemo && intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [autoDemo, intervalId]);

  const applySimulationState = (nextState: SimulationStatePayload) => {
    const parsed = SimulationStateSchema.safeParse(nextState);
    if (!parsed.success) {
      updateStatus('Simulation data invalid', 'error');
      setErrorMessage(formatZodIssues(parsed.error));
      return;
    }
    const normalized = normalizeState(parsed.data);
    setState(normalized);
    setScenarioMeta(normalized.scenarioMetadata ?? null);
    setErrorMessage(null);
    updateStatus('Simulation ready', 'success');
  };

  const initializeSimulation = async () => {
    updateStatus('Loading scenario...');
    setErrorMessage(null);
    setScenarioMeta(null);
    try {
      const response = await window.ncf.runSimulation({
        nodes: 5,
        edges: 10,
        scenarioPath,
        chaosIntensity,
        entropyAdapterMode: entropyMode,
        waveletName,
        waveletLevel,
      });
      if (response.success && response.state) {
        applySimulationState(response.state as SimulationStatePayload);
      } else {
        setState(null);
        setScenarioMeta(null);
        updateStatus('Scenario load failed', 'error');
        setErrorMessage(response.error ?? 'Unknown scenario load error');
      }
    } catch (error) {
      console.error('Failed to initialize simulation:', error);
      setState(null);
      setScenarioMeta(null);
      updateStatus('Scenario load failed', 'error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const stepSimulation = async () => {
    try {
      const response = await window.ncf.step();
      if (response.success) {
        // Get updated state
        const stateResponse = await window.ncf.getState();
        if (stateResponse.success && stateResponse.state) {
          applySimulationState(stateResponse.state as SimulationStatePayload);
        } else {
          updateStatus('Step failed', 'error');
          setErrorMessage(stateResponse.error ?? 'Unable to fetch updated state');
        }
      } else {
        updateStatus('Step failed', 'error');
        setErrorMessage(response.error ?? 'Unknown step error');
      }
    } catch (error) {
      console.error('Failed to step simulation:', error);
      updateStatus('Step failed', 'error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleReset = async () => {
    try {
      setAutoDemo(false);
      if (intervalId) {
        clearInterval(intervalId);
        setIntervalId(null);
      }
      const response = await window.ncf.reset({
        nodes: 5,
        edges: 10,
        scenarioPath,
        chaosIntensity,
        entropyAdapterMode: entropyMode,
        waveletName,
        waveletLevel,
      });
      if (response.success && response.state) {
        applySimulationState(response.state as SimulationStatePayload);
      } else {
        updateStatus('Reset failed', 'error');
        setErrorMessage(response.error ?? 'Unknown reset error');
      }
    } catch (error) {
      console.error('Failed to reset simulation:', error);
      updateStatus('Reset failed', 'error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const toggleAutoDemo = () => {
    setAutoDemo(!autoDemo);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🧩 Negentropic Console</h1>
        <p className="subtitle">Real-time Visualization of the Negentropic Coupling Framework</p>
      </header>

      {scenarioMeta && (
        <div className="scenario-metadata">
          <div className="meta-header">
            <div>
              <div className="meta-title">{scenarioMeta.name ?? 'Scenario'}</div>
              {scenarioMeta.description && (
                <div className="meta-description">{scenarioMeta.description}</div>
              )}
            </div>
            <div className="meta-source">
              {scenarioMeta.format && <span className="pill">Format: {scenarioMeta.format}</span>}
              {scenarioMeta.sourceName && (
                <span className="pill">File: {scenarioMeta.sourceName}</span>
              )}
              {formatBytes(scenarioMeta.sizeBytes) && (
                <span className="pill">Size: {formatBytes(scenarioMeta.sizeBytes)}</span>
              )}
              {scenarioMeta.sourcePath && (
                <span className="pill">Source: {scenarioMeta.sourcePath}</span>
              )}
              {scenarioMeta.checksum && (
                <span className="pill mono">Checksum: {scenarioMeta.checksum.slice(0, 12)}…</span>
              )}
            </div>
          </div>
          <div className="meta-grid">
            {scenarioMeta.author && (
              <div className="meta-item">
                <div className="meta-label">Author</div>
                <div className="meta-value">{scenarioMeta.author}</div>
              </div>
            )}
            {scenarioMeta.version && (
              <div className="meta-item">
                <div className="meta-label">Version</div>
                <div className="meta-value">{scenarioMeta.version}</div>
              </div>
            )}
            {scenarioMeta.date && (
              <div className="meta-item">
                <div className="meta-label">Date</div>
                <div className="meta-value">{scenarioMeta.date}</div>
              </div>
            )}
            {scenarioMeta.uploadedAt && (
              <div className="meta-item">
                <div className="meta-label">Uploaded</div>
                <div className="meta-value">
                  {new Date(scenarioMeta.uploadedAt).toLocaleString()}
                </div>
              </div>
            )}
          </div>
          {scenarioMeta.parameters && (
            <div className="meta-parameters">
              <div className="meta-label">Parameters</div>
              <div className="meta-parameter-list">
                {Object.entries(scenarioMeta.parameters).map(([key, value]) => (
                  <span key={key} className="pill">
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="controls">
        <select
          value={scenarioPath}
          onChange={e => setScenarioPath(e.target.value)}
          style={{ marginRight: 16 }}
        >
          {availableScenarios.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <input
          type="file"
          accept=".json,.py,.wl,.ipynb"
          style={{ marginRight: 16 }}
          onChange={handleFileUpload}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
          Chaos
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={chaosIntensity}
            onChange={e => setChaosIntensity(Number(e.target.value))}
          />
          <span style={{ minWidth: 48, textAlign: 'right' }}>{chaosIntensity.toFixed(2)}</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
          Spectrum
          <select
            value={entropyMode}
            onChange={e => setEntropyMode(e.target.value as 'builtin_fft' | 'wavelet' | 'psqs' | 'qwave')}
          >
            <option value="builtin_fft">FFT</option>
            <option value="wavelet">Wavelet</option>
            <option value="psqs">PSQS</option>
            <option value="qwave">QWave</option>
          </select>
        </label>
        {(entropyMode === 'wavelet' || entropyMode === 'psqs' || entropyMode === 'qwave') && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
              Wavelet
              <select value={waveletName} onChange={e => setWaveletName(e.target.value)}>
                <option value="haar">Haar</option>
                <option value="db2">db2</option>
                <option value="db4">db4</option>
                <option value="sym2">sym2</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
              Level
              <input
                type="number"
                min={1}
                max={8}
                value={waveletLevel}
                onChange={e => setWaveletLevel(Number(e.target.value))}
                style={{ width: 60 }}
              />
            </label>
          </>
        )}
        <button onClick={stepSimulation} disabled={autoDemo}>
          Step Simulation
        </button>
        <button onClick={toggleAutoDemo} className={autoDemo ? 'active' : ''}>
          {autoDemo ? '⏸ Pause Demo' : '▶ Auto Demo'}
        </button>
        <button onClick={handleReset}>
          🔄 Reset
        </button>
        <div className="status">
          {state && (
            <>
              <span>Time: {state.time}</span>
              <span>Nodes: {state.nodes}</span>
              <span>Edges: {state.edges.length}</span>
            </>
          )}
        </div>
      </div>
      <div className="status-row" aria-live="polite">
        <span className={`status-pill ${status.level}`}>
          {status.level === 'error' ? '⚠️' : status.level === 'success' ? '✅' : 'ℹ️'}{' '}
          {status.message}
        </span>
        {errorMessage && (
          <span className="status-pill error detailed" role="alert">
            {errorMessage}
          </span>
        )}
      </div>

      <div className="dashboard">
        <div className="panel panel-large">
          <h2>Coupling Map</h2>
          {state && <CouplingMap state={state} />}
        </div>

        <div className="panel">
          <h2>Negentropy Gauge</h2>
          {state && <NegentropyGauge metrics={state.meshMetrics} />}
        </div>

        <div className="panel">
          <h2>Entropy Field Evolution</h2>
          {state && <EntropyField history={state.history} />}
        </div>

        <div className="panel">
          <h2>Policy Console</h2>
          {state && <PolicyConsole state={state} />}
        </div>

        <div className="panel">
          <h2>Scenario Diagnostics</h2>
          <ScenarioDiagnostics metadata={scenarioMeta} />
        </div>

        <div className="panel">
          <h2>Simulation Diagnostics</h2>
          {state && (
            <SimulationDiagnostics
              state={state}
              chaosIntensity={chaosIntensity}
              entropyAdapterMode={entropyMode}
            />
          )}
        </div>

        <div className="panel panel-large">
          <h2>Signal Scope</h2>
          {state && <SignalScopePanel state={state} />}
        </div>
      </div>
      <div className="panel panel-large">
        <h2>Classical vs Negentropic</h2>
        {state && (() => {
          const coherenceArr = state.history.map(h => fromFixedPoint(h.coherence));
          const negentropyArr = state.history.map(h => fromFixedPoint(h.negentropy));
          if (
            coherenceArr.length === negentropyArr.length &&
            coherenceArr.every((v, i) => v === negentropyArr[i])
          ) {
            // eslint-disable-next-line no-console
            console.warn('Coherence and negentropy arrays are identical!', coherenceArr);
          }

          const throughputSeries = state.history.map(h => {
            const throughput = h.throughput ? fromFixedPoint(h.throughput) : undefined;
            const flowRate = h.flowRate ? fromFixedPoint(h.flowRate) : undefined;
            const velocity = fromFixedPoint(h.velocity);
            return throughput ?? flowRate ?? velocity * 100;
          });

          const entropySeries = state.history.map(h => {
            if (h.entropy) {
              return fromFixedPoint(h.entropy);
            }
            return 1 - fromFixedPoint(h.negentropy);
          });

          return (
            <ClassicalVsNegentropic
              data={state.history.map((h, idx) => ({
                timestamp: h.time,
                throughput: throughputSeries[idx],
                entropy: entropySeries[idx],
              }))}
              signalData={{
                coherence: coherenceArr,
                negentropy: negentropyArr,
                fieldState: state.history.map(h => h.fieldState ?? 'balanced'),
              }}
              anomalies={state.anomalies ?? []}
            />
          );
        })()}
      </div>
    </div>
  );
};
