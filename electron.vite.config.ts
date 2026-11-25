import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The renderer HTML files carry a strict Content-Security-Policy. The Vite dev
 * server needs an inline React Refresh preamble and a websocket for HMR, so the
 * policy is relaxed only while serving in development.
 */
function devCspRelaxation(): Plugin {
  let isServe = false;
  return {
    name: 'vrs-dev-csp',
    configResolved(config) {
      isServe = config.command === 'serve';
    },
    transformIndexHtml(html) {
      if (!isServe) return html;
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:*");
    }
  };
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // NDI sending runs on a worker thread (see src/main/ndi).
          ndiWorker: resolve(__dirname, 'src/main/ndi/ndiWorker.ts')
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/preload/main.ts'),
          research: resolve(__dirname, 'src/preload/research.ts'),
          outputPage: resolve(__dirname, 'src/preload/outputPage.ts'),
          audioTap: resolve(__dirname, 'src/preload/audioTap.ts')
        },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), devCspRelaxation()],
    build: {
      minify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
          output: resolve(__dirname, 'src/renderer/output.html')
        }
      }
    }
  }
});
