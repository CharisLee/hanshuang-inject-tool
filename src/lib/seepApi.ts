/**
 * Seep 逆向工具桥接接口（由 server/seepPlugin.ts 提供）。
 * 只在 `pnpm dev` / `pnpm preview` 下可用；纯静态部署时这里会报错。
 */

export interface SeepSchema {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  anyOf?: SeepSchema[];
  items?: SeepSchema;
}

export interface SeepTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, SeepSchema>;
    required?: string[];
  };
}

export interface SeepOverview {
  root: string;
  serverFile: string;
  python: string;
  ready: boolean;
  running: boolean;
  server?: { name?: string; version?: string } | null;
  tools: SeepTool[];
  error?: string;
  stderr?: string;
}

export interface SeepCallResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
  stderr?: string;
  elapsedMs?: number;
}

export interface SeepTarget {
  app: string;
  label: string;
  supported: boolean;
  path: string;
  exists: boolean;
  installed: boolean;
  /** 已接入，而且指向当前配置的 Seep 目录 */
  matches?: boolean;
  note?: string;
  error?: string;
}

export interface SeepRegisterResult {
  app: string;
  ok: boolean;
  changed?: boolean;
  backup?: string | null;
  error?: string;
}

export interface SeepRegisterResponse {
  results: SeepRegisterResult[];
  targets: SeepTarget[];
  backupDir: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("连不上本地后端，请用 pnpm dev 启动界面");
  }

  const data = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(data?.error || `请求失败（HTTP ${response.status}）`);
  }
  if (!data) {
    throw new Error("本地后端不可用，请用 pnpm dev 启动界面");
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

export const seepApi = {
  overview(refresh = false): Promise<SeepOverview> {
    return request(`/api/seep/overview${refresh ? "?refresh=1" : ""}`);
  },
  setRoot(root: string): Promise<SeepOverview> {
    return post("/api/seep/root", { root });
  },
  call(
    name: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<SeepCallResponse> {
    return post("/api/seep/call", { name, arguments: args, timeoutMs });
  },
  targets(): Promise<{ targets: SeepTarget[]; backupDir: string }> {
    return request("/api/seep/targets");
  },
  register(apps: string[], enabled: boolean): Promise<SeepRegisterResponse> {
    return post("/api/seep/register", { apps, enabled });
  },
};

/** 从 tools/call 的返回里取可读文本。 */
export function resultText(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const record = result as Record<string, unknown>;
    const content = Array.isArray(record.content) ? record.content : [];
    const texts = content
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const block = item as Record<string, unknown>;
        return block.type === "text" && typeof block.text === "string"
          ? block.text
          : "";
      })
      .filter(Boolean);
    if (texts.length > 0) return texts.join("\n");
    if (typeof record.structuredContent === "object" && record.structuredContent) {
      const structured = record.structuredContent as Record<string, unknown>;
      if (typeof structured.result === "string") return structured.result;
      return JSON.stringify(structured, null, 2);
    }
  }
  return JSON.stringify(result, null, 2);
}
