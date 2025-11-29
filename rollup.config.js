import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.ts',
  output: [
    { file: 'dist/esm/index.js', format: 'esm', sourcemap: true },
    { file: 'dist/cjs/index.cjs', format: 'cjs', sourcemap: true }
  ],
  plugins: [
    nodeResolve(),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      compilerOptions: {
        declaration: false,
        declarationMap: false
      }
    })
  ],
  external: ['node:net', 'node:crypto', 'node:events', 'net', 'crypto', 'events'],
};
