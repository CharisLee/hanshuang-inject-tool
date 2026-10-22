/**
 * 提示词库接口（由 server/promptLibraryPlugin.ts 提供）。
 * 应用页的提示词列表：添加、编辑、删除、切换（写入工具的真实提示词文件）。
 */
import type { AppId } from "@/lib/api";

export interface LibraryPrompt {
  id: string;
  name: string;
  description: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface PromptLibraryOverview {
  app: AppId;
  appName: string;
  path: string;
  displayPath: string;
  exists: boolean;
  size: number;
  mtime: number | null;
  fileContent: string;
  currentId: string | null;
  currentName: string | null;
  prompts: LibraryPrompt[];
  state: { activatedAt: number; originalExisted: boolean } | null;
}

export interface LibraryBackup {
  id: string;
  app: string;
  originalPath: string;
  originalExisted: boolean;
  createdAt: number;
  size: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("连不上本地提示词后端，请用 pnpm dev 启动界面");
  }
  const data = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(data?.error || `请求失败（HTTP ${response.status}）`);
  }
  if (!data) {
    throw new Error("本地提示词后端不可用，请用 pnpm dev 启动界面");
  }
  return data as T;
}

function post<T>(route: string, body: Record<string, unknown>): Promise<T> {
  return request(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const promptLibraryApi = {
  overview(app: AppId): Promise<PromptLibraryOverview> {
    return request(
      `/api/prompt-library/overview?app=${encodeURIComponent(app)}`,
    );
  },

  save(
    app: AppId,
    prompt: { id?: string; name: string; description: string; content: string },
  ): Promise<{ id: string; overview: PromptLibraryOverview }> {
    return post("/api/prompt-library/save", { app, ...prompt });
  },

  remove(app: AppId, id: string): Promise<PromptLibraryOverview> {
    return post("/api/prompt-library/delete", { app, id });
  },

  activate(app: AppId, id: string): Promise<PromptLibraryOverview> {
    return post("/api/prompt-library/activate", { app, id });
  },

  deactivate(app: AppId): Promise<PromptLibraryOverview> {
    return post("/api/prompt-library/deactivate", { app });
  },

  importCurrent(app: AppId): Promise<PromptLibraryOverview> {
    return post("/api/prompt-library/import-current", { app });
  },

  backups(app: AppId): Promise<LibraryBackup[]> {
    return request(
      `/api/prompt-library/backups?app=${encodeURIComponent(app)}`,
    );
  },

  restore(
    backupId: string,
  ): Promise<{ overview: PromptLibraryOverview }> {
    return post("/api/prompt-library/restore", { backupId });
  },
};

export function formatLibraryTime(timestamp: number | null): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

export function formatLibrarySize(size: number): string {
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
