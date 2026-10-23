import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { breadBookPlugin } from './server/plugin.js';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), breadBookPlugin(root)],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
