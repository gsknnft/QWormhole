import fs from 'node:fs';
import path from 'node:path';

const setBigintBufferNativePath = () => {
  if (process.env.BIGINT_BUFFER_NATIVE_PATH) return;

  const seen = new Set<string>();
  const addCandidate = (candidate: string | null | undefined) => {
    if (!candidate) return;
    const normalized = path.resolve(candidate);
    if (!seen.has(normalized)) {
      seen.add(normalized);
    }
  };

  const candidates: string[] = [];

  // 1) Use Node resolution to find the installed package root
  const pkgRoot = (() => {
    try {
      const entry = require.resolve('@gsknnft/bigint-buffer');
      let dir = path.dirname(entry);
      while (true) {
        if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      return null;
    } catch {
      return null;
    }
  })();

  if (pkgRoot) {
    addCandidate(pkgRoot);
    addCandidate(path.join(pkgRoot, 'dist'));
  }

  // 2) Packaged app: look in the unpacked resources directory
  if (process.resourcesPath) {
    addCandidate(
      path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        '@gsknnft',
        'bigint-buffer',
        'dist',
      ),
    );
  }

  const nativePath = Array.from(seen).find(candidate =>
    fs.existsSync(path.join(candidate, 'build', 'Release', 'bigint_buffer.node')),
  );

  if (nativePath) {
    process.env.BIGINT_BUFFER_NATIVE_PATH = nativePath;
  }
};

setBigintBufferNativePath();
