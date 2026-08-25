import esbuild from 'esbuild';
import fs from 'fs';

if (fs.existsSync('client/out')) {
  fs.rmSync('client/out', { recursive: true, force: true });
}
if (fs.existsSync('server/out')) {
  fs.rmSync('server/out', { recursive: true, force: true });
}

await esbuild.build({
  entryPoints: ['client/src/extension.ts'],
  bundle: true,
  outfile: 'client/out/extension.js',
  external: [
    'vscode',
    'child_process', 'fs', 'path', 'os', 'util',
    'stream', 'events', 'buffer', 'url', 'net', 'tls', 'crypto'
  ],
  platform: 'node',
  format: 'esm',
  sourcemap: true,
  target: 'node18',
  tsconfig: 'client/tsconfig.json',
  banner: {
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
});

await esbuild.build({
  entryPoints: ['server/src/server.ts'],
  bundle: true,
  outfile: 'server/out/server.js',
  external: [
    'child_process', 'fs', 'path', 'os', 'util',
    'stream', 'events', 'buffer', 'url', 'net', 'tls', 'crypto'
  ],
  platform: 'node',
  format: 'esm',
  sourcemap: true,
  target: 'node18',
  tsconfig: 'server/tsconfig.json',
  banner: {
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
});

console.log('Build completed!');