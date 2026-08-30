import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

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
    transformIndexHtml(html) { return html.replace('content="source"', 'content="production"'); }
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
