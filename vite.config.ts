import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: "es2022",
    sourcemap: false,
    cssMinify: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 1500,
    modulePreload: { polyfill: false },
    minify: "terser",
    terserOptions: {
      ecma: 2020,
      compress: {
        passes: 3,
        drop_debugger: true,
        pure_funcs: [
          "console.log",
          "console.debug",
          "console.info",
          "console.warn",
          "console.trace",
        ],
        pure_getters: "strict",
        hoist_funs: true,
      },
      mangle: {
        toplevel: true,
        properties: false,
      },
      format: {
        comments: false,
        ecma: 2020,
      },
    },
    rollupOptions: {
      input: {
        viewer: "src/viewer/viewer.html",
      },
      output: {
        compact: true,
      },
    },
  },
});
