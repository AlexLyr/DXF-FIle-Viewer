import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./manifest.json";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [crx({ manifest })],
  assetsInclude: ["**/*.wasm"],
  resolve: {
    alias: [
      {
        // dxf-render imports this path directly; three@0.161 has no FXAAPass file.
        find: /^three\/addons\/postprocessing\/FXAAPass\.js$/,
        replacement: path.resolve(projectRoot, "src/shims/FXAAPass.ts"),
      },
      {
        // three@0.161 has FXAAShader but no FXAAPass class.
        find: /^three\/examples\/jsm\/postprocessing\/FXAAPass\.js$/,
        replacement: path.resolve(projectRoot, "src/shims/FXAAPass.ts"),
      },
      {
        // dxf-render imports postprocessing from "three/addons/*"
        // while our pinned three version exposes those files under examples/jsm.
        find: /^three\/addons\/(.*)$/,
        replacement: "three/examples/jsm/$1",
      },
    ],
  },
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
        dwgSandbox: "src/sandbox/dwg-sandbox.html",
      },
      output: {
        compact: true,
      },
    },
  },
});
