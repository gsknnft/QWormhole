const { contextBridge, ipcRenderer } = require('electron');
const { IpcRendererEvent } = require('electron');

type IpcRendererEventType = typeof IpcRendererEvent;

export interface NCFParams {
  steps?: number;
  mode?: 'macro' | 'defensive' | 'balanced';
  nodes?: number;
  edges?: number;
  scenarioPath?: string;
}

export interface NCFResponse<TState = unknown, TMetrics = unknown> {
  success: boolean;
  state?: TState;
  metrics?: TMetrics;
  error?: string;
}
export type Channels =
  | 'ipc-example'
  | 'ncf:ping'
  | 'ncf:run'
  | 'ncf:step'
  | 'ncf:state'
  | 'ncf:reset'
  | 'ncf:uploadScenario'
  | 'ping';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
interface NCFIpcRenderer {
  sendMessage: (channel: Channels, args: unknown[]) => void;
  on: (channel: Channels, func: (...args: unknown[]) => void) => () => void;
  once: (channel: Channels, func: (...args: unknown[]) => void) => void;
  ipc: {
    channel: string;
    event: any;
    get: (...args: any[]) => Promise<any>;
  };
}

interface NCFPreloadAPI {
  ping: () => Promise<unknown>;
  platform: NodeJS.Platform;
  ipcRenderer: NCFIpcRenderer;
  runSimulation: (params: NCFParams) => Promise<NCFResponse>;
  step: () => Promise<NCFResponse>;
  getState: () => Promise<NCFResponse>;
  reset: (params: NCFParams) => Promise<NCFResponse>;
  uploadScenario: (payload: { name: string; type: string; data: ArrayBuffer; saveToFile?: boolean }) => Promise<NCFResponse>;
}

interface UploadScenarioPayload {
  name: string;
  type: string;
  data: ArrayBuffer;
  saveToFile?: boolean;
}

const ncfPreloadAPI: NCFPreloadAPI = {
  ping: (): Promise<unknown> => ipcRenderer.invoke('ping'),
  platform: process.platform as NodeJS.Platform,
  ipcRenderer: {
    sendMessage: (channel: Channels, args: unknown[]): void =>
      ipcRenderer.send(channel, ...args),
    on: (channel: Channels, func: (...args: unknown[]) => void): () => void => {
      const subscription = (_event: IpcRendererEventType, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    },
    once: (channel: Channels, func: (...args: unknown[]) => void): void =>
      ipcRenderer.once(channel, (_event: IpcRendererEventType, ...args: unknown[]) => func(...args)),
    ipc: {
      channel: 'ipc-example',
      event: {} as any,
      get: (...args: any[]): Promise<any> => ipcRenderer.invoke('ipc-example', ...args),
    },
  } as NCFIpcRenderer,
  runSimulation: (params: NCFParams): Promise<NCFResponse> =>
    ipcRenderer.invoke('ncf:run', params) as Promise<NCFResponse>,

  step: (): Promise<NCFResponse> => ipcRenderer.invoke('ncf:step') as Promise<NCFResponse>,

  getState: (): Promise<NCFResponse> => ipcRenderer.invoke('ncf:state') as Promise<NCFResponse>,

  reset: (params: NCFParams): Promise<NCFResponse> =>
    ipcRenderer.invoke('ncf:reset', params) as Promise<NCFResponse>,
  uploadScenario: (payload: UploadScenarioPayload): Promise<NCFResponse> =>
    ipcRenderer.invoke('ncf:uploadScenario', payload) as Promise<NCFResponse>,
};

contextBridge.exposeInMainWorld('ncf', ncfPreloadAPI);

console.log('Preload script loaded with secure context isolation');
