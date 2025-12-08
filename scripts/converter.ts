/* eslint-disable @typescript-eslint/no-require-imports */

export type PathModule = typeof import("path");
export type FsModule = typeof import("fs");
export type BindingsLoader = ((name: string) => unknown) &
  ((options: { bindings: string; module_root?: string }) => unknown);

export interface ConverterInterface {
  toBigInt: (buf: Buffer, bigEndian?: boolean) => bigint;
  fromBigInt: (num: bigint, buf: Buffer, bigEndian?: boolean) => Buffer;
}

export let isNative = false;

let converter: ConverterInterface | undefined;
let nativeLoadError: unknown;

export const IS_BROWSER =
  typeof globalThis !== "undefined" &&
  typeof (globalThis as { document?: unknown }).document
  let path: PathModule | undefined;
let fs: FsModule | undefined;

// Only import Node.js modules in Node, never in browser/renderer
if (typeof process !== "undefined" && process.versions?.node && !IS_BROWSER) {
  path = require("path");
  fs = require("fs");
}

const resolvePackageRoot = (): string | undefined => {
  if (!path) return undefined;
  try {
    const pkgPath = require.resolve("@gsknnft/qwormhole/package.json");
    return path.dirname(pkgPath);
  } catch {
    return undefined;
  }
};


// const resolvePackageRoot = (): string | undefined => {
//   if (!path || !fs) return undefined;

//   let dir = __dirname;
//   while (true) {
//     const pkgPath = path.join(dir, "package.json");
//     if (fs.existsSync(pkgPath)) {
//       return dir;
//     }
//     const parent = path.dirname(dir);
//     if (parent === dir) break;
//     dir = parent;
//   }

//   return undefined;
// };

const candidateRoots = (): string[] => {
  if (!path) return [];

  const seen = new Set<string>();
  const add = (candidate: string | undefined | null) => {
    if (!candidate) return;
    const normalized = path.resolve(candidate);
    if (!seen.has(normalized)) {
      seen.add(normalized);
    }
  };

  const pkgRoot = resolvePackageRoot();
  const resourcesPath =
    typeof process !== "undefined" &&
    (process as { resourcesPath?: string }).resourcesPath;

  add(process.env?.QWORMHOLE_NATIVE_PATH);

  // installed package root and its dist output
  add(pkgRoot);
  add(pkgRoot ? path.join(pkgRoot, "dist") : undefined);

  // electron packaged path (asar unpacked)
  add(
    resourcesPath
      ? path.join(
          resourcesPath,
          "app.asar.unpacked",
          "node_modules",
          "@gsknnft",
          "qwormhole"
        )
      : undefined
  );

  // relative to compiled artifacts or source
  add(path.resolve(__dirname, ".."));
  add(path.resolve(__dirname, "../.."));
  add(path.resolve(__dirname, "../../.."));
  add(path.resolve(__dirname, "../../../.."));

  return Array.from(seen);
};

export const findModuleRoot = (): string | undefined => {
  if (!path || !fs) return undefined;
  for (const root of candidateRoots()) {
    const candidate = path.join(root, "build", "Release", "qwormhole.node");
    if (fs.existsSync(candidate)) {
      return root;
    }
  }
  return undefined;
};

const resolveBindings = (candidate: unknown): BindingsLoader => {
  if (typeof candidate === "function") {
    return candidate as BindingsLoader;
  }
  if (candidate && typeof candidate === "object") {
    const maybeDefault = (candidate as { default?: unknown }).default;
    if (typeof maybeDefault === "function") {
      return maybeDefault as BindingsLoader;
    }
    if (
      maybeDefault &&
      typeof maybeDefault === "object" &&
      typeof (maybeDefault as { default?: unknown }).default === "function"
    ) {
      return (maybeDefault as { default: unknown }).default as BindingsLoader;
    }
  }
  throw new TypeError("bindings is not a function");
};

const loadWithNodeGypBuild = (): ConverterInterface | undefined => {
  if (!path) return undefined;
  try {
    const load = require("node-gyp-build") as (dir: string) => ConverterInterface;
    const pkgRoot = resolvePackageRoot();
    if (!pkgRoot) return undefined;
    return load(pkgRoot);
  } catch (err) {
    nativeLoadError = err;
    return undefined;
  }
};

export function loadNative(): ConverterInterface | undefined {
  // Prefer node-gyp-build (supports prebuilds) and fall back to bindings.
  const fromNodeGypBuild = loadWithNodeGypBuild();
  if (fromNodeGypBuild) return fromNodeGypBuild;

  try {
    const rawBindings = require("bindings");
    const bindings = resolveBindings(rawBindings);
    const moduleRoot = findModuleRoot();
    if (moduleRoot) {
      return bindings({
        bindings: "qwormhole",
        module_root: moduleRoot,
      }) as ConverterInterface;
    }
    return bindings("qwormhole") as ConverterInterface;
  } catch (err) {
    nativeLoadError = err;
    return undefined;
  }
}

if (!IS_BROWSER) {
  converter = loadNative();
  isNative = converter !== undefined;
  // Support both QWORMHOLE_SILENT_NATIVE_FAIL and BIGINT_BUFFER_SILENT_NATIVE_FAIL for compatibility
  const silentFail = process.env?.QWORMHOLE_SILENT_NATIVE_FAIL === "1" || process.env?.BIGINT_BUFFER_SILENT_NATIVE_FAIL === "1";
  if (
    !isNative &&
    nativeLoadError !== undefined &&
    !silentFail
  ) {
    console.warn(
      "qwormhole: Failed to load native bindings; using pure JS fallback. Run npm run rebuild to restore native.",
      nativeLoadError
    );
  }
}

if (converter === undefined) {
  // fallback to pure JS if needed (browser or when native load fails)
  converter = {
    toBigInt: (buf: Buffer, bigEndian = true) => {
      const copy = Buffer.from(buf);
      if (!bigEndian) copy.reverse();
      const hex = copy.toString("hex");
      return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
    },
    fromBigInt: (num: bigint, buf: Buffer, bigEndian = true) => {
      const hex = num.toString(16);
      const width = buf.length;
      const filled = hex.padStart(width * 2, "0").slice(0, width * 2);
      const tmp = Buffer.from(filled, "hex");
      if (!bigEndian) tmp.reverse();
      tmp.copy(buf);
      return buf;
    },
  };
}
