import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径：产物可以放在任意目录，也便于离线单文件打包（见 scripts/build-standalone.mjs）
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    // 沙箱预览域名需要放行，否则 Vite 返回 403
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
});
