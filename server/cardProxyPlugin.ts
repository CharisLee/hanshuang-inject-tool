/**
 * 人物卡注入代理（Codex 先行）。
 *
 * 链路：
 *   Codex ──/v1/responses──▶ 本插件(5190) ──注入 instructions──▶ 原上游(15721) ──▶ 模型
 *
 * Codex 的 base_url 改成本工具的 /v1 后，每个 Responses 请求都会先读
 * ~/.cc-switch/prompt-cards.json 里当前选中的卡，按 append / override 改写
 * instructions，再原样转发给原来的上游（默认 http://127.0.0.1:15721）。
 *
 * 只做本地开发用：请求体不落盘，只记录卡名 / 协议 / 是否注入等元信息。
 */
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { parse as parseToml } from "smol-toml";
import {
  injectCard,
  type PromptCard,
  type Protocol,
} from "./promptCardsPlugin";

const HOME = process.env.HANSHUANG_HOME || os.homedir();
const CARDS_FILE = path.join(HOME, ".cc-switch", "prompt-cards.json");
const CODEX_CONFIG = path.join(HOME, ".codex", "config.toml");
const STATE_FILE = path.join(HOME, ".cc-switch", "card-proxy.json");
const BACKUP_DIR = path.join(HOME, ".cc-switch", "backups", "card-proxy");
const LOG_FILE = path.join(HOME, ".cc-switch", "card-proxy.log");

const PROXY_PORT = Number(process.env.CARD_PROXY_PORT || 5190);
// Vite 默认可能只监听 localhost（IPv6 ::1），用 localhost 比 127.0.0.1 稳。
const PROXY_BASE_URL =
  process.env.CARD_PROXY_PUBLIC_URL || `http://localhost:${PROXY_PORT}/v1`;
const DEFAULT_UPSTREAM =
  process.env.CARD_PROXY_UPSTREAM || "http://127.0.0.1:15721/v1";
const MAX_BODY = 64 * 1024 * 1024;

interface ProxyState {
  /** 接入前的 Codex base_url（如 http://127.0.0.1:15721/v1） */
  originalBaseUrl?: string;
  enabledAt?: number;
}

interface LastInjection {
  at: number;
  path: string;
  protocol: Protocol;
  cardId: string;
  cardName: string;
  injected: boolean;
  skipped: string | null;
  instructionsLength: number;
  containsCard: boolean;
  instructionsAfter: string;
  /** 注入内容在末尾，单独留一段方便界面展示 */
  instructionsTail: string;
}

let lastInjection: LastInjection | null = null;

// ───────────────────────────── 状态与卡片 ─────────────────────────────

async function readState(): Promise<ProxyState> {
  try {
    const text = await fsp.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(text) as ProxyState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeState(state: ProxyState) {
  await fsp.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fsp.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

async function readCurrentCard(): Promise<PromptCard | null> {
  try {
    const text = await fsp.readFile(CARDS_FILE, "utf8");
    const store = JSON.parse(text) as {
      currentId?: string | null;
      cards?: PromptCard[];
    };
    const card = (store.cards ?? []).find(
      (item) => item.id === store.currentId,
    );
    if (!card || card.enabled === false) return null;
    return card;
  } catch {
    return null;
  }
}

async function upstreamBase(): Promise<string> {
  const state = await readState();
  return state.originalBaseUrl || DEFAULT_UPSTREAM;
}

// ───────────────────────────── Codex 配置读写 ─────────────────────────────

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface CodexInfo {
  configPath: string;
  providerId: string | null;
  baseUrl: string | null;
  usingProxy: boolean;
  originalBaseUrl: string | null;
  error?: string;
}

async function readCodexInfo(): Promise<CodexInfo> {
  let text = "";
  try {
    text = await fsp.readFile(CODEX_CONFIG, "utf8");
  } catch (error) {
    return {
      configPath: CODEX_CONFIG,
      providerId: null,
      baseUrl: null,
      usingProxy: false,
      originalBaseUrl: (await readState()).originalBaseUrl ?? null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const parsed = parseToml(text) as Record<string, unknown>;
    const providerId =
      typeof parsed.model_provider === "string" ? parsed.model_provider : null;
    const providers =
      parsed.model_providers && typeof parsed.model_providers === "object"
        ? (parsed.model_providers as Record<string, unknown>)
        : {};
    const provider =
      providerId && providers[providerId] && typeof providers[providerId] === "object"
        ? (providers[providerId] as Record<string, unknown>)
        : {};
    const baseUrl =
      typeof provider.base_url === "string" ? provider.base_url : null;
    const state = await readState();
    return {
      configPath: CODEX_CONFIG,
      providerId,
      baseUrl,
      usingProxy: baseUrl != null &&
        normalizeUrl(baseUrl) === normalizeUrl(PROXY_BASE_URL),
      originalBaseUrl: state.originalBaseUrl ?? null,
    };
  } catch (error) {
    return {
      configPath: CODEX_CONFIG,
      providerId: null,
      baseUrl: null,
      usingProxy: false,
      originalBaseUrl: (await readState()).originalBaseUrl ?? null,
      error: `解析 config.toml 失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function backupCodexConfig(): Promise<string | null> {
  try {
    await fsp.access(CODEX_CONFIG);
  } catch {
    return null;
  }
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const backup = path.join(
    BACKUP_DIR,
    `${Date.now()}-config.toml`,
  );
  await fsp.copyFile(CODEX_CONFIG, backup);
  return backup;
}

async function writeCodexConfig(text: string) {
  await fsp.mkdir(path.dirname(CODEX_CONFIG), { recursive: true });
  const temp = `${CODEX_CONFIG}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(temp, text, "utf8");
  try {
    await fsp.rename(temp, CODEX_CONFIG);
  } catch {
    await fsp.rm(CODEX_CONFIG, { force: true });
    await fsp.rename(temp, CODEX_CONFIG);
  }
}

/**
 * 在 [model_providers.<id>] 段里替换 base_url，保留注释和其他配置。
 * 找不到 base_url 时插到段头下面。
 */
function replaceProviderBaseUrl(
  text: string,
  providerId: string,
  nextBaseUrl: string,
): string {
  const lines = text.split("\n");
  const headerRe = new RegExp(
    `^\\s*\\[model_providers\\.${escapeRegExp(providerId)}\\]\\s*$`,
  );
  const sectionStart = lines.findIndex((line) => headerRe.test(line));
  if (sectionStart < 0) {
    throw new Error(`config.toml 里找不到 [model_providers.${providerId}]`);
  }
  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    if (/^\s*\[/.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }
  const baseUrlRe = /^(\s*base_url\s*=\s*)(["'])(.*?)\2(\s*(?:#.*)?)$/;
  for (let i = sectionStart + 1; i < sectionEnd; i += 1) {
    const match = lines[i].match(baseUrlRe);
    if (match) {
      lines[i] = `${match[1]}"${nextBaseUrl}"${match[4]}`;
      return lines.join("\n");
    }
  }
  // 没有 base_url：插到段头下面
  lines.splice(sectionStart + 1, 0, `base_url = "${nextBaseUrl}"`);
  return lines.join("\n");
}

async function enableCodexProxy(): Promise<CodexInfo> {
  const info = await readCodexInfo();
  if (!info.providerId) {
    throw new Error("config.toml 里没有 model_provider，无法定位 provider");
  }
  if (!info.baseUrl) {
    throw new Error(
      `config.toml 的 [model_providers.${info.providerId}] 没有 base_url`,
    );
  }
  if (info.usingProxy) return info;

  const state = await readState();
  await writeState({
    ...state,
    originalBaseUrl: info.baseUrl,
    enabledAt: state.enabledAt ?? Date.now(),
  });
  const text = await fsp.readFile(CODEX_CONFIG, "utf8");
  await backupCodexConfig();
  await writeCodexConfig(
    replaceProviderBaseUrl(text, info.providerId, PROXY_BASE_URL),
  );
  return await readCodexInfo();
}

async function restoreCodexProxy(): Promise<CodexInfo> {
  const info = await readCodexInfo();
  const state = await readState();
  if (!info.providerId) {
    throw new Error("config.toml 里没有 model_provider，无法定位 provider");
  }
  if (!state.originalBaseUrl) {
    throw new Error("没有找到接入前的 Codex 地址，无法恢复");
  }
  const text = await fsp.readFile(CODEX_CONFIG, "utf8");
  await backupCodexConfig();
  await writeCodexConfig(
    replaceProviderBaseUrl(text, info.providerId, state.originalBaseUrl),
  );
  await writeState({ ...state, originalBaseUrl: undefined, enabledAt: undefined });
  return await readCodexInfo();
}

// ───────────────────────────── 注入代理 ─────────────────────────────

function protocolFor(
  pathname: string,
  body: Record<string, unknown> | null,
): Protocol | null {
  if (pathname.includes("/responses")) return "openai_responses";
  if (pathname.includes("/chat/completions")) return "openai_chat";
  if (pathname.includes("/messages")) return "anthropic";
  if (body) {
    if (typeof body.instructions === "string") return "openai_responses";
    if (Array.isArray(body.messages)) return "openai_chat";
    if (body.system != null) return "anthropic";
  }
  return null;
}

function responseTextAfterInjection(
  body: Record<string, unknown>,
  protocol: Protocol,
): string {
  if (protocol === "openai_responses") {
    return typeof body.instructions === "string" ? body.instructions : "";
  }
  if (protocol === "anthropic") {
    if (typeof body.system === "string") return body.system;
    if (Array.isArray(body.system)) {
      return body.system
        .map((block) =>
          block && typeof block === "object" && typeof (block as Record<string, unknown>).text === "string"
            ? String((block as Record<string, unknown>).text)
            : "",
        )
        .filter(Boolean)
        .join("\n");
    }
    return "";
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages
    .filter(
      (msg) =>
        msg &&
        typeof msg === "object" &&
        ((msg as Record<string, unknown>).role === "system" ||
          (msg as Record<string, unknown>).role === "developer"),
    )
    .map((msg) => String((msg as Record<string, unknown>).content ?? ""))
    .join("\n");
}

async function logInjection(entry: LastInjection) {
  const line = JSON.stringify({
    at: new Date(entry.at).toISOString(),
    path: entry.path,
    protocol: entry.protocol,
    card: entry.cardName,
    cardId: entry.cardId,
    injected: entry.injected,
    skipped: entry.skipped,
  });
  try {
    await fsp.mkdir(path.dirname(LOG_FILE), { recursive: true });
    await fsp.appendFile(LOG_FILE, `${line}\n`, "utf8");
  } catch {
    // 日志失败不影响代理
  }
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY) throw new Error("请求体超过 64 MB");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

async function handleProxy(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  let raw: Buffer;
  try {
    raw = await readRawBody(req);
  } catch (error) {
    sendJson(res, 413, {
      error: { message: error instanceof Error ? error.message : String(error) },
    });
    return;
  }

  let body: Record<string, unknown> | null = null;
  let payload = raw;
  let injected = false;
  let skipped: string | null = null;
  let protocol: Protocol | null = null;
  const card = await readCurrentCard();

  if (raw.length > 0) {
    try {
      const parsed = JSON.parse(raw.toString("utf8")) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      // 非 JSON（理论上 Codex 不会发）原样转发
    }
  }

  if (body && card) {
    protocol = protocolFor(url.pathname, body);
    if (protocol) {
      const result = injectCard(body, card, protocol);
      injected = result.injected;
      skipped = result.skipped;
      if (result.injected) {
        body = result.body;
        payload = Buffer.from(JSON.stringify(body), "utf8");
      }
      const instructions = responseTextAfterInjection(body, protocol);
      lastInjection = {
        at: Date.now(),
        path: url.pathname,
        protocol,
        cardId: card.id,
        cardName: card.name,
        injected,
        skipped,
        instructionsLength: instructions.length,
        containsCard: instructions.includes(`cc-switch-card:${card.id}`),
        instructionsAfter: instructions.slice(0, 4000),
        instructionsTail: instructions.slice(-1200),
      };
      void logInjection(lastInjection);
    }
  }

  const upstream = await upstreamBase();
  let target: URL;
  try {
    target = new URL(upstream);
  } catch {
    sendJson(res, 502, {
      error: { message: `上游地址无效：${upstream}` },
    });
    return;
  }

  // 把 /v1/... 映射到原始 base_url 的路径前缀。
  const prefix = target.pathname.replace(/\/+$/, "");
  let forwardPath = url.pathname;
  if (prefix && prefix !== "/v1" && url.pathname.startsWith("/v1")) {
    forwardPath = prefix + url.pathname.slice("/v1".length);
  }
  forwardPath += url.search;

  const headers: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (
      [
        "host",
        "connection",
        "content-length",
        "transfer-encoding",
        "keep-alive",
        "proxy-connection",
        "upgrade",
      ].includes(lower)
    ) {
      continue;
    }
    headers[key] = value;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    headers["content-length"] = String(payload.length);
  }

  const client = target.protocol === "https:" ? https : http;
  const proxyReq = client.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      method: req.method,
      path: forwardPath,
      headers,
    },
    (proxyRes) => {
      res.statusCode = proxyRes.statusCode ?? 502;
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (value === undefined) continue;
        if (["connection", "transfer-encoding"].includes(key.toLowerCase())) {
          continue;
        }
        try {
          res.setHeader(key, value as string | string[]);
        } catch {
          // 个别非法头忽略
        }
      }
      res.setHeader("x-hanshuang-injected", injected ? "1" : "0");
      if (card) res.setHeader("x-hanshuang-card-id", card.id);
      proxyRes.pipe(res);
    },
  );

  proxyReq.setTimeout(10 * 60 * 1000, () => {
    proxyReq.destroy(new Error("上游请求超时（10 分钟）"));
  });
  proxyReq.on("error", (error) => {
    if (!res.headersSent) {
      sendJson(res, 502, {
        error: {
          message: `注入代理转发失败：${error.message}`,
          type: "proxy_error",
        },
      });
    } else {
      res.destroy(error);
    }
  });
  res.on("close", () => {
    if (!res.writableEnded) proxyReq.destroy();
  });
  if (payload.length > 0) proxyReq.write(payload);
  proxyReq.end();
}

// ───────────────────────────── HTTP API ─────────────────────────────

async function statusPayload() {
  const card = await readCurrentCard();
  return {
    proxyBaseUrl: PROXY_BASE_URL,
    upstream: await upstreamBase(),
    backupDir: BACKUP_DIR,
    card: card
      ? {
          id: card.id,
          name: card.name,
          mode: card.mode,
          tokenEstimate: card.tokenEstimate,
        }
      : null,
    lastInjection,
    codex: await readCodexInfo(),
  };
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readRawBody(req);
  if (raw.length === 0) return {};
  return JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/card-proxy")) return false;

  try {
    if (req.method === "GET" && url.pathname === "/api/card-proxy/status") {
      sendJson(res, 200, await statusPayload());
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/card-proxy/codex") {
      const body = await readJsonBody(req);
      const action = typeof body.action === "string" ? body.action : "";
      if (action === "enable") {
        await enableCodexProxy();
      } else if (action === "restore") {
        await restoreCodexProxy();
      } else {
        throw new Error("action 只能是 enable 或 restore");
      }
      sendJson(res, 200, await statusPayload());
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/card-proxy/dry-run") {
      const body = await readJsonBody(req);
      const protocol =
        body.protocol === "openai_chat" ||
        body.protocol === "anthropic" ||
        body.protocol === "openai_responses"
          ? (body.protocol as Protocol)
          : "openai_responses";
      const payload =
        body.body && typeof body.body === "object"
          ? (body.body as Record<string, unknown>)
          : {};
      const card = await readCurrentCard();
      const result = injectCard(payload, card, protocol);
      sendJson(res, 200, {
        card: card ? { id: card.id, name: card.name, mode: card.mode } : null,
        protocol,
        before: payload,
        after: result.body,
        injected: result.injected,
        skipped: result.skipped,
      });
      return true;
    }

    sendJson(res, 404, { error: "Not found" });
    return true;
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

// ───────────────────────────── Vite 插件 ─────────────────────────────

export function cardProxyPlugin(): Plugin {
  const install = (server: {
    middlewares: {
      use: (
        handler: (
          req: IncomingMessage,
          res: ServerResponse,
          next: () => void,
        ) => void,
      ) => void;
    };
  }) => {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname.startsWith("/api/card-proxy")) {
        void handleApi(req, res, url).then((handled) => {
          if (!handled) next();
        });
        return;
      }
      if (url.pathname === "/v1" || url.pathname.startsWith("/v1/")) {
        void handleProxy(req, res, url);
        return;
      }
      next();
    });
  };

  return {
    name: "hanshuang-card-proxy",
    configureServer(server) {
      install(server);
    },
    configurePreviewServer(server) {
      install(server);
    },
  };
}
