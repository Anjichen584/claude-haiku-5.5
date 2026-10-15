import { defineConfig } from 'vite';

// Explicit opt-in for hosted development; never accept arbitrary Host headers.
const sandbox = process.env.SANDBOX_PREVIEW === '1';

export default defineConfig({
  // 相对路径：产物可以放在任意目录，也便于离线单文件打包（见 scripts/build-standalone.mjs）
  base: './',
  server: {
    host: sandbox ? '0.0.0.0' : '127.0.0.1',
    port: 5173,
    // 沙箱预览域名需要放行，否则 Vite 返回 403
    allowedHosts: sandbox ? ['.e2b.app'] : [],
  },
  preview: {
    host: sandbox ? '0.0.0.0' : '127.0.0.1',
    port: 4173,
    allowedHosts: sandbox ? ['.e2b.app'] : [],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
});
