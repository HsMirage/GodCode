import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import type { Plugin } from 'vite'

// Plugin to remove crossorigin attribute from HTML (fixes file:// protocol issues)
function removeCrossorigin(): Plugin {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '')
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@main': resolve(__dirname, 'src/main'),
        '@types': resolve(__dirname, 'src/types')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@main': resolve(__dirname, 'src/main'),
        '@types': resolve(__dirname, 'src/types')
      }
    },
    build: {
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'src/main/preload.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    plugins: [react(), removeCrossorigin()],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@types': resolve(__dirname, 'src/types')
      }
    },
    build: {
      cssCodeSplit: false,
      modulePreload: {
        polyfill: false
      },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        output: {
          format: 'es'
        }
      }
    }
  }
})
