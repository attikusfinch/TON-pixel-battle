import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function basePathFromEnv() {
  const rawBasePath = process.env.VITE_BASE_PATH?.trim();
  if (!rawBasePath || rawBasePath === '/') {
    return '/';
  }
  return `/${rawBasePath.replace(/^\/+|\/+$/g, '')}/`;
}

export default defineConfig({
  base: basePathFromEnv(),
  plugins: [react()],
  server: {
    port: 5173,
  },
});
