/**
 * 启动和全局用到的假数据：设置、迁移结果、深链接、托盘、授权账号、侧栏「今日」用量。
 */
import type { MockHandler } from "../backend";
import type { Settings } from "@/types";
import type { ManagedAuthAccount, ManagedAuthProvider } from "@/lib/api/auth";

const now = Date.now();

let settings: Settings = {
  showInTray: true,
  minimizeToTrayOnClose: true,
  language: "zh",
  enableLocalProxy: true,
  enableStackMode: true,
  enableFailoverToggle: true,
  proxyConfirmed: true,
  usageConfirmed: true,
  failoverConfirmed: true,
  firstRunNoticeConfirmed: true,
  newLayoutNoticeConfirmed: true,
  autoSyncConfirmed: true,
  commonConfigConfirmed: true,
  whatsNewSeenVersion: "4.0.16",
  sessionAutoSyncEnabled: true,
  checkToolUpdatesOnStartup: true,
  showProviderSearch: true,
  quotaDisplay: "left",
  usageDashboardRefreshIntervalMs: 30_000,
  usageDisplay: { currency: "USD", sidebarTodayItems: ["cost"] },
  visibleApps: {
    claude: true,
    "claude-desktop": true,
    codex: true,
    gemini: true,
    grokbuild: true,
    opencode: true,
    openclaw: true,
    hermes: true,
    pi: true,
    mcode: true,
    dsh: true,
  },
  skillSyncMethod: "auto",
  skillStorageLocation: "cc_switch",
  backupIntervalHours: 24,
  backupRetainCount: 10,
  preferredTerminal: "terminal",
};

const account = (
  provider: ManagedAuthProvider,
  id: string,
  login: string,
  isDefault: boolean,
): ManagedAuthAccount => ({
  id,
  provider,
  login,
  avatar_url: null,
  authenticated_at: Math.floor((now - 12 * 86400_000) / 1000),
  is_default: isDefault,
  github_domain: "github.com",
  requires_reauth: false,
});

const accounts: Record<ManagedAuthProvider, ManagedAuthAccount[]> = {
  github_copilot: [account("github_copilot", "gh-1", "demo-dev", true)],
  codex_oauth: [
    account("codex_oauth", "codex-1", "demo@example.com", true),
    account("codex_oauth", "codex-2", "team@example.com", false),
  ],
  xai_oauth: [account("xai_oauth", "xai-1", "demo@example.com", true)],
};

export const coreHandlers: Record<string, MockHandler> = {
  get_init_error: () => null,
  get_settings: () => settings,
  save_settings: (args) => {
    settings = { ...settings, ...(args.settings as Settings) };
    return true;
  },
  get_migration_result: () => false,
  get_skills_migration_result: () => null,
  peek_pending_deeplink: () => null,
  take_tray_navigation: () => null,
  tray_app_page_seen: () => null,
  set_window_theme: () => null,
  is_portable_mode: () => false,
  get_auto_launch_status: () => false,
  get_app_config_dir_override: () => null,
  get_config_dir: (args) => `/Users/demo/.${String(args.app ?? "claude")}`,
  get_app_config_path: () => "/Users/demo/.cc-switch",
  get_claude_code_config_path: () => "/Users/demo/.claude/settings.json",
  get_models_dev_sync_config: () => ({
    config: {
      autoSyncEnabled: false,
      includeCommonModels: true,
      selectedModelKeys: [],
      excludedCommonModelKeys: [],
      lastSyncAt: now - 3 * 3600_000,
      lastSyncError: null,
    },
    configPath: "/Users/demo/.cc-switch/models-dev.json",
  }),

  // 授权中心账号（GitHub Copilot / ChatGPT / xAI）
  auth_get_status: (args) => {
    const provider = (args.authProvider ?? "github_copilot") as ManagedAuthProvider;
    const list = accounts[provider] ?? [];
    return {
      provider,
      authenticated: list.length > 0,
      default_account_id: list.find((item) => item.is_default)?.id ?? null,
      accounts: list,
    };
  },
  auth_list_accounts: (args) =>
    accounts[(args.authProvider ?? "github_copilot") as ManagedAuthProvider] ?? [],
};
