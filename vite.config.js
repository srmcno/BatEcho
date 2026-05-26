import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// After the single-file HTML is written, convert its inlined ES-module script
// into a CLASSIC script. iOS/macOS Safari refuse to execute `type="module"`
// scripts from file:// URLs (local files are treated as a null origin), which
// otherwise leaves the app stuck on the loading screen when opened as a
// downloaded file. The bundle is built as an IIFE (below) so it is valid as a
// non-module script.
function classicScriptForFileUrls() {
  return {
    name: 'batecho-classic-script',
    closeBundle() {
      const file = resolve('dist/index.html');
      let html;
      try { html = readFileSync(file, 'utf8'); } catch { return; }
      html = html
        .replace(/<script\s+type="module"\s+crossorigin>/g, '<script>')
        .replace(/<script\s+type="module">/g, '<script>')
        .replace(/<script\s+crossorigin\s+type="module">/g, '<script>');
      writeFileSync(file, html);
    },
  };
}

// `vite build`               -> normal multi-file PWA build (dist/)
// `vite build --mode single` -> one self-contained, Safari-safe dist/index.html
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [viteSingleFile(), classicScriptForFileUrls()] : [],
    build: {
      target: single ? 'es2019' : 'es2020',
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      ...(single
        ? {
            assetsInlineLimit: 100000000,
            cssCodeSplit: false,
            modulePreload: false,
            rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
          }
        : {}),
    },
    server: {
      host: true,
      port: 5173,
    },
  };
});
