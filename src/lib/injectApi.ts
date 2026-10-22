/**
 * 提示词注入的本地后端接口（由 server/injectApiPlugin.ts 提供）。
 * 只在 `pnpm dev` / `pnpm preview` 下可用；纯静态部署时这里会报错。
 */

export interface InjectTarget {
  id: string;
  name: string;
  description: string;
  path: string;
  displayPath: string;
  exists: boolean;
  size: number;
  mtime: number | null;
  content: string;
  active: boolean;
  injected: boolean;
  installedAt: number | null;
  /** 只有需要改配置文件的目标（Codex 的系统提示替换）才有 */
  configPath: string | null;
}

export interface InjectBackup {
  id: string;
  app: string;
  target: string;
  targetName: string;
  originalPath: string;
  originalExisted: boolean;
  createdAt: number;
  size: number;
  file: string;
}

export interface InjectOverview {
  app: string;
  appName: string;
  homeDir: string;
  homeDirDisplay: string;
  /** Codex 的 config.toml 里 model_instructions_file 当前的值 */
  configValue: string | null;
  configValueDisplay: string | null;
  targets: InjectTarget[];
  backups: InjectBackup[];
}

export interface InjectApp {
  id: string;
  name: string;
  targetCount: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("连不上本地注入后端，请用 pnpm dev 启动界面");
  }

  const data = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(data?.error || `请求失败（HTTP ${response.status}）`);
  }
  if (!data) {
    throw new Error("本地注入后端不可用，请用 pnpm dev 启动界面");
  }
  return data as T;
}

function post<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const injectApi = {
  apps(): Promise<InjectApp[]> {
    return request("/api/inject/apps");
  },

  overview(app: string): Promise<InjectOverview> {
    return request(`/api/inject/${app}/overview`);
  },

  apply(
    app: string,
    target: string,
    content: string,
    mode: "replace" | "append" = "replace",
  ): Promise<InjectOverview> {
    return post(`/api/inject/${app}/apply`, { target, content, mode });
  },

  disable(app: string, target: string): Promise<InjectOverview> {
    return post(`/api/inject/${app}/disable`, { target });
  },

  restore(
    app: string,
    backupId: string,
  ): Promise<{ overview: InjectOverview }> {
    return post(`/api/inject/${app}/restore`, { backupId });
  },
};

export function formatBytes(size: number): string {
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTime(timestamp: number | null): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}
