import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// One version per dev/build process. Generating this inside transformIndexHtml
// would invalidate every asset on every HTML request in Vite dev mode.
const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const runtimeDirectories = ['scenes', 'shared', 'data', 'uploads'];
const runtimeFiles = ['app.js'];

function copyRuntimeFiles() {
  return {
    name: 'copy-runtime-files',
    closeBundle() {
      const outputDir = resolve(process.cwd(), 'dist');
      mkdirSync(outputDir, { recursive: true });
      for (const directory of runtimeDirectories) {
        const source = resolve(process.cwd(), directory);
        const destination = resolve(outputDir, directory);
        if (existsSync(source)) cpSync(source, destination, { recursive: true });
      }
      for (const file of runtimeFiles) {
        const source = resolve(process.cwd(), file);
        const destination = resolve(outputDir, file);
        if (existsSync(source)) cpSync(source, destination);
      }
    }
  };
}

function markProductionBuild() {
  return {
    name: 'mark-production-build',
    transformIndexHtml(html) {
      return html.replaceAll('__BUILD_ID__', buildId).replace('content="source"', 'content="production"');
    }
  };
}

export default defineConfig({
  appType: 'spa',
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': 'http://127.0.0.1:8080'
    }
  },
  preview: {
    port: 4173,
    strictPort: false
  },
  plugins: [copyRuntimeFiles(), markProductionBuild()]
});
