/**
 * Codex 全局提示词资产接口（server/codexAssetsPlugin.ts）。
 */

export type CodexAssetStatusLevel =
  | "active"
  | "conditional"
  | "inactive"
  | "auto"
  | "config";

export interface CodexAssetStatus {
  level: CodexAssetStatusLevel;
  label: string;
  reason: string;
}

export interface CodexAssetFile {
  key: string;
  name: string;
  path: string;
  displayPath: string;
  exists: boolean;
  size: number;
  mtime: number | null;
  editable: boolean;
  status: CodexAssetStatus;
}

export interface CodexAssetGroup {
  id: string;
  name: string;
  description: string;
  files: CodexAssetFile[];
}

export interface CodexAssetsOverview {
  codexHome: string;
  codexHomeDisplay: string;
  config: {
    modelInstructionsFile: string | null;
    developerInstructions: string | null;
    compactPrompt: string | null;
    experimentalCompactPromptFile: string | null;
    projectDocMaxBytes: string | null;
    sandboxMode: string | null;
    approvalPolicy: string | null;
  };
  security: {
    sandboxMode: string | null;
    approvalPolicy: string | null;
    windowsSandbox: string | null;
    rules: { allow: number; deny: number; ask: number };
    trustedProjects: string[];
    preToolUseHooks: number;
  };
  groups: CodexAssetGroup[];
  fileCount: number;
}

export interface CodexAssetContent {
  key: string;
  path: string;
  displayPath: string;
  size: number;
  mtime: number;
  content: string;
}

export interface CodexAssetBackup {
  id: string;
  key: string;
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
    throw new Error("连不上本地资产后端，请用 pnpm dev 启动界面");
  }
  const data = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(data?.error || `请求失败（HTTP ${response.status}）`);
  }
  if (!data) throw new Error("本地资产后端不可用，请用 pnpm dev 启动界面");
  return data as T;
}

export const codexAssetsApi = {
  overview(): Promise<CodexAssetsOverview> {
    return request("/api/codex-assets/overview");
  },

  readFile(key: string): Promise<CodexAssetContent> {
    return request(`/api/codex-assets/file?key=${encodeURIComponent(key)}`);
  },

  saveFile(
    key: string,
    content: string,
  ): Promise<{ backupId: string; overview: CodexAssetsOverview }> {
    return request("/api/codex-assets/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, content }),
    });
  },

  backups(): Promise<CodexAssetBackup[]> {
    return request("/api/codex-assets/backups");
  },

  restore(
    backupId: string,
  ): Promise<{ overview: CodexAssetsOverview }> {
    return request("/api/codex-assets/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backupId }),
    });
  },
};

export function formatAssetSize(size: number): string {
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatAssetTime(timestamp: number | null): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}
