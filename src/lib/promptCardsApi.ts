/**
 * 角色卡后端接口（由 server/promptCardsPlugin.ts 提供）。
 * 只在 `pnpm dev` / `pnpm preview` 下可用；纯静态部署时这里会报错。
 */

export type CardMode = "fill" | "prepend" | "append" | "override";
export type Protocol = "anthropic" | "openai_chat" | "openai_responses";

export interface PromptCard {
  id: string;
  name: string;
  system: string;
  firstMes: string;
  mode: CardMode;
  tokenEstimate: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CardPreview {
  protocol: Protocol;
  label: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  injected: boolean;
  skipped: string | null;
}

export interface PromptCardsOverview {
  file: string;
  fileDisplay: string;
  currentId: string | null;
  cards: PromptCard[];
  modeNotes: Record<CardMode, string>;
  previews: CardPreview[];
}

export interface DryRunResult {
  protocol: Protocol;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  injected: boolean;
  skipped: string | null;
  idempotent: boolean;
}

export interface CardDraft {
  id?: string;
  name: string;
  system: string;
  firstMes: string;
  mode: CardMode;
  enabled: boolean;
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

export const promptCardsApi = {
  overview(): Promise<PromptCardsOverview> {
    return request("/api/prompt-cards/overview");
  },
  save(draft: CardDraft): Promise<PromptCardsOverview> {
    return post("/api/prompt-cards/save", draft);
  },
  remove(id: string): Promise<PromptCardsOverview> {
    return post("/api/prompt-cards/delete", { id });
  },
  select(id: string | null): Promise<PromptCardsOverview> {
    return post("/api/prompt-cards/select", { id });
  },
  dryRun(
    cardId: string | null,
    protocol: Protocol,
    body?: Record<string, unknown>,
  ): Promise<DryRunResult> {
    return post("/api/prompt-cards/dry-run", { cardId, protocol, body });
  },
};

export const MODE_SHORT: Record<CardMode, string> = {
  fill: "fill",
  prepend: "prepend",
  append: "append",
  override: "override",
};

export function formatTime(timestamp: number | null): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

/** 把 system 槽从请求体里摘出来，做前后对比用。 */
export function systemSlotOf(
  body: Record<string, unknown>,
  protocol: Protocol,
): string {
  if (protocol === "openai_responses") {
    return typeof body.instructions === "string" ? body.instructions : "";
  }
  if (protocol === "anthropic") {
    const system = body.system;
    if (typeof system === "string") return system;
    if (Array.isArray(system)) {
      return system
        .map((block) => {
          if (typeof block !== "object" || block === null) return "";
          const record = block as Record<string, unknown>;
          const text = typeof record.text === "string" ? record.text : "";
          const cached = record.cache_control ? "  ← cache_control" : "";
          return `${text}${cached}`;
        })
        .filter(Boolean)
        .join("\n───\n");
    }
    return "";
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages
    .filter((msg): msg is Record<string, unknown> => {
      if (typeof msg !== "object" || msg === null) return false;
      const role = (msg as Record<string, unknown>).role;
      return role === "system" || role === "developer";
    })
    .map((msg) => (typeof msg.content === "string" ? msg.content : ""))
    .filter(Boolean)
    .join("\n───\n");
}

/** 请求体里的消息条数概览，验「user/assistant 必须穿透」。 */
export function roleSummary(
  body: Record<string, unknown>,
  protocol: Protocol,
): string {
  const key = protocol === "openai_responses" ? "input" : "messages";
  const list = Array.isArray(body[key]) ? (body[key] as unknown[]) : [];
  if (list.length === 0) return "—";
  const roles = list.map((item) => {
    if (typeof item !== "object" || item === null) return "?";
    const role = (item as Record<string, unknown>).role;
    return typeof role === "string" ? role : "?";
  });
  return roles.join(" → ");
}
