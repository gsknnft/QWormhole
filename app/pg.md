```json
{
  "name": "negentropic-console",
  "version": "1.0.0",
  "description": "Real-time visualization of the Negentropic Coupling Framework - Quantum Electron Edition",
  "main": "dist/main/index.js",
  "author": "gsknnft",
  "license": "MIT",
  "scripts": {
    "dev": "vite",
    "dev:console": "concurrently \"npm run dev\" \"wait-on http://localhost:5173 && electron .\"",
    "electron:dev": "wait-on http://localhost:5173 && electron .",
    "build": "tsc && vite build && tsc -p tsconfig.main.json && tsc -p tsconfig.preload.json",
    "build:console": "npm run build && electron-builder",
    "preview": "vite preview",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "d3": "^7.8.5",
    "d3-force": "^3.0.0",
    "recharts": "^2.10.3"
  },
  "devDependencies": {
    "@types/d3": "^7.4.3",
    "@types/d3-force": "^3.0.9",
    "@types/node": "^20.10.6",
    "@types/react": "^18.2.46",
    "@types/react-dom": "^18.2.18",
    "@vitejs/plugin-react": "^4.2.1",
    "concurrently": "^8.2.2",
    "electron": "^28.1.0",
    "electron-builder": "^24.9.1",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3",
    "vite": "^5.0.10",
    "wait-on": "^7.2.0"
  },
  "build": {
    "appId": "com.sigilnet.negentropic-console",
    "productName": "Negentropic Console",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "package.json"
    ],
    "mac": {
      "category": "public.app-category.developer-tools"
    },
    "linux": {
      "target": ["AppImage"],
      "category": "Development"
    },
    "win": {
      "target": "nsis"
    }
  }
}
```