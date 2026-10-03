import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Keeps API calls same-origin in dev so the `fb_session` cookie and the
    // API's Origin check (CL-E9) both see http://localhost:5173, matching
    // the documented WEB_ORIGIN default (STANDARDS §1.2, FB-02 spec §9).
    proxy: {
      '/v1': {
        target: process.env['VITE_API_PROXY_TARGET'] ?? 'http://localhost:3000',
      },
    },
  },
});
