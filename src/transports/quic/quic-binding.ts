import path from "node:path";
import { createRequire } from "node:module";
import type { QuicBinding } from "./types";

let cachedBinding: QuicBinding | null | undefined;
const requireFn = typeof require === "function" ? require : createRequire(__filename);

const envPath = process.env.QW_QUIC_PATH;

const bindingCandidates = [
  // Explicit override
  envPath,
  // Development build/Release layout (package root)
  path.join(__dirname, "..", "..", "..", "build", "Release", "qwquic.node"),
  // Dist native layout (package root)
  path.join(__dirname, "..", "..", "..", "dist", "native", "qwquic.node"),
  // Workspace-level native target (useful in tests/tsx)
  path.resolve(process.cwd(), "native", "qwquic", "target", "release", "qwquic.dll"),
  path.resolve(process.cwd(), "native", "qwquic", "target", "release", "qwquic.node"),
  // Monorepo root relative to this file (e.g., when cwd is package)
  path.resolve(__dirname, "..", "..", "..", "..", "..", "native", "qwquic", "target", "release", "qwquic.dll"),
  path.resolve(__dirname, "..", "..", "..", "..", "..", "native", "qwquic", "target", "release", "qwquic.node"),
  // Direct module name (napi-rs default)
  "qwquic",
].filter(Boolean) as string[];

export function loadQuicBinding(): QuicBinding | null {
  if (cachedBinding !== undefined) {
    return cachedBinding;
  }
  for (const candidate of bindingCandidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = requireFn(candidate) as QuicBinding;
      if (mod && typeof mod.createEndpoint === "function") {
        cachedBinding = mod;
        return cachedBinding;
      }
    } catch {
      if (process.env.QW_QUIC_DEBUG === "1") {
        console.warn("[qwquic] failed to load", candidate);
      }
    }
  }
  cachedBinding = null;
  return cachedBinding;
}

export function quicAvailable(): boolean {
  return Boolean(loadQuicBinding());
}
