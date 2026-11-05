import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const env = loadEnv(mode, root, '');
  const target = env.DEV_SERVER_TARGET || `http://127.0.0.1:${env.PORT || '2567'}`;
  const proxy = { target, ws: true, changeOrigin: false };
  return {
    plugins: [react(), tailwindcss()],
    envDir: root,
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: (env.DEV_ALLOWED_HOSTS || '')
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean),
      https:
        env.DEV_HTTPS_KEY && env.DEV_HTTPS_CERT
          ? { key: readFileSync(env.DEV_HTTPS_KEY), cert: readFileSync(env.DEV_HTTPS_CERT) }
          : undefined,
      proxy: {
        '/api': proxy,
        '/matchmake': proxy,
        '/health': proxy,
        '^/(?!join/|host/)[a-zA-Z0-9_-]+/[A-Z2-9]{8}': proxy,
      },
    },
    build: {
      target: 'es2022',
      rollupOptions: {
        output: { manualChunks: (id: string) => (id.includes('/phaser/') ? 'phaser' : undefined) },
      },
      chunkSizeWarningLimit: 1600,
    },
  };
});
