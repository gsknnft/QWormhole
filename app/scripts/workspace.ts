import * as path from 'path';
import * as fs from 'node:fs';

// Determine root path - use localRootPath for standalone, or search up for monorepo root
//const __dirnamePath = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const localRootPath = path.resolve(__dirname, '../');

export function findWorkspaceRoot(start: string): string {
  let current = start;
  while (true) {
    if (
      fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(current, 'lerna.json'))
    ) {
      console.log('[paths] Found workspace root:', current);
      return current;
    }
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.workspaces) {
          console.log('[paths] Found workspace root (package.json workspaces):', current);
          return current;
        }
      } catch {}
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  console.log('[paths] No workspace found, using local project root');
  return start;
}

export function findProjectRoot(startDir: string): string {
  let current = startDir;
  
  // First check if we're in standalone mode (package.json exists in parent of scripts)
  const standalonePackageJson = path.join(current, 'package.json');
  if (fs.existsSync(standalonePackageJson)) {
    // Check if this looks like a monorepo (has pnpm-workspace.yaml or workspaces field)
    try {
      const pkg = JSON.parse(fs.readFileSync(standalonePackageJson, 'utf-8'));
      const workspaceFile = path.join(current, 'pnpm-workspace.yaml');
      
      // If no workspace indicators, this is standalone
      if (!fs.existsSync(workspaceFile) && !pkg.workspaces) {
        console.log('[paths] Detected standalone project');
        return current;
      }
    } catch {
      // If we can't read package.json, treat as standalone
      return current;
    }
  }
  
  // Search upward for monorepo root
  while (true) {
    const workspaceFile = path.join(current, 'pnpm-workspace.yaml');
    const packageJson = path.join(current, 'package.json');
    
    if (fs.existsSync(workspaceFile)) {
      console.log('[paths] Detected monorepo root at:', current);
      return current;
    }
    
    if (fs.existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
        if (pkg.workspaces) {
          console.log('[paths] Detected monorepo root at:', current);
          return current;
        }
      } catch {}
    }
    
    const parent = path.dirname(current);
    if (parent === current) break; // Reached filesystem root
    current = parent;
  }
  
  // Default to local root if nothing found
  console.log('[paths] Using local root (standalone fallback)');
  return localRootPath;
}
