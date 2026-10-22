/**
 * 供应商页（首页）的假数据：各应用的供应商、当前选中、模式（直连 / 路由 / 聚合）、
 * 聚合名单、路由队列、代理状态、卡片右侧的额度。
 * 内容照 CC Switch 发布截图编的，Key 全是假的。
 */
import type { MockHandler } from "../backend";
import type { Provider, UsageResult } from "@/types";
import type { AppId } from "@/lib/api/types";
import type { SubscriptionQuota } from "@/types/subscription";
import type { TemplateType } from "@/config/constants";

type Mode = "direct" | "route" | "stack";

const now = Date.now();
const hoursLater = (h: number) => new Date(now + h * 3600_000).toISOString();

const claudeEnv = (baseUrl: string, model?: string) => ({
  env: {
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: "sk-demo-0000000000000000",
    ...(model ? { ANTHROPIC_MODEL: model } : {}),
  },
});

const codexConfig = (name: string, baseUrl: string, model: string) => ({
  auth: { OPENAI_API_KEY: "sk-demo-0000000000000000" },
  config: `model_provider = "${name}"\nmodel = "${model}"\n\n[model_providers.${name}]\nname = "${name}"\nbase_url = "${baseUrl}"\nwire_api = "responses"\n`,
});

const usageScript = (templateType: TemplateType, extra: Record<string, unknown> = {}) => ({
  enabled: true,
  language: "javascript" as const,
  code: "",
  timeout: 10,
  templateType,
  autoQueryInterval: 0,
  ...extra,
});

let seq = 0;
const p = (provider: Omit<Provider, "sortIndex" | "createdAt">): Provider => ({
  ...provider,
  sortIndex: seq++,
  createdAt: now - (100 - seq) * 86400_000,
});

/** 每个应用的供应商（按 sortIndex 排） */
const providers: Record<AppId, Provider[]> = {
  claude: [
    p({ id: "claude-kimi", name: "Kimi For Coding", websiteUrl: "https://www.kimi.com/coding/docs/", category: "cn_official", icon: "kimi", iconColor: "#6366F1", settingsConfig: claudeEnv("https://api.kimi.com/coding/", "kimi-for-coding"), meta: { usage_script: usageScript("token_plan", { codingPlanProvider: "kimi" }) } }),
    p({ id: "claude-deepseek", name: "DeepSeek", websiteUrl: "https://platform.deepseek.com", category: "cn_official", icon: "deepseek", iconColor: "#4D6BFE", settingsConfig: claudeEnv("https://api.deepseek.com/anthropic", "deepseek-v4-pro"), meta: { usage_script: usageScript("balance") } }),
    p({ id: "claude-official", name: "Claude Official", websiteUrl: "https://www.anthropic.com/claude-code", category: "official", icon: "anthropic", iconColor: "#D4915D", settingsConfig: { env: {} }, meta: { usage_script: usageScript("official_subscription") } }),
    p({ id: "claude-codex", name: "Codex", websiteUrl: "https://openai.com/chatgpt/pricing", category: "third_party", icon: "openai", settingsConfig: claudeEnv("https://chatgpt.com/backend-api/codex", "gpt-5.6"), meta: { providerType: "codex_oauth", apiFormat: "openai_responses" } }),
    p({ id: "claude-xai", name: "xAI (Grok)", websiteUrl: "https://x.ai/grok", category: "third_party", icon: "xai", settingsConfig: claudeEnv("https://api.x.ai/v1", "grok-4.5"), meta: { providerType: "xai_oauth", apiFormat: "openai_responses" } }),
    p({ id: "claude-opencode", name: "OpenCode Go", websiteUrl: "https://opencode.ai/go", category: "third_party", icon: "opencode", settingsConfig: claudeEnv("https://opencode.ai/zen/go"), meta: { usage_script: usageScript("token_plan") } }),
    p({ id: "claude-glm-coding", name: "GLM Coding Plan", websiteUrl: "https://open.bigmodel.cn", category: "cn_official", icon: "zhipu", iconColor: "#3859FF", settingsConfig: claudeEnv("https://open.bigmodel.cn/api/anthropic", "glm-5") }),
    p({ id: "claude-qwen", name: "Qwen-Coder", websiteUrl: "https://bailian.console.aliyun.com", category: "cn_official", icon: "qwen", iconColor: "#615CED", settingsConfig: claudeEnv("https://dashscope.aliyuncs.com/apps/anthropic", "qwen3-coder-plus") }),
    p({ id: "claude-glm", name: "GLM", websiteUrl: "https://open.bigmodel.cn", category: "cn_official", icon: "zhipu", iconColor: "#3859FF", settingsConfig: claudeEnv("https://open.bigmodel.cn/api/anthropic", "glm-5-air") }),
  ],
  "claude-desktop": [
    p({ id: "desktop-official", name: "Claude Official", websiteUrl: "https://claude.ai/download", category: "official", icon: "anthropic", iconColor: "#D4915D", settingsConfig: { env: {} } }),
    p({ id: "desktop-kimi", name: "Kimi For Coding", websiteUrl: "https://www.kimi.com/coding/docs/", category: "cn_official", icon: "kimi", iconColor: "#6366F1", settingsConfig: claudeEnv("https://api.kimi.com/coding/", "kimi-for-coding") }),
  ],
  codex: [
    p({ id: "codex-official", name: "OpenAI Official", websiteUrl: "https://chatgpt.com/codex", category: "official", icon: "openai", settingsConfig: { auth: {}, config: "" } }),
    p({ id: "codex-deepseek", name: "DeepSeek", websiteUrl: "https://platform.deepseek.com", category: "cn_official", icon: "deepseek", iconColor: "#4D6BFE", settingsConfig: codexConfig("deepseek", "https://api.deepseek.com/v1", "deepseek-v4-pro"), meta: { apiFormat: "openai_chat" } }),
    p({ id: "codex-kimi", name: "Kimi For Coding", websiteUrl: "https://www.kimi.com/coding/docs/", category: "cn_official", icon: "kimi", iconColor: "#6366F1", settingsConfig: codexConfig("kimi", "https://api.kimi.com/coding/v1", "kimi-for-coding"), meta: { usage_script: usageScript("token_plan", { codingPlanProvider: "kimi" }) } }),
    p({ id: "codex-xai", name: "xAI (Grok) OAuth", websiteUrl: "https://x.ai/grok", category: "third_party", icon: "xai", settingsConfig: codexConfig("xai", "https://api.x.ai/v1", "grok-4.5"), meta: { providerType: "xai_oauth" } }),
    p({ id: "codex-minimax", name: "MiniMax", websiteUrl: "https://platform.minimaxi.com", category: "cn_official", icon: "minimax", iconColor: "#E2167E", settingsConfig: codexConfig("minimax", "https://api.minimaxi.com/v1", "MiniMax-M3"), meta: { usage_script: usageScript("token_plan") } }),
    p({ id: "codex-qwen", name: "Qwen-Coder", websiteUrl: "https://bailian.console.aliyun.com", category: "cn_official", icon: "qwen", iconColor: "#615CED", settingsConfig: codexConfig("qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen3-coder-plus") }),
  ],
  gemini: [
    p({ id: "gemini-official", name: "Google Official", websiteUrl: "https://ai.google.dev", category: "official", icon: "gemini", settingsConfig: { env: {} } }),
    p({ id: "gemini-openrouter", name: "OpenRouter", websiteUrl: "https://openrouter.ai", category: "aggregator", icon: "openrouter", settingsConfig: { env: { GOOGLE_GEMINI_BASE_URL: "https://openrouter.ai/api/v1", GEMINI_API_KEY: "sk-demo-0000000000000000" } } }),
  ],
  grokbuild: [
    p({ id: "grok-official", name: "xAI Official", websiteUrl: "https://x.ai/grok", category: "official", icon: "xai", settingsConfig: { env: {} }, meta: { providerType: "xai_oauth" } }),
    p({ id: "grok-openrouter", name: "OpenRouter", websiteUrl: "https://openrouter.ai", category: "aggregator", icon: "openrouter", settingsConfig: { env: { XAI_BASE_URL: "https://openrouter.ai/api/v1", XAI_API_KEY: "sk-demo-0000000000000000" } } }),
    p({ id: "grok-siliconflow", name: "SiliconFlow", websiteUrl: "https://siliconflow.cn", category: "aggregator", icon: "siliconflow", settingsConfig: { env: { XAI_BASE_URL: "https://api.siliconflow.cn/v1", XAI_API_KEY: "sk-demo-0000000000000000" } } }),
  ],
  opencode: [
    p({ id: "opencode-go", name: "OpenCode Go", websiteUrl: "https://opencode.ai/go", category: "third_party", icon: "opencode", settingsConfig: { npm: "@ai-sdk/openai-compatible", name: "OpenCode Go", options: { baseURL: "https://opencode.ai/zen/go/v1", apiKey: "sk-demo-0000000000000000" }, models: { "kimi-k2.7": { name: "Kimi K2.7" } } } }),
    p({ id: "opencode-deepseek", name: "DeepSeek", websiteUrl: "https://platform.deepseek.com", category: "cn_official", icon: "deepseek", iconColor: "#4D6BFE", settingsConfig: { npm: "@ai-sdk/openai-compatible", name: "DeepSeek", options: { baseURL: "https://api.deepseek.com/v1", apiKey: "sk-demo-0000000000000000" }, models: { "deepseek-v4-pro": { name: "DeepSeek V4 Pro" } } } }),
  ],
  openclaw: [
    p({ id: "openclaw-kimi", name: "Kimi For Coding", websiteUrl: "https://www.kimi.com/coding/docs/", category: "cn_official", icon: "kimi", iconColor: "#6366F1", settingsConfig: { baseUrl: "https://api.kimi.com/coding/v1", apiKey: "sk-demo-0000000000000000", api: "openai-completions", models: [{ id: "kimi-for-coding", name: "Kimi For Coding" }] } }),
  ],
  hermes: [
    p({ id: "hermes-deepseek", name: "DeepSeek", websiteUrl: "https://platform.deepseek.com", category: "cn_official", icon: "deepseek", iconColor: "#4D6BFE", settingsConfig: { base_url: "https://api.deepseek.com/v1", api_key: "sk-demo-0000000000000000", model: "deepseek-v4-pro" } }),
  ],
  pi: [
    p({ id: "pi-glm", name: "GLM Coding Plan", websiteUrl: "https://open.bigmodel.cn", category: "cn_official", icon: "zhipu", iconColor: "#3859FF", settingsConfig: { baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKey: "sk-demo-0000000000000000", api: "openai-completions", models: [{ id: "glm-5", name: "GLM-5" }] } }),
  ],
  mcode: [
    p({ id: "mcode-official", name: "MiniMax Official", websiteUrl: "https://platform.minimaxi.com", category: "official", icon: "minimax", iconColor: "#E2167E", settingsConfig: { env: {} } }),
  ],
  dsh: [],
};

const current: Record<AppId, string> = {
  claude: "claude-official",
  "claude-desktop": "desktop-official",
  codex: "codex-official",
  gemini: "gemini-official",
  grokbuild: "grok-official",
  opencode: "opencode-go",
  openclaw: "openclaw-kimi",
  hermes: "hermes-deepseek",
  pi: "pi-glm",
  mcode: "mcode-official",
  dsh: "",
};

const modes: Partial<Record<AppId, Mode>> = { codex: "stack", grokbuild: "route" };

/** 聚合名单（Codex）：默认那家 + 已添加的几家和它们发布的模型 */
const stackMembers: Partial<Record<AppId, { providerId: string; modelIds: string[]; route: boolean }[]>> = {
  codex: [
    { providerId: "codex-official", modelIds: [], route: true },
    { providerId: "codex-deepseek", modelIds: ["deepseek-v4-flash", "deepseek-v4-pro"], route: false },
    { providerId: "codex-kimi", modelIds: ["kimi-for-coding", "kimi-k3", "kimi-k3-256k", "kimi-for-coding-highspeed"], route: false },
    { providerId: "codex-xai", modelIds: ["grok-4.5"], route: false },
    { providerId: "codex-minimax", modelIds: ["MiniMax-M3", "MiniMax-M3-lightning"], route: false },
  ],
};

/** 路由队列（Grok Build）：按优先级 */
const failoverQueues: Partial<Record<AppId, string[]>> = {
  grokbuild: ["grok-official", "grok-openrouter", "grok-siliconflow"],
};

const list = (app: AppId) => providers[app] ?? [];
const find = (app: AppId, id: string) => list(app).find((item) => item.id === id);
const appOf = (args: Record<string, unknown>) =>
  (args.app ?? args.appType ?? args.appId ?? "claude") as AppId;

// ── 卡片右侧的额度 ──────────────────────────────────────────────────────────

/** 按档的百分比套餐（token_plan）：used 是已用百分比 */
const tokenPlans: Record<string, UsageResult> = {
  "claude-kimi": { success: true, data: [ { planName: "five_hour", used: 0, unit: "%", extra: hoursLater(3) }, { planName: "weekly_limit", used: 0, unit: "%", extra: hoursLater(90) } ] },
  "claude-opencode": { success: true, data: [ { planName: "five_hour", used: 0, unit: "%", extra: hoursLater(2) }, { planName: "weekly_limit", used: 40, unit: "%", extra: hoursLater(60) }, { planName: "monthly", used: 100, unit: "%", extra: hoursLater(240) } ] },
  "codex-kimi": { success: true, data: [ { planName: "five_hour", used: 0, unit: "%", extra: hoursLater(3) }, { planName: "weekly_limit", used: 0, unit: "%", extra: hoursLater(90) } ] },
  "codex-minimax": { success: true, data: [ { planName: "five_hour", used: 12, unit: "%", extra: hoursLater(4) } ] },
  "claude-deepseek": { success: true, data: [ { remaining: 8.99, unit: "CNY" } ] },
};

const quota = (tool: string, tiers: SubscriptionQuota["tiers"], extra: Partial<SubscriptionQuota> = {}): SubscriptionQuota => ({
  tool,
  credentialStatus: "valid",
  credentialMessage: null,
  success: true,
  tiers,
  extraUsage: null,
  error: null,
  queriedAt: now - 60_000,
  ...extra,
});

export const providerHandlers: Record<string, MockHandler> = {
  get_providers: (args) => Object.fromEntries(list(appOf(args)).map((item) => [item.id, item])),
  get_current_provider: (args) => current[appOf(args)] ?? "",
  switch_provider: (args) => {
    current[appOf(args)] = String(args.id);
    return { warnings: [] };
  },
  add_provider: (args) => {
    const provider = args.provider as Provider;
    list(appOf(args)).push({ ...provider, sortIndex: seq++, createdAt: Date.now() });
    return true;
  },
  update_provider: (args) => {
    const provider = args.provider as Provider;
    const app = appOf(args);
    providers[app] = list(app).map((item) => (item.id === provider.id ? { ...item, ...provider } : item));
    return true;
  },
  delete_provider: (args) => {
    const app = appOf(args);
    providers[app] = list(app).filter((item) => item.id !== args.id);
    return true;
  },
  update_providers_sort_order: (args) => {
    const app = appOf(args);
    for (const { id, sortIndex } of (args.updates as { id: string; sortIndex: number }[]) ?? []) {
      const item = find(app, id);
      if (item) item.sortIndex = sortIndex;
    }
    return true;
  },
  import_default_config: () => true,
  update_tray_menu: () => true,

  // 模式：直连 / 路由 / 聚合
  get_app_mode: (args) => {
    const app = appOf(args);
    const mode = modes[app] ?? "direct";
    // 路由目标：路由模式是队列第一家；聚合模式是名单里做默认（route）的那家
    const routeProviderId =
      mode === "route"
        ? (failoverQueues[app]?.[0] ?? current[app])
        : mode === "stack"
          ? (stackMembers[app]?.find((member) => member.route)?.providerId ?? current[app])
          : null;
    return {
      mode,
      attached: mode !== "direct",
      routeProviderId,
      directProviderId: current[app] ?? null,
    };
  },
  get_direct_provider: (args) => current[appOf(args)] ?? null,
  set_proxy_route: (args) => {
    const app = appOf(args);
    modes[app] = "route";
    if (args.providerId) current[app] = String(args.providerId);
    return { kind: "route", clientConfigChanged: true };
  },
  get_proxy_stack: (args) => {
    const app = appOf(args);
    const members = stackMembers[app] ?? [];
    return {
      active: modes[app] === "stack",
      members: members.map((member) => ({ ...member, memberModels: member.modelIds.length || 2 })),
    };
  },
  set_proxy_stack_member: (args) => {
    const app = appOf(args);
    const members = (stackMembers[app] ??= []);
    if (args.enabled) {
      if (!members.some((m) => m.providerId === args.providerId)) {
        members.push({ providerId: String(args.providerId), modelIds: ["model-a", "model-b"], route: false });
      }
    } else {
      stackMembers[app] = members.filter((m) => m.providerId !== args.providerId);
    }
    return null;
  },
  get_failover_queue: (args) => {
    const app = appOf(args);
    return (failoverQueues[app] ?? []).map((id, index) => ({
      providerId: id,
      providerName: find(app, id)?.name ?? id,
      sortIndex: index,
    }));
  },
  get_available_providers_for_failover: (args) => {
    const app = appOf(args);
    const queue = failoverQueues[app] ?? [];
    return list(app).filter((item) => !queue.includes(item.id));
  },
  add_to_failover_queue: (args) => {
    (failoverQueues[appOf(args)] ??= []).push(String(args.providerId));
    return null;
  },
  remove_from_failover_queue: (args) => {
    const app = appOf(args);
    failoverQueues[app] = (failoverQueues[app] ?? []).filter((id) => id !== args.providerId);
    return null;
  },
  get_auto_failover_enabled: (args) => appOf(args) === "grokbuild",
  get_proxy_status: () => ({
    running: true,
    address: "127.0.0.1",
    port: 15721,
    active_connections: 2,
    total_requests: 18342,
    success_requests: 18177,
    failed_requests: 165,
    success_rate: 99.1,
    uptime_seconds: 3 * 3600 + 1240,
    current_provider: "xAI Official",
    current_provider_id: "grok-official",
    last_request_at: new Date(now - 12_000).toISOString(),
    last_error: null,
    failover_count: 3,
    active_targets: [
      { app_type: "codex", provider_name: "OpenAI Official", provider_id: "codex-official" },
      { app_type: "grokbuild", provider_name: "xAI Official", provider_id: "grok-official" },
    ],
  }),
  get_proxy_takeover_status: () => ({
    claude: false,
    "claude-desktop": false,
    codex: true,
    gemini: false,
    grokbuild: true,
    opencode: false,
    openclaw: false,
    hermes: false,
  }),
  take_startup_attach_failures: () => [],
  check_env_conflicts: () => [],
  get_provider_health: (args) => ({
    provider_id: String(args.providerId),
    app_type: String(args.appType),
    is_healthy: true,
    consecutive_failures: 0,
    last_success_at: new Date(now - 30_000).toISOString(),
    last_failure_at: null,
    last_error: null,
    updated_at: new Date(now - 30_000).toISOString(),
  }),
  get_opencode_live_provider_ids: () => ["opencode-go", "opencode-deepseek"],
  get_openclaw_live_provider_ids: () => ["openclaw-kimi"],
  get_hermes_live_provider_ids: () => ["hermes-deepseek"],
  get_opencode_default_model: () => "opencode-go/kimi-k2.7",
  get_claude_desktop_status: () => ({
    supported: true,
    configured: false,
    appliedId: null,
    profilePath: null,
    configLibraryPath: null,
    mode: null,
    expectedBaseUrl: null,
    actualBaseUrl: null,
    proxyRunning: true,
    staleRawModels: false,
    missingRouteMappings: false,
    gatewayTokenConfigured: false,
  }),

  // 额度
  queryProviderUsage: (args) =>
    tokenPlans[String(args.providerId)] ?? { success: true, data: [] },
  get_subscription_quota: (args) =>
    quota(String(args.tool), [
      { name: "five_hour", utilization: 6, resetsAt: hoursLater(2) },
      { name: "seven_day", utilization: 59, resetsAt: hoursLater(70) },
      { name: "seven_day_fable", utilization: 27, resetsAt: hoursLater(70) },
    ]),
  get_codex_oauth_quota: () =>
    quota("codex", [{ name: "seven_day", utilization: 6, resetsAt: hoursLater(100) }], {
      resetCredits: { expiresAt: [hoursLater(200), hoursLater(400), null] },
    }),
  get_xai_oauth_quota: () =>
    quota("xai", [{ name: "monthly", utilization: 7, resetsAt: hoursLater(300) }]),
};
