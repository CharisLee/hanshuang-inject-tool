/**
 * 浏览器演示模式：没有 Tauri 后端时，用假数据接住所有后端调用（invoke / 事件 / 窗口）。
 *
 * 必须是 main.tsx 的第一个 import：别的模块一加载就会读窗口信息、订阅后端事件，
 * 晚一步就会报「__TAURI_INTERNALS__ 不存在」。
 * 在真正的 Tauri 窗口里（打包成桌面程序时）这里什么都不做，调用照常走 Rust 后端。
 */
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { handleCommand } from "./backend";

export const IS_MOCK_BACKEND =
  typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

if (IS_MOCK_BACKEND) {
  mockWindows("main");
  mockIPC(
    (cmd, args) =>
      handleCommand(cmd, (args ?? {}) as Record<string, unknown>),
    { shouldMockEvents: true },
  );

  // 用量页启动时会去 models.dev 拉模型价格表：演示版不联网，直接给空表
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.startsWith("https://models.dev/")) {
      return Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return realFetch(input, init);
  };
}
