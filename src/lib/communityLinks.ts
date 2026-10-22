import { isTauri } from "@tauri-apps/api/core";
import { settingsApi } from "@/lib/api";

export const TELEGRAM_GROUP_URL = "https://t.me/aiyiaou";
export const QQ_GROUP_URL = "https://qm.qq.com/q/Y36tSKcday";
export const RELAY_STATION_URL = "https://api.zxcbug.com/";

/** 浏览器里新标签打开；Tauri 里交给系统浏览器。 */
export function openExternalLink(url: string) {
  if (isTauri()) {
    void settingsApi.openExternal(url).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
