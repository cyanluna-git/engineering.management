import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_APP_BASE || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          if (id.includes('recharts')) {
            return 'charts-vendor'
          }

          if (
            id.includes('react-markdown') ||
            id.includes('remark-gfm') ||
            id.includes('/unified/') ||
            id.includes('/remark-') ||
            id.includes('/rehype-') ||
            id.includes('/mdast-') ||
            id.includes('/micromark/')
          ) {
            return 'markdown-vendor'
          }

          if (
            id.includes('i18next') ||
            id.includes('react-i18next')
          ) {
            return 'i18n-vendor'
          }

          if (
            id.includes('@radix-ui') ||
            id.includes('lucide-react')
          ) {
            return 'ui-vendor'
          }

          if (
            id.includes('react-router-dom') ||
            id.includes('@tanstack/react-query') ||
            id.includes('react-dom') ||
            id.match(/node_modules\/react\//)
          ) {
            return 'app-vendor'
          }
        },
      },
    },
  },
  server: {
    port: 3004,
    host: '0.0.0.0',
    // Allow the canonical portal and EOB hosts in local dev.
    allowedHosts: [
      'eob.atlascopco.group',
      'pcas-portal.atlascopco.group',
      'eob.10.182.252.32.sslip.io',
      'pcas-portal.10.182.252.32.sslip.io',
      'VTISAZUAPP218',
      'localhost',
      '127.0.0.1',
    ],
    watch: {
      usePolling: true,
      interval: 100,
    },
    hmr: {
      overlay: true,
      ...(process.env.VITE_HMR_CLIENT_PORT
        ? { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) }
        : {}),
    },
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:8004',
        changeOrigin: true,
      },
    },
  },
  logLevel: 'info',
})
