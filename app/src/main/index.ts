
import './setup-native-bindings';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'node:path';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';
import sourceMapSupport from 'source-map-support';
import {
  default as electronDevtoolsInstaller,
  REACT_DEVELOPER_TOOLS,
} from 'electron-devtools-installer';
import { ncfService, NCFParams, NCFResponse } from './components/services/ncfService';
import fs from 'node:fs';

// In-memory scenario store
const uploadedScenarios = new Map<
  string,
  { buffer: Buffer; type: string; saveToFile: boolean }
>();
ipcMain.handle(
  'ncf:uploadScenario',
  async (_event, { name, type, data, saveToFile }) => {
    try {
      const buffer = Buffer.from(data);
      uploadedScenarios.set(name, { buffer, type, saveToFile });
      if (saveToFile) {
        const dest = path.resolve(process.cwd(), 'uploads', name);
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await fs.promises.writeFile(dest, buffer);
        return { success: true, path: dest };
      }
      return { success: true, name };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

let mainWindow: BrowserWindow | null = null;

if (process.env.NODE_ENV === 'production') {
  sourceMapSupport.install();
}

async function installExtensions() {
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  await electronDevtoolsInstaller([REACT_DEVELOPER_TOOLS], { forceDownload });
}

async function createWindow() {
  const devServerUrl =
    process.env.VITE_DEV_SERVER_URL ||
    process.env.ELECTRON_RENDERER_URL ||
    'http://localhost:5173';
  const rendererHtmlPath = path.join(__dirname, '../renderer/index.html');
  const useDevServer =
    !app.isPackaged &&
    !!(process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL);

  if (useDevServer) await installExtensions();

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: path.join(process.cwd(), 'assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });

  const loadRenderer = async () => {
    if (useDevServer) {
      await mainWindow?.loadURL(devServerUrl);
      return;
    }

    if (fs.existsSync(rendererHtmlPath)) {
      await mainWindow?.loadFile(rendererHtmlPath);
      return;
    }

    // Last resort: fall back to dev server URL so the window isn't blank.
    await mainWindow?.loadURL(devServerUrl);
  };

  await loadRenderer();
  mainWindow.webContents.reloadIgnoringCache();
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => (mainWindow = null));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  new AppUpdater();
}

class AppUpdater {
  constructor() {
    if (log.transports?.file) {
      log.transports.file.level = 'info';
    }
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerNCFHandlers() {
  const success = <T extends keyof Pick<NCFResponse, 'state' | 'metrics'>>(
    key: T,
    payload: NonNullable<NCFResponse[T]>,
  ): NCFResponse => ({ success: true, [key]: payload });

  const failure = (error: unknown): NCFResponse => ({
    success: false,
    error: error instanceof Error ? error.message : 'Unknown simulation error',
  });

  ipcMain.handle('ncf:run', async (_event, params: NCFParams = {}) => {
    try {
      const state = await ncfService.run(params);
      return success('state', state);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('ncf:step', async () => {
    try {
      const metrics = await ncfService.step();
      return success('metrics', metrics);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('ncf:state', async () => {
    try {
      const state = await ncfService.getState();
      return success('state', state);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('ncf:reset', async (_event, params: NCFParams = {}) => {
    try {
      const state = await ncfService.reset(params);
      return success('state', state);
    } catch (error) {
      return failure(error);
    }
  });
}

registerNCFHandlers();

ipcMain.handle('ping', () => 'pong');
