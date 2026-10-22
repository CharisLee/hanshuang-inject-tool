/**
 * Seep 逆向工具 MCP 桥 —— Vite 中间件。
 *
 * Seep（https://github.com/angusdevgo/Seep-Reverse-Lab，GPL-3.0）是一个独立的
 * Python MCP Server，暴露 23 个逆向 / APK / 知识库工具。这里不复制它的源码，
 * 只做两件事：
 *
 * 1. 以 stdio 子进程方式拉起它，转发 MCP JSON-RPC（tools/list、tools/call），
 *    让界面能直接列工具、填参数、看结果。
 * 2. 把 `seep` 这个 stdio MCP 条目写进各客户端自己的 MCP 配置文件，让 Claude Code /
 *    Codex / Gemini 等 Agent 也能调用同一批工具。
 *
 * 只在 `pnpm dev` / `pnpm preview` 下运行。所有配置写入前都会备份到
 * ~/.cc-switch/backups/seep-mcp/。
 */
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { parse as parseToml } from "smol-toml";

// HANSHUANG_HOME 只用于本地测试（见 README）；正常运行时就是用户主目录。
const HOME = process.env.HANSHUANG_HOME || os.homedir();
const CONFIG_FILE = path.join(HOME, ".cc-switch", "seep-config.json");
const BACKUP_DIR = path.join(HOME, ".cc-switch", "backups", "seep-mcp");
const SERVER_REL = path.join("Tool", "mcp", "seep_mcp_server.py");
const PYTHON = process.env.SEEP_PYTHON || "python";
const PROTOCOL_VERSION = "2025-06-18";
const CALL_TIMEOUT_MS = 600_000;

const TOML_START = "# >>> 寒霜注入工具: seep MCP >>>";
const TOML_END = "# <<< 寒霜注入工具: seep MCP <<<";

interface SeepConfig {
  root?: string;
}

interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

// ───────────────────────────── 配置与路径 ─────────────────────────────

async function readConfig(): Promise<SeepConfig> {
  try {
    const text = await fsp.readFile(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(text) as SeepConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeConfig(config: SeepConfig) {
  await fsp.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fsp.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

function defaultRootCandidates(): string[] {
  return [
    process.env.SEEP_ROOT,
    path.join(os.homedir(), "seep-reverse-lab"),
    path.join(os.homedir(), "Seep-Reverse-Lab"),
  ].filter((value): value is string => Boolean(value));
}

function serverFileOf(root: string): string {
  return path.join(root, SERVER_REL);
}

async function isSeepRoot(root: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(serverFileOf(root));
    return stat.isFile();
  } catch {
    return false;
  }
}

async function resolveRoot(): Promise<string> {
  const config = await readConfig();
  if (config.root && (await isSeepRoot(config.root))) return config.root;
  for (const candidate of defaultRootCandidates()) {
    if (await isSeepRoot(candidate)) {
      await writeConfig({ root: candidate });
      return candidate;
    }
  }
  return config.root ?? defaultRootCandidates()[0] ?? "";
}

// ───────────────────────────── MCP stdio 客户端 ─────────────────────────────

class SeepSession {
  readonly root: string;
  private child: ChildProcessWithoutNullStreams | null = null;
  private reader: readline.Interface | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private starting: Promise<void> | null = null;
  private stderrLines: string[] = [];
  private tools: ToolInfo[] | null = null;
  private serverInfo: { name?: string; version?: string } | null = null;

  constructor(root: string) {
    this.root = root;
  }

  get running(): boolean {
    return this.child != null;
  }

  get cachedTools(): ToolInfo[] {
    return this.tools ?? [];
  }

  get info(): { name?: string; version?: string } | null {
    return this.serverInfo;
  }

  get stderrTail(): string {
    return this.stderrLines.slice(-40).join("\n");
  }

  async ensureStarted(): Promise<void> {
    if (this.child) return;
    if (!this.starting) {
      this.starting = this.start().finally(() => {
        this.starting = null;
      });
    }
    await this.starting;
  }

  private async start(): Promise<void> {
    const serverFile = serverFileOf(this.root);
    if (!(await isSeepRoot(this.root))) {
      throw new Error(`找不到 Seep MCP 服务：${serverFile}`);
    }

    const child = spawn(PYTHON, [serverFile], {
      cwd: this.root,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1",
      },
    });
    this.child = child;
    liveSessions.add(this);
    registerProcessCleanup();
    this.tools = null;
    this.serverInfo = null;
    this.stderrLines = [];

    child.on("error", (error) => {
      this.failAll(error);
      this.child = null;
    });
    child.on("exit", (code, signal) => {
      this.failAll(
        new Error(
          `Seep MCP 进程已退出（code=${code ?? "null"}, signal=${signal ?? "null"}）`,
        ),
      );
      this.child = null;
      this.tools = null;
      this.serverInfo = null;
      liveSessions.delete(this);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trimEnd();
      if (!text) return;
      this.stderrLines.push(text);
      if (this.stderrLines.length > 80) {
        this.stderrLines.splice(0, this.stderrLines.length - 80);
      }
    });

    this.reader = readline.createInterface({ input: child.stdout });
    this.reader.on("line", (line) => this.handleLine(line));

    try {
      const init = (await this.sendRequest(
        "initialize",
        {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "hanshuang-inject-tool", version: "1.0.0" },
        },
        30_000,
      )) as { serverInfo?: { name?: string; version?: string } };
      this.serverInfo = init?.serverInfo ?? null;
      this.notify("notifications/initialized", {});
      const list = (await this.sendRequest("tools/list", {}, 30_000)) as {
        tools?: ToolInfo[];
      };
      this.tools = Array.isArray(list?.tools) ? list.tools : [];
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  private handleLine(line: string) {
    if (!line.trim()) return;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      this.stderrLines.push(`[non-json stdout] ${line.slice(0, 500)}`);
      return;
    }

    // 服务端反向请求（sampling / roots 等）当前不支持，明确回错误以免它一直等。
    if (message.method && message.id != null) {
      this.write({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: "客户端不支持该服务端请求" },
      });
      return;
    }

    const id = typeof message.id === "number" ? message.id : null;
    if (id == null) return; // 通知
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(new Error(JSON.stringify(message.error)));
    } else {
      pending.resolve(message.result);
    }
  }

  private write(payload: unknown) {
    if (!this.child) throw new Error("Seep MCP 进程未启动");
    this.child.stdin.write(JSON.stringify(payload) + "\n");
  }

  private notify(method: string, params: unknown) {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private sendRequest(
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时（${Math.round(timeoutMs / 1000)} 秒）`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private failAll(error: Error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  async refreshTools(): Promise<ToolInfo[]> {
    await this.ensureStarted();
    const list = (await this.sendRequest("tools/list", {}, 30_000)) as {
      tools?: ToolInfo[];
    };
    this.tools = Array.isArray(list?.tools) ? list.tools : [];
    return this.tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs = CALL_TIMEOUT_MS,
  ): Promise<unknown> {
    await this.ensureStarted();
    return await this.sendRequest(
      "tools/call",
      { name, arguments: args },
      timeoutMs,
    );
  }

  stop() {
    this.failAll(new Error("Seep MCP 会话已关闭"));
    try {
      this.reader?.close();
    } catch {
      // ignore
    }
    this.reader = null;
    const child = this.child;
    this.child = null;
    this.tools = null;
    this.serverInfo = null;
    liveSessions.delete(this);
    if (child) {
      try {
        child.stdin.end();
      } catch {
        // ignore
      }
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
  }
}

let session: SeepSession | null = null;
const liveSessions = new Set<SeepSession>();
let cleanupRegistered = false;

/** Vite 重启 / 退出时尽量带走 Python 子进程，避免留下一堆 seep_mcp_server。 */
function registerProcessCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  const cleanup = () => {
    for (const current of liveSessions) current.stop();
    liveSessions.clear();
  };
  process.once("exit", cleanup);
  process.once("beforeExit", cleanup);
}

async function getSession(): Promise<SeepSession> {
  const root = await resolveRoot();
  if (!session || session.root !== root) {
    session?.stop();
    session = new SeepSession(root);
  }
  return session;
}

// ───────────────────────────── 客户端 MCP 配置 ─────────────────────────────

type TargetKind = "json" | "toml" | "yaml";

interface TargetDef {
  app: string;
  label: string;
  kind: TargetKind;
  file: () => string;
  /** JSON 里放服务器的对象键 */
  holder?: string;
  supported: boolean;
  note?: string;
}

const TARGETS: TargetDef[] = [
  {
    app: "claude",
    label: "Claude Code",
    kind: "json",
    file: () => path.join(HOME, ".claude.json"),
    holder: "mcpServers",
    supported: true,
  },
  {
    app: "codex",
    label: "Codex",
    kind: "toml",
    file: () => path.join(HOME, ".codex", "config.toml"),
    supported: true,
  },
  {
    app: "gemini",
    label: "Gemini CLI",
    kind: "json",
    file: () => path.join(HOME, ".gemini", "settings.json"),
    holder: "mcpServers",
    supported: true,
  },
  {
    app: "grokbuild",
    label: "Grok Build",
    kind: "toml",
    file: () => path.join(HOME, ".grok", "config.toml"),
    supported: true,
  },
  {
    app: "opencode",
    label: "OpenCode",
    kind: "json",
    file: () => path.join(HOME, ".config", "opencode", "opencode.json"),
    holder: "mcp",
    supported: true,
  },
  {
    app: "pi",
    label: "Pi",
    kind: "json",
    file: () => path.join(HOME, ".pi", "agent", "mcp.json"),
    holder: "mcpServers",
    supported: true,
  },
  {
    app: "mcode",
    label: "MiniMax Code",
    kind: "json",
    file: () => path.join(HOME, ".minimax", "mcp.json"),
    holder: "mcpServers",
    supported: true,
  },
  {
    app: "hermes",
    label: "Hermes",
    kind: "yaml",
    file: () => path.join(HOME, ".hermes", "config.yaml"),
    supported: false,
    note: "Hermes 使用 YAML 配置，当前版本暂不自动写入；可在 Hermes 里手动添加。",
  },
];

function targetOf(app: string): TargetDef {
  const target = TARGETS.find((item) => item.app === app);
  if (!target) throw new Error(`未知应用：${app}`);
  return target;
}

function stdioSpec(serverFile: string) {
  return {
    type: "stdio",
    command: PYTHON,
    args: [serverFile],
    env: { PYTHONIOENCODING: "utf-8" },
  };
}

function specForTarget(target: TargetDef, serverFile: string): unknown {
  const spec = stdioSpec(serverFile);
  if (target.app === "gemini") {
    // Gemini 不使用 type 字段，由 command/url 推断传输方式。
    return { command: spec.command, args: spec.args, env: spec.env };
  }
  if (target.app === "opencode") {
    // OpenCode：local + command 数组 + environment。
    return {
      type: "local",
      command: [spec.command, ...spec.args],
      environment: spec.env,
      enabled: true,
    };
  }
  return spec;
}

async function readJsonFile(file: string): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await fsp.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`读取 ${file} 失败：${message}`);
  }
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("顶层不是对象");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`读取 ${file} 失败：${message}`);
  }
}

async function readTextFile(file: string): Promise<string> {
  try {
    return await fsp.readFile(file, "utf8");
  } catch {
    return "";
  }
}

async function backupFile(file: string): Promise<string | null> {
  try {
    await fsp.access(file);
  } catch {
    return null;
  }
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const backup = path.join(
    BACKUP_DIR,
    `${Date.now()}-${path.basename(file)}`,
  );
  await fsp.copyFile(file, backup);
  return backup;
}

async function writeFileAtomic(file: string, content: string) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(temp, content, "utf8");
  try {
    await fsp.rename(temp, file);
  } catch {
    await fsp.rm(file, { force: true });
    await fsp.rename(temp, file);
  }
}

function jsonHolderOf(
  data: Record<string, unknown>,
  holder: string,
): Record<string, unknown> {
  const current = data[holder];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return current as Record<string, unknown>;
  }
  const next: Record<string, unknown> = {};
  data[holder] = next;
  return next;
}

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function seepEntryState(
  value: unknown,
  serverFile: string,
): { installed: boolean; matches: boolean } {
  if (!value || typeof value !== "object") {
    return { installed: false, matches: false };
  }
  const record = value as Record<string, unknown>;
  const args = Array.isArray(record.args) ? record.args : [];
  const command = Array.isArray(record.command) ? record.command : [];
  const paths = [...args, ...command].filter(
    (item): item is string => typeof item === "string",
  );
  const installed = paths.some((item) =>
    normalizePath(item).endsWith("seep_mcp_server.py"),
  );
  const target = normalizePath(serverFile);
  return {
    installed,
    matches: paths.some((item) => normalizePath(item) === target),
  };
}

function stripSeepToml(text: string): string {
  let next = text;
  // 标记块
  const marker = new RegExp(
    `\\n?${TOML_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${TOML_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`,
    "g",
  );
  next = next.replace(marker, "\n");

  // 无标记的 [mcp_servers.seep] 表（含它下面的子表）
  const lines = next.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^\s*\[mcp_servers\.seep\]\s*$/.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && /^\s*\[/.test(line)) {
      skipping = false;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function seepTomlBlock(serverFile: string): string {
  return [
    TOML_START,
    "[mcp_servers.seep]",
    `command = ${JSON.stringify(PYTHON)}`,
    `args = [${JSON.stringify(serverFile)}]`,
    'env = { PYTHONIOENCODING = "utf-8" }',
    TOML_END,
  ].join("\n");
}

async function setJsonTarget(
  target: TargetDef,
  serverFile: string,
  enabled: boolean,
): Promise<{ changed: boolean; backup: string | null }> {
  const file = target.file();
  const data = await readJsonFile(file);
  const holder = jsonHolderOf(data, target.holder ?? "mcpServers");
  if (enabled) {
    holder.seep = specForTarget(target, serverFile);
  } else {
    delete holder.seep;
  }
  const backup = await backupFile(file);
  await writeFileAtomic(file, JSON.stringify(data, null, 2) + "\n");
  return { changed: true, backup };
}

async function setTomlTarget(
  target: TargetDef,
  serverFile: string,
  enabled: boolean,
): Promise<{ changed: boolean; backup: string | null }> {
  const file = target.file();
  const existing = await readTextFile(file);
  const base = stripSeepToml(existing);
  const next = enabled
    ? `${base}${base ? "\n\n" : ""}${seepTomlBlock(serverFile)}\n`
    : `${base}${base ? "\n" : ""}`;
  if (next === existing) return { changed: false, backup: null };
  const backup = await backupFile(file);
  await writeFileAtomic(file, next);
  return { changed: true, backup };
}

async function setTarget(
  app: string,
  serverFile: string,
  enabled: boolean,
): Promise<{ changed: boolean; backup: string | null }> {
  const target = targetOf(app);
  if (!target.supported) throw new Error(target.note ?? "该应用暂不支持");
  if (target.kind === "json") return setJsonTarget(target, serverFile, enabled);
  if (target.kind === "toml") return setTomlTarget(target, serverFile, enabled);
  throw new Error(target.note ?? "该应用暂不支持");
}

function targetStatus(target: TargetDef, serverFile: string) {
  return (async () => {
    const file = target.file();
    let exists = false;
    try {
      await fsp.access(file);
      exists = true;
    } catch {
      // not exists
    }

    if (!target.supported) {
      return {
        app: target.app,
        label: target.label,
        supported: false,
        path: file,
        exists,
        installed: false,
        note: target.note,
      };
    }

    if (!exists) {
      return {
        app: target.app,
        label: target.label,
        supported: true,
        path: file,
        exists: false,
        installed: false,
      };
    }

    try {
      if (target.kind === "json") {
        const data = await readJsonFile(file);
        const holder = data[target.holder ?? "mcpServers"];
        const entry =
          holder && typeof holder === "object"
            ? (holder as Record<string, unknown>).seep
            : undefined;
        const state = seepEntryState(entry, serverFile);
        return {
          app: target.app,
          label: target.label,
          supported: true,
          path: file,
          exists,
          installed: state.installed,
          matches: state.matches,
        };
      }
      if (target.kind === "toml") {
        const text = await readTextFile(file);
        const parsed = parseToml(text) as Record<string, unknown>;
        const servers = parsed.mcp_servers;
        const entry =
          servers && typeof servers === "object"
            ? (servers as Record<string, unknown>).seep
            : undefined;
        const state = seepEntryState(entry, serverFile);
        return {
          app: target.app,
          label: target.label,
          supported: true,
          path: file,
          exists,
          installed: state.installed,
          matches: state.matches,
        };
      }
    } catch (error) {
      return {
        app: target.app,
        label: target.label,
        supported: true,
        path: file,
        exists,
        installed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      app: target.app,
      label: target.label,
      supported: true,
      path: file,
      exists,
      installed: false,
    };
  })();
}

async function targetStatuses(serverFile: string) {
  return await Promise.all(TARGETS.map((target) => targetStatus(target, serverFile)));
}

// ───────────────────────────── HTTP ─────────────────────────────

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2 * 1024 * 1024) throw new Error("请求体超过 2 MB");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

async function overview(refresh = false) {
  const root = await resolveRoot();
  const serverFile = serverFileOf(root);
  const ready = await isSeepRoot(root);
  if (!ready) {
    return {
      root,
      serverFile,
      python: PYTHON,
      ready: false,
      running: false,
      tools: [],
      error: `找不到 Seep MCP 服务：${serverFile}。请先克隆 Seep-Reverse-Lab，或修改上面的路径。`,
    };
  }

  try {
    const current = await getSession();
    await current.ensureStarted();
    const tools = refresh ? await current.refreshTools() : current.cachedTools;
    return {
      root,
      serverFile,
      python: PYTHON,
      ready: true,
      running: current.running,
      server: current.info,
      tools,
    };
  } catch (error) {
    return {
      root,
      serverFile,
      python: PYTHON,
      ready: true,
      running: false,
      tools: [],
      error: error instanceof Error ? error.message : String(error),
      stderr: session?.stderrTail ?? "",
    };
  }
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const route = url.pathname;
  if (!route.startsWith("/api/seep")) return false;

  try {
    if (req.method === "GET" && route === "/api/seep/overview") {
      sendJson(res, 200, await overview(url.searchParams.get("refresh") === "1"));
      return true;
    }

    if (req.method === "POST" && route === "/api/seep/root") {
      const body = await readBody(req);
      const root = typeof body.root === "string" ? body.root.trim() : "";
      if (!root) throw new Error("缺少 Seep 目录");
      const resolved = path.resolve(root);
      if (!(await isSeepRoot(resolved))) {
        throw new Error(`该目录下找不到 ${SERVER_REL}：${resolved}`);
      }
      session?.stop();
      session = null;
      await writeConfig({ root: resolved });
      sendJson(res, 200, await overview(false));
      return true;
    }

    if (req.method === "POST" && route === "/api/seep/call") {
      const body = await readBody(req);
      const name = typeof body.name === "string" ? body.name : "";
      if (!name) throw new Error("缺少工具名");
      const args =
        body.arguments && typeof body.arguments === "object"
          ? (body.arguments as Record<string, unknown>)
          : {};
      const timeoutMs =
        typeof body.timeoutMs === "number" && body.timeoutMs > 0
          ? Math.min(body.timeoutMs, CALL_TIMEOUT_MS)
          : CALL_TIMEOUT_MS;
      const startedAt = Date.now();
      try {
        const current = await getSession();
        const result = await current.callTool(name, args, timeoutMs);
        sendJson(res, 200, {
          ok: true,
          result,
          elapsedMs: Date.now() - startedAt,
        });
      } catch (error) {
        sendJson(res, 200, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          stderr: session?.stderrTail ?? "",
          elapsedMs: Date.now() - startedAt,
        });
      }
      return true;
    }

    if (req.method === "GET" && route === "/api/seep/targets") {
      const root = await resolveRoot();
      sendJson(res, 200, {
        targets: await targetStatuses(serverFileOf(root)),
        backupDir: BACKUP_DIR,
      });
      return true;
    }

    if (req.method === "POST" && route === "/api/seep/register") {
      const body = await readBody(req);
      const apps = Array.isArray(body.apps)
        ? body.apps.filter(
            (item): item is string => typeof item === "string",
          )
        : [];
      const enabled = body.enabled !== false;
      if (apps.length === 0) throw new Error("没有选择应用");
      const root = await resolveRoot();
      if (!(await isSeepRoot(root))) {
        throw new Error(`找不到 Seep MCP 服务：${serverFileOf(root)}`);
      }
      const serverFile = serverFileOf(root);
      const results = [];
      for (const app of apps) {
        try {
          const result = await setTarget(app, serverFile, enabled);
          results.push({
            app,
            ok: true,
            changed: result.changed,
            backup: result.backup,
          });
        } catch (error) {
          results.push({
            app,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      sendJson(res, 200, {
        results,
        targets: await targetStatuses(serverFile),
        backupDir: BACKUP_DIR,
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

export function seepPlugin(): Plugin {
  return {
    name: "hanshuang-seep",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        void handleApi(req, res, url).then((handled) => {
          if (!handled) next();
        });
      });
      server.httpServer?.on("close", () => {
        session?.stop();
        session = null;
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        void handleApi(req, res, url).then((handled) => {
          if (!handled) next();
        });
      });
      server.httpServer?.on("close", () => {
        session?.stop();
        session = null;
      });
    },
    closeBundle() {
      session?.stop();
      session = null;
    },
  };
}
