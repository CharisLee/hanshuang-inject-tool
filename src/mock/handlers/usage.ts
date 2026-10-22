/**
 * 用量统计页 + 应用页的假数据。数字用固定种子生成，每次打开都一样。
 */
import type { MockHandler } from "../backend";
import type { DailyStats, ModelStats, ProviderStats, RequestLog, UsageSummary } from "@/types/usage";

const DAY = 86400;
const nowSec = () => Math.floor(Date.now() / 1000);

/** 固定种子的伪随机数 */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 某一天的请求数：越近越多，周末少一点 */
function dayRequests(dayIndexFromToday: number) {
  const r = seeded(dayIndexFromToday * 7919 + 13)();
  const date = new Date(Date.now() - dayIndexFromToday * DAY * 1000);
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  const ramp = Math.max(0.05, 1 - dayIndexFromToday / 300);
  if (r < 0.08 && dayIndexFromToday > 120) return 0;
  return Math.round((weekend ? 420 : 900) * ramp * (0.5 + r));
}

function summaryFor(days: number, scale = 1): UsageSummary {
  let requests = 0;
  for (let i = 0; i < days; i++) requests += dayRequests(i);
  requests = Math.round(requests * scale);
  const input = requests * 1180;
  const output = requests * 412;
  const cacheRead = requests * 41_000;
  const cacheCreation = requests * 2300;
  return {
    totalRequests: requests,
    totalCost: (requests * 0.0972).toFixed(2),
    totalInputTokens: input,
    totalOutputTokens: output,
    totalCacheCreationTokens: cacheCreation,
    totalCacheReadTokens: cacheRead,
    successRate: 98.9,
    realTotalTokens: input + output + cacheRead + cacheCreation,
    cacheHitRate: cacheRead / (input + cacheCreation + cacheRead),
  };
}

const rangeDays = (args: Record<string, unknown>) => {
  const start = Number(args.startDate ?? nowSec() - 365 * DAY);
  const end = Number(args.endDate ?? nowSec());
  return Math.max(1, Math.ceil((end - start) / DAY));
};

const APP_SHARE: Record<string, number> = { claude: 0.62, codex: 0.21, "claude-desktop": 0.06, gemini: 0.05, grokbuild: 0.03, opencode: 0.03 };
const appScale = (args: Record<string, unknown>) =>
  args.appType ? (APP_SHARE[String(args.appType)] ?? 0.01) : 1;

const PROVIDERS = [
  { providerId: "claude-official", providerName: "Claude Official", appType: "claude", share: 0.48, model: "claude-fable-5-1" },
  { providerId: "claude-kimi", providerName: "Kimi For Coding", appType: "claude", share: 0.14, model: "kimi-for-coding" },
  { providerId: "codex-official", providerName: "OpenAI Official", appType: "codex", share: 0.13, model: "gpt-5.6" },
  { providerId: "codex-deepseek", providerName: "DeepSeek", appType: "codex", share: 0.08, model: "deepseek-v4-pro" },
  { providerId: "desktop-official", providerName: "Claude Official", appType: "claude-desktop", share: 0.06, model: "claude-opus-5-5" },
  { providerId: "gemini-official", providerName: "Google Official", appType: "gemini", share: 0.05, model: "gemini-3.5-pro" },
  { providerId: "grok-official", providerName: "xAI Official", appType: "grokbuild", share: 0.03, model: "grok-4.5" },
  { providerId: "opencode-go", providerName: "OpenCode Go", appType: "opencode", share: 0.03, model: "kimi-k2.7" },
];

/** 一天里各小时的忙闲：上午、下午干活多，夜里很少 */
const HOUR_PROFILE = [1, 0, 0, 0, 0, 0, 1, 2, 4, 9, 12, 11, 6, 7, 11, 12, 12, 10, 8, 6, 5, 4, 3, 2];

function stat(date: string, requests: number): DailyStats {
  const input = requests * 1180;
  const output = requests * 412;
  const cacheRead = requests * 41_000;
  const cacheCreation = requests * 2300;
  return {
    date,
    requestCount: requests,
    totalCost: (requests * 0.0972).toFixed(4),
    totalTokens: input + output + cacheRead + cacheCreation,
    totalInputTokens: input,
    totalOutputTokens: output,
    totalCacheCreationTokens: cacheCreation,
    totalCacheReadTokens: cacheRead,
  };
}

function trends(args: Record<string, unknown>): DailyStats[] {
  const days = rangeDays(args);
  const scale = appScale(args);
  if (days <= 1) {
    // 「当天」按小时出点（时间写 ISO，图表直接 new Date() 解析）
    const start = Number(args.startDate ?? nowSec() - DAY);
    const end = Number(args.endDate ?? nowSec());
    const out: DailyStats[] = [];
    for (let t = start - (start % 3600); t <= end; t += 3600) {
      const hour = new Date(t * 1000).getHours();
      const jitter = 0.7 + seeded(t)() * 0.6;
      out.push(stat(new Date(t * 1000).toISOString(), Math.round(HOUR_PROFILE[hour] * 6 * jitter * scale)));
    }
    return out;
  }
  const out: DailyStats[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * DAY * 1000);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    out.push(stat(key, Math.round(dayRequests(i) * scale)));
  }
  return out;
}

function providerStats(args: Record<string, unknown>): ProviderStats[] {
  const total = summaryFor(rangeDays(args)).totalRequests;
  return PROVIDERS.filter((p) => !args.appType || p.appType === args.appType).map((p, index) => {
    const requests = Math.round(total * p.share);
    return {
      providerId: p.providerId,
      appType: p.appType,
      providerName: p.providerName,
      requestCount: requests,
      totalTokens: requests * 44_900,
      totalCost: (requests * 0.0972).toFixed(2),
      successRate: 99.6 - index * 0.4,
      avgLatencyMs: 1800 + index * 260,
      speedOutputTokens: 412 * requests,
      speedGenerationMs: Math.round((412 * requests * 1000) / (68 - index * 4)),
      firstTokenMedianMs: 900 + index * 120,
    };
  });
}

function modelStats(args: Record<string, unknown>): ModelStats[] {
  return providerStats(args).map((p, index) => ({
    model: PROVIDERS.find((item) => item.providerId === p.providerId)?.model ?? "unknown",
    requestCount: p.requestCount,
    totalTokens: p.totalTokens,
    totalCost: p.totalCost,
    avgCostPerRequest: "0.0972",
    successRate: p.successRate,
    speedOutputTokens: p.speedOutputTokens,
    speedGenerationMs: p.speedGenerationMs,
    firstTokenMedianMs: 900 + index * 120,
  }));
}

function requestLogs(args: Record<string, unknown>) {
  const filters = (args.filters ?? {}) as { appType?: string; statusCode?: number };
  const page = Number(args.page ?? 0);
  const pageSize = Number(args.pageSize ?? 20);
  const total = 4812;
  const data: RequestLog[] = [];
  for (let i = 0; i < pageSize; i++) {
    const n = page * pageSize + i;
    if (n >= total) break;
    const rand = seeded(n * 31 + 7);
    const pool = PROVIDERS.filter((p) => !filters.appType || p.appType === filters.appType);
    const provider = pool[Math.floor(rand() * rand() * pool.length)] ?? PROVIDERS[0];
    const failed = filters.statusCode ? filters.statusCode !== 200 : n % 17 === 5;
    const statusCode = filters.statusCode ?? (failed ? (n % 2 ? 429 : 500) : 200);
    const input = failed ? 0 : 40 + Math.floor(rand() * 900);
    const output = failed ? 0 : 100 + Math.floor(rand() * 1400);
    const cacheRead = failed ? 0 : 300_000 + Math.floor(rand() * 60_000);
    const cost = failed ? 0 : 0.06 + rand() * 0.05;
    const duration = 2000 + Math.floor(rand() * 20000);
    data.push({
      requestId: `req-${n}`,
      providerId: provider.providerId,
      providerName: provider.providerName,
      appType: provider.appType,
      model: provider.model,
      costMultiplier: "1",
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheCreationTokens: failed ? 0 : 1200,
      inputCostUsd: (cost * 0.1).toFixed(6),
      outputCostUsd: (cost * 0.3).toFixed(6),
      cacheReadCostUsd: (cost * 0.55).toFixed(6),
      cacheCreationCostUsd: (cost * 0.05).toFixed(6),
      totalCostUsd: cost.toFixed(6),
      isStreaming: true,
      latencyMs: duration,
      firstTokenMs: failed ? undefined : 700 + Math.floor(rand() * 900),
      durationMs: duration,
      statusCode,
      errorMessage: statusCode === 429 ? "Rate limit exceeded" : statusCode === 500 ? "Upstream returned 500" : undefined,
      createdAt: nowSec() - n * 37 - 20,
      dataSource: "proxy",
    });
  }
  return { data, total, page, pageSize };
}

const TOOLS: Record<string, { version: string; latest: string; source: string; path: string }> = {
  claude: { version: "2.1.287", latest: "2.1.289", source: "native", path: "~/.local/bin/claude" },
  codex: { version: "0.160.0", latest: "0.160.0", source: "npm", path: "~/.nvm/versions/node/v22.23.2/bin/codex" },
  gemini: { version: "0.62.0", latest: "0.62.0", source: "npm", path: "~/.nvm/versions/node/v22.23.2/bin/gemini" },
  grok: { version: "1.0.46", latest: "1.0.46", source: "native", path: "~/.grok/bin/grok" },
  opencode: { version: "1.18.34", latest: "1.18.34", source: "npm", path: "~/.nvm/versions/node/v22.23.2/bin/opencode" },
  openclaw: { version: "2026.9.2", latest: "2026.9.8", source: "npm", path: "~/.nvm/versions/node/v22.23.2/bin/openclaw" },
  hermes: { version: "0.21.5", latest: "0.21.5", source: "native", path: "~/.local/bin/hermes" },
  pi: { version: "1.0.0", latest: "1.0.2", source: "npm", path: "~/.nvm/versions/node/v22.23.2/bin/pi" },
  mcode: { version: "0.6.2", latest: "0.6.2", source: "native", path: "~/.minimax-code/bin/mcode" },
};

const toolNames = (args: Record<string, unknown>) =>
  (args.tools as string[] | undefined) ?? Object.keys(TOOLS);

export const usageHandlers: Record<string, MockHandler> = {
  get_usage_summary: (args) => summaryFor(rangeDays(args), appScale(args)),
  get_usage_summary_by_app: (args) =>
    Object.keys(APP_SHARE).map((appType) => ({ appType, summary: summaryFor(rangeDays(args), APP_SHARE[appType]) })),
  get_usage_trends: trends,
  get_usage_first_date: () => {
    const date = new Date(Date.now() - 400 * DAY * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  },
  get_provider_stats: providerStats,
  get_model_stats: modelStats,
  get_request_logs: requestLogs,
  get_request_detail: (args) => requestLogs({ page: 0, pageSize: 1 }).data.map((log) => ({ ...log, requestId: String(args.requestId) }))[0],
  get_model_pricing: () => [
    { modelId: "claude-fable-5-1", displayName: "Claude Fable 5.1", inputCostPerMillion: "15", outputCostPerMillion: "75", cacheReadCostPerMillion: "1.5", cacheCreationCostPerMillion: "18.75" },
    { modelId: "claude-opus-5-5", displayName: "Claude Opus 5.5", inputCostPerMillion: "5", outputCostPerMillion: "25", cacheReadCostPerMillion: "0.5", cacheCreationCostPerMillion: "6.25" },
    { modelId: "gpt-5.6", displayName: "GPT-5.6", inputCostPerMillion: "1.25", outputCostPerMillion: "10", cacheReadCostPerMillion: "0.125", cacheCreationCostPerMillion: "0" },
    { modelId: "deepseek-v4-pro", displayName: "DeepSeek V4 Pro", inputCostPerMillion: "0.55", outputCostPerMillion: "2.19", cacheReadCostPerMillion: "0.14", cacheCreationCostPerMillion: "0" },
    { modelId: "kimi-for-coding", displayName: "Kimi For Coding", inputCostPerMillion: "0.6", outputCostPerMillion: "2.5", cacheReadCostPerMillion: "0.15", cacheCreationCostPerMillion: "0" },
  ],
  get_usage_data_sources: () => [
    { dataSource: "proxy", requestCount: 18342, totalCostUsd: "1783.42" },
    { dataSource: "session", requestCount: 256_941, totalCostUsd: "25531.00" },
  ],
  sync_session_usage: () => ({ imported: 12, skipped: 0, filesScanned: 84, suspectedDuplicates: 0, deferredFiles: 0, errors: [] }),

  // 应用页：各工具的版本和安装位置
  get_tool_versions: (args) =>
    toolNames(args).map((name) => {
      const tool = TOOLS[name];
      return {
        name,
        version: tool?.version ?? null,
        latest_version: tool?.latest ?? null,
        error: null,
        installed_but_broken: false,
        env_type: "macos" as const,
        wsl_distro: null,
        update_blocked_by_node: null,
      };
    }),
  list_tool_installations: (args) =>
    toolNames(args).map((name) => {
      const tool = TOOLS[name];
      const installs = tool
        ? [
            { path: tool.path.replace("~", "/Users/demo"), version: tool.version, runnable: true, error: null, source: tool.source, is_path_default: true },
            ...(["claude", "grok", "openclaw"].includes(name)
              ? [{ path: `/opt/homebrew/bin/${name}`, version: tool.version, runnable: true, error: null, source: "homebrew", is_path_default: false }]
              : []),
          ]
        : [];
      return { tool: name, installs, is_conflict: installs.length > 1, needs_confirmation: false, command: tool?.source === "npm" ? `npm i -g ${name}@latest` : "", anchored: true, unmanaged: tool?.source === "native" };
    }),
};
