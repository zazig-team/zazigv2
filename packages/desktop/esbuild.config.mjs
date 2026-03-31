import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const mainConfig = {
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'ws'],
  sourcemap: true,
};

const preloadConfig = {
  entryPoints: ['src/main/preload.ts'],
  outfile: 'dist/preload.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
};

const rendererConfig = {
  entryPoints: ['src/renderer/index.tsx'],
  outfile: 'dist/renderer.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  loader: { '.css': 'css' },
  sourcemap: true,
};

if (watch) {
  const [mainCtx, preloadCtx, rendererCtx] = await Promise.all([
    esbuild.context(mainConfig),
    esbuild.context(preloadConfig),
    esbuild.context(rendererConfig),
  ]);
  await Promise.all([mainCtx.watch(), preloadCtx.watch(), rendererCtx.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(mainConfig),
    esbuild.build(preloadConfig),
    esbuild.build(rendererConfig),
  ]);
  console.log('Build complete.');
}
