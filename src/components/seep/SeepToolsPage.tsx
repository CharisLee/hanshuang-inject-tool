import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Binary,
  Check,
  CircleHelp,
  Copy,
  Loader2,
  Play,
  Plug,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import { AppPageHeader } from "@/components/shell/AppPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  resultText,
  seepApi,
  type SeepOverview,
  type SeepRegisterResponse,
  type SeepSchema,
  type SeepTarget,
  type SeepTool,
} from "@/lib/seepApi";

type Tab = "tools" | "registry";

const CATEGORY_ORDER = [
  { id: "status", label: "状态与体检" },
  { id: "r2", label: "二进制 / Radare2" },
  { id: "apk", label: "Android / APK" },
  { id: "kb", label: "知识库" },
  { id: "task", label: "任务与报告" },
  { id: "other", label: "其他" },
];

/** Seep 的参数名是英文的，界面里给常用字段配个中文名。 */
const FIELD_LABELS: Record<string, string> = {
  binary_path: "目标文件路径",
  file_a: "文件 A",
  file_b: "文件 B",
  target: "函数 / 地址",
  direction: "引用方向",
  lines: "行数",
  output_mode: "输出模式",
  limit_tokens: "Token 上限",
  filter_text: "关键词过滤",
  filter_name: "函数名过滤",
  all_sections: "扫描所有段",
  limit: "条数上限",
  code_or_hex: "代码或机器码",
  arch: "架构",
  bits: "位数",
  disasm: "反汇编",
  apk_path: "APK / DEX 路径",
  output_dir: "输出目录",
  deobfuscate: "反混淆",
  no_src: "不反编译源码",
  directory: "目录",
  pattern: "匹配模式",
  case_sensitive: "区分大小写",
  framework: "Hook 框架",
  class_name: "类名",
  method_name: "方法名",
  param_types: "参数类型",
  return_type: "返回类型",
  hook_timing: "Hook 时机",
  query: "搜索关键词",
  category: "分类",
  article_path: "文档路径",
  max_chars: "最大字符数",
  checklist_type: "清单类型",
  task_name: "任务名",
  description: "描述",
  target_path: "目标路径",
  target_name: "目标名",
  vuln_type: "漏洞类型",
  branch_location: "分支位置",
  poc_summary: "PoC 摘要",
  defense_recommendation: "修复建议",
  command: "r2 命令",
};

function cleanDescription(description?: string): string {
  return (description ?? "").replace(/\n\s*Args:[\s\S]*$/i, "").trim();
}

/** 路径类参数的填写提示。 */
const FIELD_HINTS: Record<string, string> = {
  binary_path: "本机绝对路径，例如 C:/Windows/System32/notepad.exe",
  apk_path: "本机 APK / DEX 的绝对路径",
  target_path: "要分析的文件或目录的绝对路径",
  directory: "本机目录的绝对路径",
  article_path: "从知识库搜索结果里复制的文档路径",
  file_a: "本机绝对路径",
  file_b: "本机绝对路径",
  output_dir: "留空会输出到 Seep 的默认目录",
};

function categoryOf(name: string): string {
  if (name === "seep_status" || name === "seep_ida_status") return "status";
  if (name.startsWith("seep_r2_")) return "r2";
  if (name.startsWith("seep_apk_")) return "apk";
  if (name.startsWith("seep_kb_")) return "kb";
  if (
    name === "seep_task_init" ||
    name === "seep_auto_triage" ||
    name === "seep_gen_security_report"
  ) {
    return "task";
  }
  return "other";
}

function schemaType(schema: SeepSchema | undefined): string {
  if (!schema) return "string";
  if (schema.type) return schema.type;
  const found = schema.anyOf?.find((item) => item.type && item.type !== "null");
  return found?.type ?? "string";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultRawValue(schema: SeepSchema): string | boolean {
  const type = schemaType(schema);
  if (type === "boolean") return schema.default === true;
  if (schema.default === undefined || schema.default === null) return "";
  if (typeof schema.default === "object") {
    return JSON.stringify(schema.default);
  }
  return String(schema.default);
}

function buildDefaults(tool: SeepTool): Record<string, string | boolean> {
  const properties = tool.inputSchema?.properties ?? {};
  const next: Record<string, string | boolean> = {};
  for (const [key, schema] of Object.entries(properties)) {
    next[key] = defaultRawValue(schema);
  }
  return next;
}

function toArgument(
  schema: SeepSchema,
  raw: string | boolean,
): unknown | undefined {
  const type = schemaType(schema);
  if (type === "boolean") return Boolean(raw);
  const text = typeof raw === "string" ? raw : String(raw);
  if (type === "integer" || type === "number") {
    if (!text.trim()) return undefined;
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error("需要填数字");
    return type === "integer" ? Math.trunc(value) : value;
  }
  if (type === "array") {
    if (!text.trim()) return undefined;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // 不是 JSON 就按逗号 / 换行拆
    }
    return text
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (type === "object") {
    if (!text.trim()) return undefined;
    return JSON.parse(text);
  }
  if (!text.length) return undefined;
  return text;
}

function buildArguments(
  tool: SeepTool,
  raw: Record<string, string | boolean>,
): Record<string, unknown> {
  const properties = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);
  const args: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(properties)) {
    const value = toArgument(schema, raw[key] ?? "");
    if (value === undefined) {
      if (required.has(key)) {
        throw new Error(
          `「${FIELD_LABELS[key] || schema.title || key}」是必填项`,
        );
      }
      continue;
    }
    args[key] = value;
  }
  return args;
}

function isResultError(result: unknown): boolean {
  return Boolean(
    result &&
      typeof result === "object" &&
      (result as Record<string, unknown>).isError === true,
  );
}

function ToolField({
  toolName,
  name,
  schema,
  required,
  value,
  onChange,
}: {
  toolName: string;
  name: string;
  schema: SeepSchema;
  required: boolean;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  const id = `${toolName}-${name}`;
  const type = schemaType(schema);
  const label = FIELD_LABELS[name] || schema.title || name;
  const hint = FIELD_HINTS[name] ?? schema.description;

  if (type === "boolean") {
    return (
      <div className="flex items-start justify-between gap-4 rounded-control border border-border bg-app px-3 py-2.5">
        <div className="min-w-0">
          <Label htmlFor={id} className="text-body text-fg-1">
            {label}
          </Label>
          {hint ? (
            <p className="mt-0.5 text-caption text-fg-3">{hint}</p>
          ) : null}
        </div>
        <Switch
          id={id}
          checked={Boolean(value)}
          onCheckedChange={onChange}
          aria-label={label}
        />
      </div>
    );
  }

  const multiline =
    type === "array" ||
    type === "object" ||
    /description|summary|recommendation|command|code_or_hex/.test(name);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className="text-body text-fg-1">
          {label}
          {required ? (
            <span className="ms-1 text-danger-text" aria-hidden="true">
              *
            </span>
          ) : null}
        </Label>
        {name === "binary_path" ? (
          <button
            type="button"
            onClick={() => onChange("C:/Windows/System32/notepad.exe")}
            className="text-caption text-action-text hover:underline"
          >
            用 notepad.exe 示例
          </button>
        ) : null}
      </div>
      {multiline ? (
        <Textarea
          id={id}
          value={String(value ?? "")}
          spellCheck={false}
          placeholder={
            type === "array"
              ? "JSON 数组，或每行 / 逗号分隔一个值"
              : type === "object"
                ? "JSON 对象"
                : ""
          }
          onChange={(event) => onChange(event.target.value)}
          className="min-h-20 resize-y font-mono text-[12px] leading-relaxed"
        />
      ) : (
        <Input
          id={id}
          type={type === "integer" || type === "number" ? "number" : "text"}
          value={String(value ?? "")}
          spellCheck={false}
          placeholder={
            name === "binary_path"
              ? "C:/Windows/System32/notepad.exe"
              : undefined
          }
          onChange={(event) => onChange(event.target.value)}
          className="font-mono text-[12px]"
        />
      )}
      {hint ? <p className="text-caption text-fg-3">{hint}</p> : null}
    </div>
  );
}

export default function SeepToolsPage() {
  const [tab, setTab] = useState<Tab>("tools");
  const [overview, setOverview] = useState<SeepOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rootDraft, setRootDraft] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rawArgs, setRawArgs] = useState<Record<string, string | boolean>>({});
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState<{
    message: string;
    stderr?: string;
  } | null>(null);
  const [callResult, setCallResult] = useState<{
    result: unknown;
    elapsedMs?: number;
    name: string;
  } | null>(null);

  const [targets, setTargets] = useState<SeepTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [registering, setRegistering] = useState(false);
  const [backupDir, setBackupDir] = useState("");
  const [lastRegister, setLastRegister] =
    useState<SeepRegisterResponse | null>(null);

  const loadOverview = useCallback(async (refresh = false) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await seepApi.overview(refresh);
      setOverview(data);
      setRootDraft(data.root);
      setSelectedName((current) => {
        if (current && data.tools.some((tool) => tool.name === current)) {
          return current;
        }
        return (
          data.tools.find((tool) => tool.name === "seep_status")?.name ??
          data.tools[0]?.name ??
          null
        );
      });
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTargets = useCallback(async () => {
    setTargetsLoading(true);
    try {
      const data = await seepApi.targets();
      setTargets(data.targets);
      setBackupDir(data.backupDir);
    } catch (error) {
      toast.error("读取 MCP 接入状态失败", {
        description: errorMessage(error),
      });
    } finally {
      setTargetsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    void loadTargets();
  }, [loadOverview, loadTargets]);

  const tools = overview?.tools ?? [];
  const selectedTool = useMemo(
    () => tools.find((tool) => tool.name === selectedName) ?? null,
    [tools, selectedName],
  );

  useEffect(() => {
    if (selectedTool) setRawArgs(buildDefaults(selectedTool));
  }, [selectedTool?.name]);

  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? tools.filter(
          (tool) =>
            tool.name.toLowerCase().includes(query) ||
            (tool.description ?? "").toLowerCase().includes(query),
        )
      : tools;
    return CATEGORY_ORDER.map((category) => ({
      ...category,
      tools: filtered.filter((tool) => categoryOf(tool.name) === category.id),
    })).filter((group) => group.tools.length > 0);
  }, [tools, search]);

  const reconnect = async () => {
    setReconnecting(true);
    try {
      const data = await seepApi.setRoot(rootDraft.trim());
      setOverview(data);
      setRootDraft(data.root);
      setLoadError(null);
      if (data.error) {
        toast.error("连接失败", { description: data.error });
      } else {
        toast.success("已连接 Seep MCP", {
          description: `${data.tools.length} 个工具可用`,
        });
      }
    } catch (error) {
      toast.error("连接失败", { description: errorMessage(error) });
    } finally {
      setReconnecting(false);
    }
  };

  const runTool = async (tool: SeepTool, args: Record<string, unknown>) => {
    setCalling(true);
    setCallError(null);
    setCallResult(null);
    try {
      const response = await seepApi.call(tool.name, args);
      if (!response.ok) {
        setCallError({
          message: response.error ?? "调用失败",
          stderr: response.stderr,
        });
        return;
      }
      setCallResult({
        result: response.result,
        elapsedMs: response.elapsedMs,
        name: tool.name,
      });
    } catch (error) {
      setCallError({ message: errorMessage(error) });
    } finally {
      setCalling(false);
    }
  };

  const callSelected = () => {
    if (!selectedTool) return;
    let args: Record<string, unknown>;
    try {
      args = buildArguments(selectedTool, rawArgs);
    } catch (error) {
      toast.error("参数不完整", { description: errorMessage(error) });
      return;
    }
    void runTool(selectedTool, args);
  };

  const runStatus = () => {
    const statusTool =
      tools.find((tool) => tool.name === "seep_status") ?? null;
    if (!statusTool) {
      toast.error("这个 MCP 服务没有提供 seep_status");
      return;
    }
    setTab("tools");
    setSelectedName(statusTool.name);
    void runTool(statusTool, {});
  };

  const toggleApp = (app: string) => {
    setSelectedApps((current) => {
      const next = new Set(current);
      if (next.has(app)) next.delete(app);
      else next.add(app);
      return next;
    });
  };

  const register = async (enabled: boolean) => {
    const apps = [...selectedApps];
    if (apps.length === 0) {
      toast.error("先选择要接入的应用");
      return;
    }
    setRegistering(true);
    setLastRegister(null);
    try {
      const data = await seepApi.register(apps, enabled);
      setTargets(data.targets);
      setBackupDir(data.backupDir);
      setLastRegister(data);
      const ok = data.results.filter((item) => item.ok).length;
      const failed = data.results.filter((item) => !item.ok);
      if (failed.length === 0) {
        toast.success(enabled ? "已接入 MCP" : "已移除 MCP", {
          description: `${ok} 个应用已更新，备份在 ${data.backupDir}`,
        });
      } else {
        toast.warning("部分应用未更新", {
          description: failed
            .map((item) => `${item.app}: ${item.error}`)
            .join("；"),
        });
      }
    } catch (error) {
      toast.error("写入 MCP 配置失败", {
        description: errorMessage(error),
      });
    } finally {
      setRegistering(false);
    }
  };

  const copyResult = () => {
    if (!callResult) return;
    void copyText(resultText(callResult.result)).then(() => {
      toast.success("结果已复制");
    });
  };

  const copySnippet = () => {
    if (!overview) return;
    const snippet = {
      mcpServers: {
        seep: {
          type: "stdio",
          command: overview.python,
          args: [overview.serverFile],
          env: { PYTHONIOENCODING: "utf-8" },
        },
      },
    };
    void copyText(JSON.stringify(snippet, null, 2)).then(() => {
      toast.success("MCP 配置片段已复制");
    });
  };

  const supportedTargets = targets.filter((target) => target.supported);
  const allSupportedSelected =
    supportedTargets.length > 0 &&
    supportedTargets.every((target) => selectedApps.has(target.app));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppPageHeader
        icon={<Binary className="h-5 w-5" strokeWidth={1.5} />}
        title="Seep 工具"
        titleExtra={
          <SegmentedControl
            aria-label="Seep 页面"
            size="sm"
            value={tab}
            onValueChange={(value) => setTab(value as Tab)}
            items={[
              { value: "tools", label: "工具调用" },
              { value: "registry", label: "接入 MCP" },
            ]}
          />
        }
        actions={
          <Button
            variant="neutral"
            size="compact"
            disabled={loading}
            onClick={() => void loadOverview(true)}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
            刷新
          </Button>
        }
      />

      <div
        id="main-content"
        className="min-h-0 flex-1 overflow-y-auto scroll-stable"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 pb-12 pt-4">
          {loadError ? (
            <Notice tone="danger" title="连不上 Seep 桥接服务">
              {loadError}。Seep 工具页依赖 `pnpm dev` 的 Vite 中间件。
            </Notice>
          ) : null}

          {overview?.error || overview?.stderr ? (
            <Notice tone="warning" title="Seep MCP 没有正常启动">
              <span className="break-all">{overview.error}</span>
              {overview.stderr ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-caption">
                    查看 Python 错误输出
                  </summary>
                  <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-control bg-app p-2 font-mono text-[11px]">
                    {overview.stderr}
                  </pre>
                </details>
              ) : null}
            </Notice>
          ) : null}

          {/* 服务状态 */}
          <section className="rounded-card border border-border bg-surface">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-action-soft text-action-text">
                <Wrench className="h-4 w-4" strokeWidth={1.7} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-body font-semibold text-fg-1">
                    Seep 逆向工具链
                  </h2>
                  {overview?.running ? (
                    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-soft px-2 text-xs font-medium text-success-text">
                      <Check className="h-3 w-3" strokeWidth={3} />
                      已连接
                    </span>
                  ) : (
                    <span className="inline-flex h-5 items-center rounded-full bg-warning-soft px-2 text-xs font-medium text-warning-text">
                      未连接
                    </span>
                  )}
                  <Badge variant="outline" className="h-5 px-1.5 text-badge">
                    {tools.length} 个工具
                  </Badge>
                </div>
                <p className="mt-0.5 text-caption text-fg-2">
                  {overview?.server
                    ? `${overview.server.name ?? "seep"} ${overview.server.version ?? ""} · ${overview.python} @ ${overview.serverFile}`
                    : "Python stdio MCP，进程按需启动；工具链依赖 Seep 目录里的 Radare2 / JADX / Apktool。"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="neutral"
                  size="compact"
                  disabled={!overview?.ready || calling}
                  onClick={runStatus}
                >
                  <Play className="h-3.5 w-3.5" />
                  运行体检
                </Button>
                <HelpTip title="工具调用只在本机执行">
                  Seep 会在本机启动 Python 进程并运行逆向工具。请只对已获得授权的目标使用。
                </HelpTip>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
              <Label
                htmlFor="seep-root"
                className="shrink-0 text-caption text-fg-3"
              >
                Seep 目录
              </Label>
              <Input
                id="seep-root"
                value={rootDraft}
                spellCheck={false}
                placeholder="例如 D:\seep-reverse-lab"
                onChange={(event) => setRootDraft(event.target.value)}
                className="min-w-0 flex-1 font-mono text-[12px]"
              />
              <Button
                variant="solid"
                size="compact"
                disabled={reconnecting || !rootDraft.trim()}
                onClick={() => void reconnect()}
              >
                {reconnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plug className="h-3.5 w-3.5" />
                )}
                重新连接
              </Button>
            </div>
          </section>

          {tab === "tools" ? (
            <>
              <details
                open
                className="rounded-card border border-border bg-surface px-4 py-3"
              >
                <summary className="flex cursor-pointer items-center gap-2 text-caption font-medium text-fg-1">
                  <CircleHelp className="h-3.5 w-3.5 text-action-text" />
                  Seep 工具怎么用（3 步）
                </summary>
                <ol className="mt-2 list-decimal space-y-1 ps-5 text-caption leading-relaxed text-fg-2">
                  <li>
                    先点「运行体检」，确认 Radare2 / JADX / Apktool 都是 Ready。
                  </li>
                  <li>
                    左侧按目标选工具：EXE / DLL / SO 选「二进制 / Radare2」，
                    APK 选「Android / APK」，找思路选「知识库」。
                  </li>
                  <li>
                    带路径的工具填本机绝对路径（例如
                    <code className="mx-1 font-mono">
                      C:/Windows/System32/notepad.exe
                    </code>
                    ），点「调用工具」；结果会显示在下方。
                  </li>
                  <li>
                    想让 Claude Code / Codex 等 Agent 自己调用，去「接入 MCP」
                    勾选客户端，重启客户端即可。
                  </li>
                </ol>
              </details>
              <div className="grid min-h-0 gap-4 md:grid-cols-[270px_minmax(0,1fr)]">
              {/* 工具列表 */}
              <section className="rounded-card border border-border bg-surface md:sticky md:top-4 md:max-h-[calc(100vh-190px)] md:self-start md:overflow-y-auto">
                <div className="sticky top-0 z-10 border-b border-border bg-surface p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="搜索工具"
                      className="h-8 w-full rounded-control border border-border bg-app pl-8 pr-3 text-body text-fg-1 outline-none transition-colors placeholder:text-fg-3 focus:border-border-strong"
                    />
                  </div>
                </div>
                {loading && tools.length === 0 ? (
                  <div className="py-12 text-center text-body text-fg-2">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    正在连接 Seep MCP…
                  </div>
                ) : grouped.length === 0 ? (
                  <p className="px-4 py-8 text-center text-caption text-fg-3">
                    {tools.length === 0 ? "还没有读到工具。" : "没有匹配的工具。"}
                  </p>
                ) : (
                  <div className="p-2">
                    {grouped.map((group) => (
                      <div key={group.id} className="mb-2 last:mb-0">
                        <div className="px-2 py-1 text-badge font-medium uppercase tracking-wide text-fg-3">
                          {group.label}
                        </div>
                        {group.tools.map((tool) => (
                          <button
                            key={tool.name}
                            type="button"
                            onClick={() => setSelectedName(tool.name)}
                            className={cn(
                              "flex w-full flex-col gap-0.5 rounded-control px-2 py-1.5 text-start transition-colors hover:bg-subtle",
                              selectedName === tool.name && "bg-selected",
                            )}
                          >
                            <span className="truncate font-mono text-[12px] text-fg-1">
                              {tool.name}
                            </span>
                            <span className="line-clamp-2 text-caption leading-[15px] text-fg-3">
                              {cleanDescription(tool.description).split("\n")[0] ||
                                "无描述"}
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 工具详情 */}
              <div className="min-w-0 space-y-4">
                {selectedTool ? (
                  <>
                    <section className="rounded-card border border-border bg-surface">
                      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
                        <div className="min-w-0">
                          <h2 className="break-all font-mono text-body font-semibold text-fg-1">
                            {selectedTool.name}
                          </h2>
                          <p className="mt-1 whitespace-pre-wrap text-caption leading-relaxed text-fg-2">
                            {cleanDescription(selectedTool.description) ||
                              "无描述"}
                          </p>
                        </div>
                        <Button
                          variant="neutral"
                          size="compact"
                          onClick={() =>
                            void copyText(selectedTool.name).then(() =>
                              toast.success("工具名已复制"),
                            )
                          }
                        >
                          <Copy className="h-3.5 w-3.5" />
                          复制名字
                        </Button>
                      </header>

                      <div className="space-y-3 p-4">
                        {Object.entries(
                          selectedTool.inputSchema?.properties ?? {},
                        ).length === 0 ? (
                          <p className="text-caption text-fg-3">
                            这个工具不需要参数。
                          </p>
                        ) : (
                          Object.entries(
                            selectedTool.inputSchema?.properties ?? {},
                          ).map(([name, schema]) => (
                            <ToolField
                              key={name}
                              toolName={selectedTool.name}
                              name={name}
                              schema={schema}
                              required={(
                                selectedTool.inputSchema?.required ?? []
                              ).includes(name)}
                              value={rawArgs[name] ?? ""}
                              onChange={(value) =>
                                setRawArgs((current) => ({
                                  ...current,
                                  [name]: value,
                                }))
                              }
                            />
                          ))
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          <Button
                            variant="solid"
                            size="compact"
                            disabled={calling}
                            onClick={callSelected}
                          >
                            {calling ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                            调用工具
                          </Button>
                        </div>
                      </div>
                    </section>

                    {callError ? (
                      <Notice tone="danger" title="调用失败">
                        <span className="break-all">{callError.message}</span>
                        {callError.stderr ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-caption">
                              Python 错误输出
                            </summary>
                            <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-control bg-app p-2 font-mono text-[11px]">
                              {callError.stderr}
                            </pre>
                          </details>
                        ) : null}
                      </Notice>
                    ) : null}

                    {callResult ? (
                      <section
                        className={cn(
                          "rounded-card border bg-surface",
                          isResultError(callResult.result)
                            ? "border-danger/40"
                            : "border-border",
                        )}
                      >
                        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                          <h2 className="text-body font-semibold text-fg-1">
                            调用结果
                          </h2>
                          <span className="font-mono text-caption text-fg-3">
                            {callResult.name}
                          </span>
                          {callResult.elapsedMs != null ? (
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-badge"
                            >
                              {callResult.elapsedMs} ms
                            </Badge>
                          ) : null}
                          {isResultError(callResult.result) ? (
                            <Badge
                              variant="outline"
                              className="h-5 border-danger/40 px-1.5 text-badge text-danger-text"
                            >
                              isError
                            </Badge>
                          ) : null}
                          <Button
                            variant="quiet"
                            size="compact"
                            className="ms-auto"
                            onClick={copyResult}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            复制
                          </Button>
                        </header>
                        <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[11.5px] leading-relaxed text-fg-1">
                          {resultText(callResult.result)}
                        </pre>
                      </section>
                    ) : null}
                  </>
                ) : (
                  <section className="rounded-card border border-dashed border-border-strong px-6 py-16 text-center">
                    <p className="text-body font-medium text-fg-1">
                      选一个工具开始
                    </p>
                    <p className="mt-1 text-caption text-fg-3">
                      左侧是 Seep 的 23 个逆向 / APK / 知识库工具。
                    </p>
                  </section>
                )}
              </div>
            </div>
            </>
          ) : (
            <div className="space-y-4">
              <Notice tone="warning" title="这些工具会执行本地逆向命令">
                Seep 会在本机运行 Radare2、JADX、Apktool 等工具，请只对已获得授权的
                目标使用。
              </Notice>

              <section className="rounded-card border border-border bg-surface">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div>
                    <h2 className="text-body font-semibold text-fg-1">
                      接入客户端 MCP
                    </h2>
                    <p className="mt-0.5 text-caption text-fg-2">
                      把 seep 写进各客户端自己的 MCP 配置；重启客户端后就能在
                      Agent 里调用这 23 个工具。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="quiet"
                      size="compact"
                      disabled={targetsLoading}
                      onClick={() => {
                        if (allSupportedSelected) setSelectedApps(new Set());
                        else
                          setSelectedApps(
                            new Set(supportedTargets.map((t) => t.app)),
                          );
                      }}
                    >
                      {allSupportedSelected ? "清空选择" : "全选"}
                    </Button>
                    <Button
                      variant="neutral"
                      size="compact"
                      disabled={registering || selectedApps.size === 0}
                      onClick={() => void register(false)}
                    >
                      移除
                    </Button>
                    <Button
                      variant="solid"
                      size="compact"
                      disabled={registering || selectedApps.size === 0}
                      onClick={() => void register(true)}
                    >
                      {registering ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plug className="h-3.5 w-3.5" />
                      )}
                      接入选中应用
                    </Button>
                  </div>
                </header>

                {targetsLoading && targets.length === 0 ? (
                  <div className="py-10 text-center text-body text-fg-2">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {targets.map((target) => {
                      const checked = selectedApps.has(target.app);
                      return (
                        <li
                          key={target.app}
                          className={cn(
                            "flex flex-wrap items-center gap-3 px-4 py-2.5",
                            !target.supported && "opacity-60",
                          )}
                        >
                          <button
                            type="button"
                            aria-label={
                              checked ? "取消选择" : "选择该应用"
                            }
                            aria-pressed={checked}
                            disabled={!target.supported}
                            onClick={() => toggleApp(target.app)}
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                              checked
                                ? "border-transparent bg-action text-action-fg"
                                : "border-border text-transparent hover:border-border-strong",
                            )}
                          >
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-body text-fg-1">
                                {target.label}
                              </span>
                              {target.installed && target.matches ? (
                                <span className="inline-flex h-5 items-center rounded-full bg-success-soft px-2 text-xs font-medium text-success-text">
                                  已接入
                                </span>
                              ) : target.installed ? (
                                <span className="inline-flex h-5 items-center rounded-full bg-warning-soft px-2 text-xs font-medium text-warning-text">
                                  已接入（其他路径）
                                </span>
                              ) : target.supported ? (
                                <span className="inline-flex h-5 items-center rounded-full bg-subtle px-2 text-xs font-medium text-fg-2">
                                  未接入
                                </span>
                              ) : (
                                <span className="inline-flex h-5 items-center rounded-full bg-warning-soft px-2 text-xs font-medium text-warning-text">
                                  暂不支持
                                </span>
                              )}
                              {!target.exists && target.supported ? (
                                <span className="text-caption text-fg-3">
                                  配置文件还不存在
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 break-all font-mono text-[11px] text-fg-3">
                              {target.path}
                            </div>
                            {target.installed && target.matches === false ? (
                              <p className="mt-0.5 text-caption text-warning-text">
                                当前指向另一个 Seep 副本；点「接入选中应用」会改成上面配置的目录。
                              </p>
                            ) : null}
                            {target.note ? (
                              <p className="mt-0.5 text-caption text-fg-3">
                                {target.note}
                              </p>
                            ) : null}
                            {target.error ? (
                              <p className="mt-0.5 break-all text-caption text-danger-text">
                                {target.error}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="rounded-card border border-border bg-surface">
                <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <h2 className="text-body font-semibold text-fg-1">
                    手动配置片段
                  </h2>
                  <Button
                    variant="neutral"
                    size="compact"
                    disabled={!overview}
                    onClick={copySnippet}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </Button>
                </header>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-[11px] leading-relaxed text-fg-2">
                  {overview
                    ? JSON.stringify(
                        {
                          mcpServers: {
                            seep: {
                              type: "stdio",
                              command: overview.python,
                              args: [overview.serverFile],
                              env: { PYTHONIOENCODING: "utf-8" },
                            },
                          },
                        },
                        null,
                        2,
                      )
                    : "先连接 Seep 再复制。"}
                </pre>
                <p className="border-t border-border px-4 py-2 text-caption text-fg-3">
                  备份目录：{backupDir || "~/.cc-switch/backups/seep-mcp/"}
                </p>
              </section>

              {lastRegister ? (
                <section className="rounded-card border border-border bg-surface p-4">
                  <h2 className="text-body font-semibold text-fg-1">
                    上次写入结果
                  </h2>
                  <ul className="mt-2 space-y-1 text-caption">
                    {lastRegister.results.map((result) => (
                      <li
                        key={result.app}
                        className={
                          result.ok ? "text-fg-2" : "text-danger-text"
                        }
                      >
                        {result.app}：
                        {result.ok
                          ? `成功${result.backup ? `，备份 ${result.backup}` : ""}`
                          : result.error}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <Notice tone="neutral" title="关于 Seep 的许可">
                Seep-Reverse-Lab 使用 GPL-3.0。这里以独立进程方式调用它，不复制它的
                源码；如果你把 Seep 一起分发，需要同时遵守 GPL-3.0（提供源码与许可）。
              </Notice>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
