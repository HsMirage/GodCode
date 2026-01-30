// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
var __electron_vite_injected_dirname = "/mnt/d/\u7F51\u7AD9/CodeAll";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src"),
        "@main": resolve(__electron_vite_injected_dirname, "src/main"),
        "@types": resolve(__electron_vite_injected_dirname, "src/types")
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/main/index.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src"),
        "@main": resolve(__electron_vite_injected_dirname, "src/main"),
        "@types": resolve(__electron_vite_injected_dirname, "src/types")
      }
    },
    build: {
      rollupOptions: {
        input: {
          preload: resolve(__electron_vite_injected_dirname, "src/main/preload.ts")
        }
      }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": resolve(__electron_vite_injected_dirname, "src/renderer"),
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared"),
        "@types": resolve(__electron_vite_injected_dirname, "src/types")
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/renderer/index.html")
        }
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
