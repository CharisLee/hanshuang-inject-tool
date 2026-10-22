# 寒霜注入工具（浏览器版，假数据）

基于 [CC Switch](https://github.com/farion1231/cc-switch) v4.0.16 的前端改造：
去掉了 Rust 后端，换成 `src/mock/` 里的假数据，在浏览器里就能跑；品牌、图标和界面
已经改成「寒霜注入工具」，只保留本机提示词注入和网关注入。
原版页面都在代码里；当前界面为：左侧应用列表 + MCP / Skills + 提示词注入（本机文件 / 网关注入）+ Seep 工具 + 使用教程 + 应用 + 设置（通用 / 关于）。

## 界面精简

侧栏只保留需要的入口，其余页面代码仍在，想恢复时改 `src/lib/navigation.ts` 里的
`VISIBLE_GLOBAL_PAGES` / `VISIBLE_SETTINGS_SECTIONS`：

- 全局页显示「MCP」「Skills」「提示词注入」「Seep 工具」「使用教程」；提示词注入默认打开「网关注入」，另一个页签是「本机文件」。
- 提示词、会话、授权中心、用量统计的入口已隐藏。
- 设置只保留「通用」「关于」；应用配置、路由、网络、数据的入口已隐藏。
- 左下角保留「应用」「设置」两个工具入口，以及「满血中转站」「加入 TG 群」「加入 QQ 群」三个外链。
- 品牌改为「寒霜注入工具」：侧栏、关于页、浏览器标题、托盘标题和图标都已换掉；
  通用设置里的额度显示、供应商搜索、终端等 API / 供应商相关项已移除。

## 运行

```bash
pnpm install
pnpm dev        # http://localhost:5190
pnpm build      # 打包到 dist/
pnpm typecheck  # 类型检查
```

> 国内装依赖：如果系统设了 HTTP_PROXY 代理，`pnpm install` 走 npmmirror 会很慢甚至卡住，
> 临时去掉代理再装：`env -u HTTP_PROXY -u HTTPS_PROXY pnpm install`

## 应用页：提示词工作台（所有应用）

点侧栏任意 Agent（Claude Code、Codex、Gemini…）进入的不再是供应商列表，而是该应用的提示词工作台：

- 每个应用有自己的提示词文件（Claude → `~/.claude/CLAUDE.md`、Codex → `~/.codex/AGENTS.md`、
  Gemini → `~/.gemini/GEMINI.md`、OpenCode → `~/.config/opencode/AGENTS.md`、Hermes → `~/.hermes/SOUL.md` 等）。
- 「添加提示词」→ 填名称、描述、内容 → 保存在提示词库
  `~/.cc-switch/prompt-library.json`；勾选「保存后立即启用」会直接写入目标文件。
- 「切换到此提示词」→ 先把目标文件当前内容备份到 `~/.cc-switch/backups/prompt-library/`，
  再把提示词写进目标文件；和切换供应商一样，一个应用同一时间只有一条提示词生效。
- 「停用」→ 还原到本应用第一次切换之前的状态。
- 「导入当前文件」→ 把目标文件里已有的内容收进提示词库。
- 供应商、直连 / 路由 / 聚合、额度这些 API 连接界面不再渲染（原代码保留在 `App.tsx` 里，方便以后取回）。

### Codex「全局资产」页签

Codex 应用页顶部有「提示词 / 全局资产」两个页签。全局资产默认只显示 **4 个注入后生效的位置**：

```
全局指令 AGENTS.md         [状态]  [编辑]
系统提示 system-prompt.md  [状态]  [编辑]
记忆 MEMORY.md             [状态]  [整体替换] [编辑]
规则 rules/（默认展开）    7 个规则文件，含 default.rules 工具调用白名单
工具调用与权限             sandbox_mode / approval_policy / 已注册钩子
                          [整体替换规则] [hooks.json] [config.toml]
```

下面一行「更多工具文件」默认折叠，展开后才显示技能、自定义命令、指令集、记忆的
自动维护文件等。日常只需要看上面这些。

状态徽章直接告诉你是否生效：生效（绿）、待接入 / 条件生效（黄）、未生效（灰）。
判定规则：`AGENTS.md` 非空才生效；`system-prompt.md` 取决于 `model_instructions_file`；
`MEMORY.md` 由 memories 功能读取；`rules/*` 只有 VCO / hooks 运行时才生效。

完整文件清单（扫描 `~/.codex` 的 60 个文件、8 个分组）在「更多工具文件」里：

| 分组 | 内容 |
|---|---|
| 主提示词 | `AGENTS.md`、`system-prompt.md` |
| config.toml | `model_instructions_file`、`developer_instructions`、`compact_prompt`、`experimental_compact_prompt_file`、`project_doc_max_bytes` 的当前值 |
| 记忆 | `memories/MEMORY.md`、`raw_memories.md`、`memory_summary.md`、`rollout_summaries/`、`extensions/` |
| 指令集 | `instructions/*.md`（gpt-contract、persona、unrestricted 等） |
| 规则 | `rules/default.rules`、`rules/common/*`、`rules/typescript/*` |
| 钩子与注入 | `hooks.json` + `hooks/*.py/.js/.sh`（SessionStart、UserPromptSubmit 等） |
| 自定义命令 | `prompts/*.md`（斜杠命令模板） |
| 技能 | `skills/*/SKILL.md` |

保存前自动备份到 `~/.cc-switch/backups/codex-assets/`，编辑器里可以直接还原这个文件最近 3 次备份。
路径有白名单校验，只能访问 Codex Home 下这些目录。

**整体替换**：记忆和规则分组右上角有「整体替换」按钮。勾选要覆盖的文件（默认只勾主文件：
`memories/MEMORY.md` 或 `rules/default.rules`），粘贴完整内容，一次写入所有勾选文件。
每个文件写入前都会单独备份。规则文件要保留 `prefix_rule(...)` 语法。

**生效状态**：每个文件都有状态徽章，顶部有统计和筛选（全部 / 生效 / 条件生效·待接入 / 未生效 / 自动维护）。

| 徽章 | 含义 | 判定方式 |
|---|---|---|
| 生效（绿） | Codex 会读取 | `AGENTS.md` 非空；`hooks.json` 及其引用的脚本；`prompts/*`、`skills/*`、`MEMORY.md`、`extensions/` |
| 待接入（黄） | 需要配置才能生效 | `system-prompt.md`：`config.toml` 的 `model_instructions_file` 没指向它 |
| 条件生效（黄） | 需要外部组件 | `rules/*`：只有 VCO / hooks 运行时读取才生效 |
| 未生效（灰） | 当前不会被读取 | `AGENTS.md` 为空；`instructions/*`（原生不读）；`hooks/` 里没被 `hooks.json` 引用的脚本 |
| 自动维护 | Codex 自己生成 | `raw_memories.md`、`memory_summary.md`、`rollout_summaries/*` |
| 配置 | 配置文件本身 | `config.toml` |

## 人物卡（网关注入）主界面开关

每个应用的主页面（提示词工作台）顶部都有一条「人物卡」：

- 开关点一下就把选中的卡启用 / 停用，不用再进「提示词注入」页。
- 新建人物卡时点「保存并开启」，保存后自动选中并启用这张卡。
- 卡是全局的：换应用、换连接会自动沿用，不用重新开启。
- 右侧下拉可以换卡，底部「管理」直接跳到「提示词注入 → 网关注入」的完整管理页。

「提示词注入」页默认打开「网关注入」页签，「本机文件」排在第二位。
后端数据仍在 `~/.cc-switch/prompt-cards.json`；完整管理页里可以看到注入后的 system 预览。

## 人物卡真实注入（Codex）

Codex 的请求可以真正经过人物卡代理：

1. 侧栏 →「提示词注入」→ 网关注入 →「Codex 注入代理」→「接入 Codex」。
2. 它会把 `~/.codex/config.toml` 里当前 provider 的 `base_url` 改成
   `http://localhost:5190/v1`；原地址记在 `~/.cc-switch/card-proxy.json`，
   修改前备份到 `~/.cc-switch/backups/card-proxy/`。
3. 之后 Codex 的 `/v1/responses` 请求会先到本工具，当前人物卡按 append / override
   写进 `instructions`，再转发到原来的上游。
4. 页面会显示最近一次注入的 `instructions` 末尾，可以确认卡标记；
   完整元数据日志在 `~/.cc-switch/card-proxy.log`。
5. 「恢复原地址」会把 `base_url` 改回接入前的值。**保持 `pnpm dev` 运行**，
   停掉后 Codex 会连不上。

代理支持 Responses（`instructions`）、OpenAI Chat（`messages`）、Anthropic（`system`）
三种请求体；目前只给 Codex 做了一键接入，其他客户端后续再加。

## 提示词注入（Codex 高级目标）

侧栏 →「提示词注入」。除了应用页的单一主提示词文件，这里还能操作 Codex 的另外两个位置。

| 目标 | 实际写入 |
|---|---|
| 全局指令 AGENTS.md | `~/.codex/AGENTS.md` |
| 系统提示替换 | `~/.codex/system-prompt.md`，并把 `~/.codex/config.toml` 的 `model_instructions_file` 指向它 |
| 记忆 MEMORY.md | `~/.codex/memories/MEMORY.md` |

用法：

1. 在卡片里粘贴提示词，点「注入并覆盖」（或「追加到末尾」）。
2. 每次写入前自动备份到 `~/.cc-switch/backups/inject/codex/`，状态记在
   `~/.cc-switch/inject-state.json`。
3. 「停用并还原」回到本工具第一次注入之前的状态；「备份历史」里可以还原任意一次。
4. AGENTS.md / 记忆对新会话生效；替换系统提示后重启 Codex 生效。

后端在 `server/injectApiPlugin.ts`（Vite 中间件），只在 `pnpm dev` / `pnpm preview`
下运行。纯静态打开 `dist/` 时页面会提示连不上本地后端。

## Seep 逆向工具（MCP）

侧栏 →「Seep 工具」把 [Seep-Reverse-Lab](https://github.com/angusdevgo/Seep-Reverse-Lab)
的 23 个 MCP 工具接进界面。Seep 不复制进本仓库，而是以独立的 Python stdio 进程运行
（`Tool/mcp/seep_mcp_server.py`）。

- **工具调用**：页面会拉起 Python MCP Server，读 `tools/list`，按每个工具的
  `inputSchema` 自动生成参数表单；点「调用工具」直接执行并显示结果。
- **接入 MCP**：把 `seep` 条目写进各客户端自己的 MCP 配置，客户端重启后 Agent 就能
  调用同一批工具。支持 Claude Code（`~/.claude.json`）、Codex / Grok Build
  （`config.toml` 的 `[mcp_servers.seep]`）、Gemini（`~/.gemini/settings.json`）、
  OpenCode（`opencode.json` 的 `mcp.seep`）、Pi（`~/.pi/agent/mcp.json`）、
  MiniMax Code（`~/.minimax/mcp.json`）。Hermes 使用 YAML，暂不自动写入。
- **备份**：所有配置写入前备份到 `~/.cc-switch/backups/seep-mcp/`；TOML 用标记块
  插入，尽量保留原有注释和其他 MCP 条目。
- **MCP 页联动**：接入后左侧「MCP」页会把 `seep` 作为真实条目显示，勾选 / 取消会直接
  写对应客户端的配置；其他 MCP 条目仍是演示数据。
- **换目录**：页面顶部填 Seep 仓库路径，点「重新连接」，会记到
  `~/.cc-switch/seep-config.json`。环境变量 `SEEP_ROOT` / `SEEP_PYTHON` 可覆盖默认值。
- **依赖**：本机 Python 3.10+ 和 `pip install "mcp>=1.20,<1.29"`；Seep 目录里的
  Radare2 / JADX / Apktool 由 Seep 自带。

后端在 `server/seepPlugin.ts`（Vite 中间件），只在 `pnpm dev` / `pnpm preview` 下可用。
接口：`/api/seep/overview`、`/api/seep/root`、`/api/seep/call`、`/api/seep/targets`、
`/api/seep/register`。

整合分两层：

- **客户端 MCP**（推荐）：上面「接入 MCP」把 seep 写进 Claude Code / Codex 等客户端，
  Agent 自己调用工具，走各客户端原生的 MCP 工具循环。
- **界面直调**：「工具调用」页签由本工具的 Node 桥直接向 Python MCP Server 发
  `tools/call`，适合手动验证工具和参数。
- 如果想让**网关转发时**替模型执行工具（tool_use 循环在代理里），还需要在 Rust
  代理的请求改写环中实现 MCP 客户端；当前浏览器版只做到上面两层。

> Seep-Reverse-Lab 使用 GPL-3.0。这里以独立进程方式调用、不复制其源码；如果对外分发
> Seep 本体，需要同时遵守 GPL-3.0（提供源码与许可）。这些工具只应在已授权的目标上使用。

## 假数据在哪

```
src/mock/
├── install.ts            入口第一行加载：浏览器里没有 Tauri 后端时，接住所有后端调用
├── backend.ts            按命令名分发；没写到的命令按名字给空值，并在控制台打一条 [mock]
└── handlers/
    ├── core.ts             设置、授权账号、启动时的各种检查
    ├── providers.ts        供应商页：各应用的供应商、模式、聚合名单、路由队列、卡片额度
    ├── extensions.ts       MCP、Skills、提示词
    ├── sessions.ts         会话列表和对话记录
    └── usage.ts            用量统计、应用页的版本信息
```

- 改演示内容：直接改上面这些文件里的数据。
- 接自己的后端：把 `src/lib/api/` 里对应的 `invoke("命令名")` 换成自己的接口请求，
  或者在 `handlers/` 里把假数据换成 `fetch` 你的服务器。
- 打开浏览器控制台，带 `[mock]` 的行就是页面调用了、但还没写假数据的命令。

## 和原版的区别

在原版基础上改了品牌、精简了入口，并加了提示词注入：

- 品牌改为「寒霜注入工具」，图标换成 `src/assets/icons/hanshuang-logo.png`
- 供应商 / 授权中心 / 用量统计 / 会话等 API 相关入口不再渲染
- `src/main.tsx` 第一行加了 `import "./mock/install"`
- 新增 `src/mock/`
- 新增 `server/injectApiPlugin.ts`、`src/lib/injectApi.ts`、`src/components/inject/`
- 新增 `server/promptCardsPlugin.ts`、`src/lib/promptCardsApi.ts`，以及主界面的
  `src/components/inject/RoleCardStrip.tsx`
- 新增 `server/seepPlugin.ts`、`src/lib/seepApi.ts`、`src/components/seep/`，
  把 Seep-Reverse-Lab 的 MCP 工具接到「Seep 工具」页
- 侧栏新增「提示词注入」，导航类型 `src/lib/navigation.ts` 加 `inject`
- `package.json`：去掉 Tauri 命令行和测试相关的包，`dev` 直接起 Vite，端口 5190
- 删掉了 `src/` 里的单元测试文件（`*.test.ts(x)`）

用 Tauri 打包成桌面程序时，`mock/install.ts` 会自动跳过，调用照常走真正的后端；
注入页依赖 Vite 中间件，打包成 Tauri 时需要把 `server/injectApiPlugin.ts` 的逻辑
搬进 Rust 后端（`src-tauri/src/prompt_files.rs` 已有现成的文件读写能力）。

## 版权

原版代码 MIT 许可，Copyright (c) 2025 Jason Young，许可原文见 [LICENSE-cc-switch](LICENSE-cc-switch)，发布时保留这个文件。
MIT 只授权代码，不授权品牌：对外发布时不要用「CC Switch」名称和它的 logo；
`src/icons/` 里的各家 logo 是各公司的商标。
