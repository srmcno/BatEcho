import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`               -> normal multi-file PWA build (dist/)
// `vite build --mode single` -> one self-contained dist/index.html
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    build: {
      target: 'es2020',
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      // inline every asset so nothing is referenced externally in single mode
      ...(single ? { assetsInlineLimit: 100000000, cssCodeSplit: false } : {}),
    },
    server: {
      host: true,
      port: 5173,
    },
  };
});
