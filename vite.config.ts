import path from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { injectApiPlugin } from "./server/injectApiPlugin";
import { promptLibraryPlugin } from "./server/promptLibraryPlugin";
import { codexAssetsPlugin } from "./server/codexAssetsPlugin";
import { promptCardsPlugin } from "./server/promptCardsPlugin";
import { seepPlugin } from "./server/seepPlugin";
import { cardProxyPlugin } from "./server/cardProxyPlugin";

const packageVersion = (
  JSON.parse(
    readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
  ) as { version: string }
).version;

export default defineConfig(({ command }) => ({
  root: "src",
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
  },
  plugins: [
    command === "serve" &&
      codeInspectorPlugin({
        bundler: "vite",
      }),
    react(),
    injectApiPlugin(),
    promptLibraryPlugin(),
    codexAssetsPlugin(),
    promptCardsPlugin(),
    seepPlugin(),
    cardProxyPlugin(),
  ].filter(Boolean),
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      // 托盘面板是单独的入口，不加载主界面
      input: {
        main: path.resolve(__dirname, "src/index.html"),
        "tray-panel": path.resolve(__dirname, "src/tray-panel.html"),
      },
    },
  },
  server: {
    port: 5190,
    strictPort: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
}));
