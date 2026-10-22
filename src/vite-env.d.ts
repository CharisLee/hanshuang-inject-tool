/// <reference types="vite/client" />

declare global {
  /** 由 vite.config.ts 的 define 注入，来自 package.json 的 version。 */
  const __APP_VERSION__: string;
}

export {};
