/**
 * 人物卡注入代理（Codex）接口。
 * 后端在 server/cardProxyPlugin.ts，只在 `pnpm dev` / `pnpm preview` 下可用。
 */

export interface CardProxyCard {
  id: string;
  name: string;
  mode: string;
  tokenEstimate: number;
}

export interface CardProxyLastInjection {
  at: number;
  path: string;
  protocol: string;
  cardId: string;
  cardName: string;
  injected: boolean;
  skipped: string | null;
  instructionsLength: number;
  containsCard: boolean;
  instructionsAfter: string;
  instructionsTail: string;
}

export interface CardProxyCodexInfo {
  configPath: string;
  providerId: string | null;
  baseUrl: string | null;
  usingProxy: boolean;
  originalBaseUrl: string | null;
  error?: string;
}

export interface CardProxyStatus {
  proxyBaseUrl: string;
  upstream: string;
  backupDir: string;
  card: CardProxyCard | null;
  lastInjection: CardProxyLastInjection | null;
  codex: CardProxyCodexInfo;
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

export const cardProxyApi = {
  status(): Promise<CardProxyStatus> {
    return request("/api/card-proxy/status");
  },
  setCodex(action: "enable" | "restore"): Promise<CardProxyStatus> {
    return request("/api/card-proxy/codex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
  },
};
