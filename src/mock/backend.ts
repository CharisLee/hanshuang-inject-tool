/**
 * 假后端：按命令名返回演示数据。
 * - 具体命令的数据写在 handlers 里（按页面分文件，见 ./handlers/*）；
 * - 没写到的命令按名字给一个「空」值（列表给 []、判断给 false、其余给 null），
 *   并在控制台打一条 [mock]，方便以后照着补。
 */
import { handlers } from "./handlers";

export type MockArgs = Record<string, unknown>;
export type MockHandler = (args: MockArgs) => unknown;

/** 模拟一点后端延迟，加载状态和动画才看得到；太长会拖慢翻页 */
const LATENCY_MS = 60;

const reported = new Set<string>();

export async function handleCommand(cmd: string, args: MockArgs) {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  const handler = handlers[cmd];
  if (handler) {
    const result = await handler(args);
    // 返回副本：页面改了拿到的对象，不能顺带改掉假后端里存的数据
    return result === undefined ? null : structuredClone(result);
  }
  if (!reported.has(cmd)) {
    reported.add(cmd);
    console.info("[mock] 未模拟的命令：", cmd, args);
  }
  return fallback(cmd);
}

function fallback(cmd: string): unknown {
  if (cmd.startsWith("plugin:")) return pluginFallback(cmd);
  if (/^(list_|scan_|get_all_|search_|discover_)/.test(cmd)) return [];
  if (/^(is_|has_|check_|can_|should_)/.test(cmd)) return false;
  return null;
}

/** Tauri 插件命令：窗口、应用信息、路径、日志、对话框、进程、更新 */
function pluginFallback(cmd: string): unknown {
  switch (cmd) {
    case "plugin:app|version":
      return "1.0.0";
    case "plugin:app|name":
      return "寒霜注入工具";
    case "plugin:app|tauri_version":
      return "2.10.1";
    case "plugin:app|identifier":
      return "com.hanshuang.inject";
    case "plugin:window|scale_factor":
      return window.devicePixelRatio || 1;
    case "plugin:window|inner_size":
    case "plugin:window|outer_size":
      return { width: window.innerWidth, height: window.innerHeight };
    case "plugin:window|inner_position":
    case "plugin:window|outer_position":
      return { x: 0, y: 0 };
    case "plugin:window|theme":
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    case "plugin:path|resolve_directory":
      return "/Users/demo";
    case "plugin:updater|check":
      return null;
  }
  if (cmd.startsWith("plugin:window|is_")) return false;
  return null;
}
