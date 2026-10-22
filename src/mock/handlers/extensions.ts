/**
 * MCP、Skills、提示词三页的假数据。
 */
import type { MockHandler } from "../backend";
import type { McpServer } from "@/types";
import type { AppId } from "@/lib/api/types";
import type { Prompt } from "@/lib/api/prompts";
import type { DiscoverableSkill, InstalledSkill, SkillApps } from "@/lib/api/skills";

const now = Date.now();
const daysAgo = (d: number) => now - d * 86400_000;

// ── MCP ─────────────────────────────────────────────────────────────────────

const mcpApps = (on: AppId[]) => ({
  claude: on.includes("claude"),
  codex: on.includes("codex"),
  gemini: on.includes("gemini"),
  grokbuild: on.includes("grokbuild"),
  opencode: on.includes("opencode"),
  openclaw: false,
  hermes: on.includes("hermes"),
  pi: on.includes("pi"),
  mcode: on.includes("mcode"),
});

const mcpServers: Record<string, McpServer> = {
  seep: {
    id: "seep",
    name: "seep",
    description:
      "Seep-Reverse-Lab 的 23 个逆向 / APK / 知识库工具；由「Seep 工具」页接入真实客户端配置",
    homepage: "https://github.com/angusdevgo/Seep-Reverse-Lab",
    tags: ["stdio", "reverse", "apk"],
    server: {
      type: "stdio",
      command: "python",
      args: ["<Seep>/Tool/mcp/seep_mcp_server.py"],
      env: { PYTHONIOENCODING: "utf-8" },
    },
    apps: mcpApps([]),
    source: "seep-bridge",
  },
  context7: { id: "context7", name: "context7", description: "查最新的库文档和代码示例", homepage: "https://context7.com", server: { type: "stdio", command: "npx", args: ["-y", "@upstash/context7-mcp@latest"] }, apps: mcpApps(["claude", "codex", "gemini", "opencode"]) },
  fetch: { id: "fetch", name: "fetch", description: "抓取网页并转成 Markdown", homepage: "https://github.com/modelcontextprotocol/servers", server: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] }, apps: mcpApps(["claude", "codex"]) },
  playwright: { id: "playwright", name: "playwright", description: "用真实浏览器打开页面、点击、截图", homepage: "https://github.com/microsoft/playwright-mcp", server: { type: "stdio", command: "npx", args: ["@playwright/mcp@latest"] }, apps: mcpApps(["claude", "grokbuild"]) },
  github: { id: "github", name: "github", description: "读写 GitHub 仓库、Issue 和 PR", homepage: "https://github.com/github/github-mcp-server", server: { type: "http", url: "https://api.githubcopilot.com/mcp/", headers: { Authorization: "Bearer DEMO_GITHUB_TOKEN" } }, apps: mcpApps(["claude", "codex", "opencode"]) },
  "sequential-thinking": { id: "sequential-thinking", name: "sequential-thinking", description: "把复杂问题拆成多步思考", server: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"] }, apps: mcpApps(["claude"]) },
  sentry: { id: "sentry", name: "sentry", description: "查线上报错和性能问题", homepage: "https://docs.sentry.io/product/sentry-mcp/", server: { type: "sse", url: "https://mcp.sentry.dev/sse" }, apps: mcpApps([]) },
};

// ── Skills ──────────────────────────────────────────────────────────────────

const skillApps = (on: AppId[]): SkillApps => ({
  claude: on.includes("claude"),
  codex: on.includes("codex"),
  gemini: on.includes("gemini"),
  grokbuild: on.includes("grokbuild"),
  opencode: on.includes("opencode"),
  openclaw: false,
  hermes: on.includes("hermes"),
  pi: on.includes("pi"),
  mcode: false,
});

const fromRepo = (directory: string, name: string, description: string, apps: AppId[], installedDaysAgo: number): InstalledSkill => ({
  id: `anthropics/skills:${directory}`,
  name,
  description,
  directory,
  repoOwner: "anthropics",
  repoName: "skills",
  repoBranch: "main",
  readmeUrl: `https://github.com/anthropics/skills/tree/main/skills/${directory}`,
  apps: skillApps(apps),
  installedAt: daysAgo(installedDaysAgo),
  updatedAt: daysAgo(Math.max(0, installedDaysAgo - 3)),
});

const installedSkills: InstalledSkill[] = [
  fromRepo("frontend-design", "frontend-design", "做出有设计感的前端界面，避免千篇一律的 AI 风格", ["claude", "codex", "opencode"], 20),
  fromRepo("pdf", "pdf", "读取、合并、拆分、填写 PDF", ["claude", "codex"], 32),
  fromRepo("docx", "docx", "创建和修改 Word 文档，支持修订和批注", ["claude"], 32),
  fromRepo("xlsx", "xlsx", "读写 Excel 表格、公式和图表", ["claude", "gemini"], 18),
  fromRepo("webapp-testing", "webapp-testing", "用 Playwright 测试本地网页应用", ["claude", "grokbuild"], 9),
  fromRepo("skill-creator", "skill-creator", "引导你写一个新的 Skill", ["claude"], 4),
  { id: "local:release-notes", name: "release-notes", description: "按团队格式整理版本更新说明", directory: "release-notes", apps: skillApps(["claude", "codex"]), installedAt: daysAgo(2), updatedAt: daysAgo(1) },
];

const discoverable: DiscoverableSkill[] = [
  ["mcp-builder", "搭建高质量的 MCP 服务器"],
  ["canvas-design", "用代码画海报、插图等静态视觉作品"],
  ["algorithmic-art", "用 p5.js 生成算法艺术"],
  ["brand-guidelines", "按品牌规范统一配色和字体"],
  ["internal-comms", "写周报、公告等内部沟通文档"],
  ["pptx", "创建和修改 PowerPoint 演示文稿"],
  ["slack-gif-creator", "做适合在 Slack 里发的小动图"],
  ["theme-factory", "给文档和页面套用主题"],
].map(([directory, description]) => ({
  key: `anthropics/skills:${directory}`,
  name: directory,
  description,
  directory,
  readmeUrl: `https://github.com/anthropics/skills/tree/main/skills/${directory}`,
  repoOwner: "anthropics",
  repoName: "skills",
  repoBranch: "main",
}));

// ── 提示词 ──────────────────────────────────────────────────────────────────

const prompt = (id: string, name: string, description: string, enabled: boolean, content: string, days: number): Prompt => ({
  id,
  name,
  description,
  enabled,
  content,
  createdAt: daysAgo(days),
  updatedAt: daysAgo(Math.max(0, days - 2)),
});

const prompts: Partial<Record<AppId, Record<string, Prompt>>> = {
  claude: {
    team: prompt("team", "团队规范", "代码风格、提交信息和评审要求", true, "# 团队规范\n\n- 回复用简体中文\n- 改代码前先读相关文件，保持现有风格\n- 提交信息用「类型: 说明」格式，例如 `fix: 修复登录失效`\n- 不确定的地方先问，不要猜\n", 30),
    review: prompt("review", "代码评审", "只找真正的问题，按严重程度排序", false, "# 代码评审\n\n逐个文件检查改动，只报告会导致错误、安全问题或明显性能问题的地方。\n每条写清楚：位置、问题、触发条件、建议改法。\n", 12),
    writing: prompt("writing", "写文档", "README 和接口文档的写法", false, "# 写文档\n\n先写一句话说明这是什么，再写怎么用。示例代码要能直接运行。\n", 5),
  },
  codex: {
    agents: prompt("agents", "AGENTS.md", "Codex 的项目约定", true, "# AGENTS.md\n\n- 测试命令：pnpm test\n- 改完跑 pnpm typecheck\n", 14),
  },
  gemini: {
    gemini: prompt("gemini", "GEMINI.md", "Gemini CLI 的项目约定", true, "# GEMINI.md\n\n回复用简体中文。\n", 8),
  },
};

const promptFile: Partial<Record<AppId, string>> = {
  claude: "~/.claude/CLAUDE.md",
  codex: "~/.codex/AGENTS.md",
  gemini: "~/.gemini/GEMINI.md",
  grokbuild: "~/.grok/GROK.md",
  opencode: "~/.config/opencode/AGENTS.md",
  hermes: "~/.hermes/HERMES.md",
  mcode: "~/.minimax-code/MCODE.md",
};

const appOf = (args: Record<string, unknown>) => (args.app ?? "claude") as AppId;

/**
 * Seep 的 MCP 条目是真实的：每次读列表都从 Seep 桥接服务同步当前路径和各客户端
 * 接入状态。其他几个条目仍是演示数据。
 */
async function syncSeepMcpEntry() {
  try {
    const [overviewResponse, targetsResponse] = await Promise.all([
      fetch("/api/seep/overview"),
      fetch("/api/seep/targets"),
    ]);
    if (!overviewResponse.ok || !targetsResponse.ok) return;
    const overview = (await overviewResponse.json()) as {
      serverFile?: string;
      python?: string;
    };
    const targets =
      (
        (await targetsResponse.json()) as {
          targets?: Array<{
            app: string;
            installed: boolean;
            supported: boolean;
          }>;
        }
      ).targets ?? [];
    const seep = mcpServers.seep;
    if (!seep) return;
    if (overview.serverFile) {
      seep.server = {
        type: "stdio",
        command: overview.python || "python",
        args: [overview.serverFile],
        env: { PYTHONIOENCODING: "utf-8" },
      };
    }
    const apps = seep.apps as unknown as Record<string, boolean>;
    for (const key of Object.keys(apps)) {
      const target = targets.find((item) => item.app === key);
      apps[key] = Boolean(target?.supported && target.installed);
    }
  } catch {
    // 纯静态打开时没有 /api/seep，保留演示条目
  }
}

export const extensionHandlers: Record<string, MockHandler> = {
  // MCP
  get_mcp_servers: async () => {
    await syncSeepMcpEntry();
    return mcpServers;
  },
  get_mcp_config: async (args) => {
    await syncSeepMcpEntry();
    return {
      configPath: `/Users/demo/.${appOf(args)}/mcp.json`,
      servers: Object.fromEntries(
        Object.entries(mcpServers).filter(
          ([, s]) => s.apps[appOf(args) as keyof typeof s.apps],
        ),
      ),
    };
  },
  upsert_mcp_server: (args) => {
    const server = args.server as McpServer;
    mcpServers[server.id] = server;
    return null;
  },
  delete_mcp_server: async (args) => {
    const id = String(args.id);
    const server = mcpServers[id];
    if (server?.id === "seep") {
      const enabledApps = Object.entries(
        server.apps as unknown as Record<string, boolean>,
      )
        .filter(([, on]) => on)
        .map(([app]) => app);
      if (enabledApps.length > 0) {
        await fetch("/api/seep/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apps: enabledApps, enabled: false }),
        });
      }
    }
    delete mcpServers[id];
    return true;
  },
  toggle_mcp_app: async (args) => {
    const server = mcpServers[String(args.serverId)];
    const app = String(args.app);
    const enabled = Boolean(args.enabled);
    if (server?.id === "seep") {
      const response = await fetch("/api/seep/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apps: [app], enabled }),
      });
      const data = (await response.json().catch(() => null)) as
        | {
            error?: string;
            targets?: Array<{ app: string; installed: boolean }>;
          }
        | null;
      if (!response.ok) {
        throw new Error(data?.error || "写入 Seep MCP 配置失败");
      }
      for (const target of data?.targets ?? []) {
        const apps = server.apps as unknown as Record<string, boolean>;
        if (apps[target.app] !== undefined) {
          apps[target.app] = target.installed;
        }
      }
      return null;
    }
    if (server) {
      (server.apps as unknown as Record<string, boolean>)[app] = enabled;
    }
    return null;
  },
  import_mcp_from_apps: () => 0,
  resync_mcp_to_apps: () => [],
  validate_mcp_command: () => true,

  // Skills
  get_installed_skills: () => installedSkills,
  get_skill_backups: () => [],
  discover_available_skills: () => ({ skills: discoverable, failures: [] }),
  check_skill_updates: () => ({
    updates: [{ id: installedSkills[0].id, name: installedSkills[0].name, remoteHash: "b7e1c2d" }],
    failures: [],
  }),
  toggle_skill_app: (args) => {
    const skill = installedSkills.find((item) => item.id === args.id);
    if (skill) (skill.apps as unknown as Record<string, boolean>)[String(args.app)] = Boolean(args.enabled);
    return true;
  },
  get_skill_repos: () => [
    { owner: "anthropics", name: "skills", branch: "main", enabled: true },
    { owner: "obra", name: "superpowers", branch: "main", enabled: true },
  ],
  get_cc_switch_skills_dir: () => "/Users/demo/.cc-switch/skills",
  resync_skills_to_apps: () => [],
  search_skills_sh: () => ({ skills: [], total: 0 }),

  // 提示词
  get_prompts: (args) => prompts[appOf(args)] ?? {},
  upsert_prompt: (args) => {
    const app = appOf(args);
    (prompts[app] ??= {})[String(args.id)] = args.prompt as Prompt;
    return null;
  },
  delete_prompt: (args) => {
    delete prompts[appOf(args)]?.[String(args.id)];
    return null;
  },
  enable_prompt: (args) => {
    const list = prompts[appOf(args)] ?? {};
    for (const item of Object.values(list)) item.enabled = item.id === args.id;
    return null;
  },
  get_prompt_file_location: (args) => {
    const display = promptFile[appOf(args)] ?? "~/.claude/CLAUDE.md";
    return { path: display.replace("~", "/Users/demo"), displayPath: display };
  },
  get_current_prompt_file_content: (args) =>
    Object.values(prompts[appOf(args)] ?? {}).find((item) => item.enabled)?.content ?? null,
  get_pi_prompt_file: () => ({ exists: false, revision: "0", content: "" }),
  list_pi_prompt_templates: () => [],
};
