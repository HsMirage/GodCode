import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{js,ts,tsx}'],
    exclude: [
      'node_modules/',
      '**/node_modules/**',
      'dist/',
      'out/',
      '参考项目/**',
      'tests/e2e/**',
      'experiments/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 20,
        functions: 20,
        branches: 10,
        statements: 20
      },
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.ts',
        'dist/',
        'out/',
        'src/main/index.ts',
        'src/preload/',
        '参考项目/'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@main': path.resolve(__dirname, './src/main'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared')
    }
  }
})
