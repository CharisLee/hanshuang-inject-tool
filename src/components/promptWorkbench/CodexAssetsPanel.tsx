import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  FileCode2,
  Loader2,
  Pencil,
  RotateCcw,
} from "lucide-react";
import {
  codexAssetsApi,
  formatAssetSize,
  formatAssetTime,
  type CodexAssetBackup,
  type CodexAssetFile,
  type CodexAssetsOverview,
} from "@/lib/codexAssetsApi";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function StatusBadge({ status }: { status: CodexAssetFile["status"] }) {
  const style =
    status.level === "active"
      ? "bg-success-soft text-success-text"
      : status.level === "conditional"
        ? "bg-warning-soft text-warning-text"
        : status.level === "inactive"
          ? "bg-subtle text-fg-3"
          : "bg-subtle text-fg-2";
  return (
    <span
      title={status.reason}
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium",
        style,
      )}
    >
      {status.label}
    </span>
  );
}

function ToolingCard({
  overview,
  onEditConfig,
  onEditHooks,
  onEditRules,
}: {
  overview: CodexAssetsOverview;
  onEditConfig: () => void;
  onEditHooks: () => void;
  onEditRules: () => void;
}) {
  const security = overview.security;
  const rows: Array<[string, string]> = [
    [
      "sandbox_mode",
      security.sandboxMode ?? "（未设置，使用 Codex 默认）",
    ],
    [
      "approval_policy",
      security.approvalPolicy ?? "（未设置，使用 Codex 默认）",
    ],
    [
      "windows.sandbox",
      security.windowsSandbox ?? "（未设置）",
    ],
    [
      "规则决策",
      `放行 ${security.rules.allow} · 拒绝 ${security.rules.deny} · 询问 ${security.rules.ask}`,
    ],
    ["受信任项目", `${security.trustedProjects.length} 个`],
    ["PreToolUse 钩子", `${security.preToolUseHooks} 个`],
  ];
  return (
    <section className="rounded-card border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-body font-semibold text-fg-1">工具调用与安全</h3>
          <p className="mt-0.5 text-caption text-fg-3">
            这里的配置会直接影响工具调用：沙箱、确认策略、命令白名单、工具调用前的钩子。
          </p>
          <ul className="mt-2 space-y-1">
            {rows.map(([key, value]) => (
              <li
                key={key}
                className="flex min-w-0 items-baseline gap-2 text-caption"
              >
                <code className="shrink-0 font-mono text-fg-3">{key}</code>
                <span className="min-w-0 flex-1 truncate font-mono text-fg-1">
                  {value}
                </span>
              </li>
            ))}
          </ul>
          {security.rules.deny === 0 && security.rules.ask === 0 ? (
            <p className="mt-2 rounded-control bg-warning-soft px-3 py-2 text-caption text-warning-text">
              default.rules 里只有放行规则，没有 deny / ask：当前是「白名单全放行」。
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="neutral" size="compact" onClick={onEditRules}>
            整体替换规则
          </Button>
          <Button variant="neutral" size="compact" onClick={onEditHooks}>
            hooks.json
          </Button>
          <Button variant="neutral" size="compact" onClick={onEditConfig}>
            config.toml
          </Button>
        </div>
      </div>
    </section>
  );
}

function CoreCard({
  title,
  description,
  file,
  onEdit,
  onBulk,
}: {
  title: string;
  description: string;
  file: CodexAssetFile;
  onEdit: () => void;
  onBulk?: () => void;
}) {
  return (
    <section className="rounded-card border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-body font-semibold text-fg-1">{title}</h3>
            <StatusBadge status={file.status} />
            <span className="text-caption text-fg-3">
              {file.exists ? formatAssetSize(file.size) : "文件不存在"}
            </span>
          </div>
          <p className="mt-0.5 text-caption text-fg-3">{description}</p>
          <code className="mt-1 block truncate font-mono text-caption text-fg-3">
            {file.displayPath}
          </code>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onBulk ? (
            <Button variant="neutral" size="compact" onClick={onBulk}>
              整体替换
            </Button>
          ) : null}
          <Button variant="solid" size="compact" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            编辑
          </Button>
        </div>
      </div>
    </section>
  );
}

interface EditingState {
  file: CodexAssetFile;
  content: string;
}

const DEFAULT_EXPANDED = new Set(["primary", "config", "rules"]);

function ConfigSummary({ overview }: { overview: CodexAssetsOverview }) {
  const totals: Record<string, number> = {};
  for (const group of overview.groups) {
    for (const file of group.files) {
      totals[file.status.level] = (totals[file.status.level] ?? 0) + 1;
    }
  }
  const rows: Array<[string, string | null]> = [
    ["model_instructions_file", overview.config.modelInstructionsFile],
    ["developer_instructions", overview.config.developerInstructions],
    ["compact_prompt", overview.config.compactPrompt],
    [
      "experimental_compact_prompt_file",
      overview.config.experimentalCompactPromptFile,
    ],
    ["project_doc_max_bytes", overview.config.projectDocMaxBytes],
  ];
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-body font-semibold text-fg-1">
        config.toml 里的提示词配置
      </h2>
      <ul className="mt-2 space-y-1">
        {rows.map(([key, value]) => (
          <li
            key={key}
            className="flex min-w-0 items-baseline gap-2 text-caption"
          >
            <code className="shrink-0 font-mono text-fg-3">{key}</code>
            <span className="min-w-0 flex-1 truncate font-mono text-fg-1">
              {value ?? "（未设置）"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption text-fg-3">
        Codex Home：{overview.codexHomeDisplay} · 共 {overview.fileCount} 个文件
        {" · "}
        <span className="text-success-text">生效 {totals.active ?? 0}</span>
        {" · "}
        <span className="text-warning-text">
          条件生效 / 待接入 {totals.conditional ?? 0}
        </span>
        {" · "}
        <span>未生效 {totals.inactive ?? 0}</span>
        {" · "}
        <span>自动维护 {totals.auto ?? 0}</span>
      </p>
      <p className="mt-1 text-caption text-fg-3">
        生效 = Codex 会读取；条件生效 = 需要 VCO / hooks 等外部组件；
        未生效 = 当前不会被读取；自动维护 = Codex 自己生成，通常不要手改。
      </p>
    </section>
  );
}

function GroupCard({
  group,
  expanded,
  opening,
  filter,
  onToggle,
  onOpen,
  onBulkReplace,
}: {
  group: CodexAssetsOverview["groups"][number];
  expanded: boolean;
  opening: string | null;
  filter: "all" | CodexAssetFile["status"]["level"];
  onToggle: () => void;
  onOpen: (file: CodexAssetFile) => void;
  onBulkReplace?: () => void;
}) {
  const visibleFiles =
    filter === "all"
      ? group.files
      : group.files.filter((file) => file.status.level === filter);
  if (filter !== "all" && visibleFiles.length === 0) return null;
  const isExpanded = filter !== "all" || expanded;
  const existing = group.files.filter((file) => file.exists).length;
  const active = group.files.filter(
    (file) => file.status.level === "active",
  ).length;
  const conditional = group.files.filter(
    (file) => file.status.level === "conditional",
  ).length;
  const inactive = group.files.filter(
    (file) => file.status.level === "inactive",
  ).length;
  const statusLine = [
    active ? `生效 ${active}` : "",
    conditional ? `条件生效 ${conditional}` : "",
    inactive ? `未生效 ${inactive}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="rounded-card border border-border bg-surface">
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-body font-semibold text-fg-1">{group.name}</h2>
              <span className="inline-flex h-5 items-center rounded-full bg-subtle px-2 text-xs text-fg-2">
                {existing}/{group.files.length}
              </span>
            </div>
            <p className="mt-0.5 text-caption text-fg-3">{group.description}</p>
            {statusLine ? (
              <p className="mt-1 text-caption text-fg-2">{statusLine}</p>
            ) : null}
          </div>
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-fg-3 transition-transform",
              isExpanded && "rotate-180",
            )}
          />
        </button>
        {onBulkReplace ? (
          <Button variant="neutral" size="compact" onClick={onBulkReplace}>
            整体替换
          </Button>
        ) : null}
      </div>
      {isExpanded ? (
        <ul className="divide-y divide-border border-t border-border">
          {visibleFiles.length === 0 ? (
            <li className="px-4 py-3 text-caption text-fg-3">这个分组下没有文件</li>
          ) : null}
          {visibleFiles.map((file) => {
            const disabled = !file.exists || !file.editable;
            return (
              <li key={file.key}>
                <button
                  type="button"
                  disabled={disabled || Boolean(opening)}
                  onClick={() => onOpen(file)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2 text-left",
                    disabled
                      ? "cursor-default opacity-60"
                      : "hover:bg-subtle",
                  )}
                >
                  {opening === file.key ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-fg-3" />
                  ) : (
                    <FileCode2 className="h-3.5 w-3.5 shrink-0 text-fg-3" />
                  )}
                  <span className="w-56 shrink-0 truncate font-mono text-caption text-fg-1">
                    {file.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-caption text-fg-3">
                    {file.displayPath}
                  </span>
                  <StatusBadge status={file.status} />
                  <span className="shrink-0 text-caption text-fg-3">
                    {file.exists ? formatAssetSize(file.size) : "不存在"}
                  </span>
                  <span className="w-36 shrink-0 text-right text-caption text-fg-3">
                    {formatAssetTime(file.mtime)}
                  </span>
                  <Pencil
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      disabled ? "text-fg-3/30" : "text-fg-3",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export default function CodexAssetsPanel() {
  const [overview, setOverview] = useState<CodexAssetsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(DEFAULT_EXPANDED),
  );
  const [opening, setOpening] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [backups, setBackups] = useState<CodexAssetBackup[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | CodexAssetFile["status"]["level"]
  >("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [bulkGroup, setBulkGroup] = useState<
    CodexAssetsOverview["groups"][number] | null
  >(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkContent, setBulkContent] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await codexAssetsApi.overview());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openFile = async (file: CodexAssetFile) => {
    setOpening(file.key);
    try {
      const data = await codexAssetsApi.readFile(file.key);
      const allBackups = await codexAssetsApi.backups();
      setBackups(
        allBackups.filter((item) => item.key === file.key).slice(0, 3),
      );
      setEditing({ file, content: data.content });
    } catch (openError) {
      toast.error("读取失败", { description: errorMessage(openError) });
    } finally {
      setOpening(null);
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.content.trim()) {
      const confirmed = window.confirm(
        `「${editing.file.key}」的内容是空的。保存会清空这个文件，确定继续？`,
      );
      if (!confirmed) return;
    }
    setSaving(true);
    try {
      const result = await codexAssetsApi.saveFile(
        editing.file.key,
        editing.content,
      );
      setOverview(result.overview);
      setEditing(null);
      setBackups([]);
      toast.success(`已保存 ${editing.file.key}`, {
        description: "写入前已自动备份。",
        closeButton: true,
      });
    } catch (saveError) {
      toast.error("保存失败", { description: errorMessage(saveError) });
    } finally {
      setSaving(false);
    }
  };

  const BULK_PRIMARY: Record<string, string> = {
    memory: "memories/MEMORY.md",
    rules: "rules/default.rules",
  };

  const openBulk = (group: CodexAssetsOverview["groups"][number]) => {
    const primary = BULK_PRIMARY[group.id];
    setBulkGroup(group);
    setBulkSelected(
      new Set(
        primary
          ? [primary]
          : group.files.filter((file) => file.exists).slice(0, 1).map((file) => file.key),
      ),
    );
    setBulkContent("");
  };

  const toggleBulkFile = (key: string) => {
    setBulkSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const bulkSave = async () => {
    if (!bulkGroup) return;
    const files = bulkGroup.files.filter(
      (file) => bulkSelected.has(file.key) && file.editable,
    );
    if (files.length === 0) {
      toast.error("至少选择一个文件");
      return;
    }
    if (!bulkContent.trim()) {
      toast.error("要替换的内容是空的");
      return;
    }
    setBulkSaving(true);
    try {
      let latest: CodexAssetsOverview | null = null;
      for (const file of files) {
        const result = await codexAssetsApi.saveFile(file.key, bulkContent);
        latest = result.overview;
      }
      if (latest) setOverview(latest);
      setBulkGroup(null);
      toast.success(`已整体替换 ${files.length} 个文件`, {
        description: "每个文件写入前都已自动备份。",
        closeButton: true,
      });
    } catch (saveError) {
      toast.error("替换失败", { description: errorMessage(saveError) });
    } finally {
      setBulkSaving(false);
    }
  };

  const restore = async (backup: CodexAssetBackup) => {
    if (
      !window.confirm(
        `还原 ${backup.key} 的这个备份？\n${formatAssetTime(backup.createdAt)}`,
      )
    ) {
      return;
    }
    setRestoring(backup.id);
    try {
      const result = await codexAssetsApi.restore(backup.id);
      setOverview(result.overview);
      setEditing(null);
      setBackups([]);
      toast.success("已还原备份", { closeButton: true });
    } catch (restoreError) {
      toast.error("还原失败", { description: errorMessage(restoreError) });
    } finally {
      setRestoring(null);
    }
  };

  if (loading && !overview) {
    return (
      <div className="py-16 text-center text-body text-fg-2">
        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
        正在扫描 Codex 全局提示词…
      </div>
    );
  }

  const allFiles = overview?.groups.flatMap((group) => group.files) ?? [];
  const coreCards = [
    {
      key: "AGENTS.md",
      title: "全局指令 AGENTS.md",
      description: "每次会话自动加载；注入后即生效。",
    },
    {
      key: "system-prompt.md",
      title: "系统提示 system-prompt.md",
      description:
        "替换 Codex 基础系统提示；需要在 config.toml 里接入 model_instructions_file 才生效。",
    },
    {
      key: "memories/MEMORY.md",
      title: "记忆 MEMORY.md",
      description: "Codex 的长期记忆；写入后由 memories 功能读取。",
    },
  ].flatMap((def) => {
    const file = allFiles.find((item) => item.key === def.key);
    return file ? [{ ...def, file }] : [];
  });
  const rulesGroup = overview?.groups.find((group) => group.id === "rules");
  const configFile = allFiles.find((file) => file.key === "config.toml");
  const hooksFile = allFiles.find((file) => file.key === "hooks.json");

  return (
    <div className="space-y-4">
      {error ? (
        <div className="flex items-start gap-3 rounded-card border border-danger/40 bg-danger-soft p-4 text-body">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-text" />
          <div className="min-w-0">
            <p className="font-medium text-danger-text">读不到 Codex 目录</p>
            <p className="mt-1 break-all text-caption text-danger-text/80">
              {error}
            </p>
          </div>
        </div>
      ) : null}

      {overview ? (
        <div className="space-y-3">
          <h2 className="px-1 text-body font-semibold text-fg-1">
            注入后生效的位置
          </h2>
          <p className="px-1 text-caption text-fg-3">
            这里只写提示词、规则文本和记忆，不会改沙箱、审批策略、命令白名单或 hooks。
          </p>
          {coreCards.map(({ key, title, description, file }) => (
            <CoreCard
              key={key}
              title={title}
              description={description}
              file={file}
              onEdit={() => void openFile(file)}
              onBulk={
                key === "memories/MEMORY.md" || key === "rules/default.rules"
                  ? () => {
                      const groupId =
                        key === "memories/MEMORY.md" ? "memory" : "rules";
                      const group = overview.groups.find(
                        (item) => item.id === groupId,
                      );
                      if (group) openBulk(group);
                    }
                  : undefined
              }
            />
          ))}
          {rulesGroup ? (
            <GroupCard
              group={rulesGroup}
              expanded={expanded.has("rules")}
              opening={opening}
              filter="all"
              onToggle={() => toggle("rules")}
              onOpen={(file) => void openFile(file)}
              onBulkReplace={() => openBulk(rulesGroup)}
            />
          ) : null}
          {overview ? (
            <ToolingCard
              overview={overview}
              onEditConfig={() => {
                if (configFile) void openFile(configFile);
              }}
              onEditHooks={() => {
                if (hooksFile) void openFile(hooksFile);
              }}
              onEditRules={() => {
                if (rulesGroup) openBulk(rulesGroup);
              }}
            />
          ) : null}
          <p className="px-1 text-caption text-fg-3">
            这些就是规则、提示词、记忆和工具调用的入口。其余工具文件（技能、自定义命令、指令集等）在下面按需展开。
          </p>
        </div>
      ) : null}

      {overview ? (
        <div className="space-y-3">
          <Button
            variant="quiet"
            size="compact"
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                advancedOpen && "rotate-180",
              )}
            />
            更多工具文件（
            {Math.max(
              0,
              overview.fileCount -
                coreCards.length -
                (rulesGroup?.files.length ?? 0),
            )}{" "}
            个）
          </Button>

          {advancedOpen ? (
            <>
              <ConfigSummary overview={overview} />

              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { value: "all", label: "全部" },
                  { value: "active", label: "生效" },
                  { value: "conditional", label: "条件生效 / 待接入" },
                  { value: "inactive", label: "未生效" },
                  { value: "auto", label: "自动维护" },
                ].map((item) => (
                  <Button
                    key={item.value}
                    variant={statusFilter === item.value ? "solid" : "quiet"}
                    size="compact"
                    onClick={() =>
                      setStatusFilter(item.value as typeof statusFilter)
                    }
                  >
                    {item.label}
                  </Button>
                ))}
              </div>

              {overview.groups
                .filter((group) => group.id !== "rules")
                .map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  expanded={expanded.has(group.id)}
                  opening={opening}
                  filter={statusFilter}
                  onToggle={() => toggle(group.id)}
                  onOpen={(file) => void openFile(file)}
                  onBulkReplace={
                    group.id === "memory" || group.id === "rules"
                      ? () => openBulk(group)
                      : undefined
                  }
                />
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setEditing(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="break-all font-mono text-body">
              {editing?.file.key}
            </DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-2">
              <p className="break-all text-caption text-fg-3">
                {editing.file.displayPath} · {formatAssetSize(editing.file.size)}
              </p>
              <textarea
                value={editing.content}
                onChange={(event) =>
                  setEditing((current) =>
                    current ? { ...current, content: event.target.value } : current,
                  )
                }
                spellCheck={false}
                className="h-[55vh] w-full resize-y rounded-control border border-border bg-app p-3 font-mono text-[12px] leading-relaxed text-fg-1 outline-none focus:border-border-strong"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-fg-3">
                <span>{editing.content.length} 字符 · 保存前自动备份</span>
                <div className="flex items-center gap-2">
                  {backups.map((backup) => (
                    <Button
                      key={backup.id}
                      variant="quiet"
                      size="compact"
                      disabled={Boolean(restoring) || saving}
                      onClick={() => void restore(backup)}
                    >
                      {restoring === backup.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      还原 {formatAssetTime(backup.createdAt)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="neutral"
              size="compact"
              disabled={saving}
              onClick={() => setEditing(null)}
            >
              取消
            </Button>
            <Button
              variant="solid"
              size="compact"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkGroup !== null}
        onOpenChange={(open) => {
          if (!open && !bulkSaving) setBulkGroup(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>整体替换 · {bulkGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-caption text-fg-2">
              把同一段内容整体覆盖到下面勾选的文件。每个文件写入前都会自动备份，
              之后可以在文件编辑器里单独还原。
            </p>
            {bulkGroup?.id === "rules" ? (
              <p className="rounded-control bg-warning-soft px-3 py-2 text-caption text-warning-text">
                注意：rules 文件使用 <code className="font-mono">prefix_rule(...)</code> 规则语法，
                整段替换成普通文字会让规则失效。
              </p>
            ) : null}
            <div className="max-h-40 overflow-y-auto rounded-control border border-border bg-app p-2">
              {bulkGroup?.files.map((file) => (
                <label
                  key={file.key}
                  className={cn(
                    "flex items-center gap-2 rounded px-1 py-1 text-caption",
                    file.editable ? "cursor-pointer hover:bg-subtle" : "opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={bulkSelected.has(file.key)}
                    disabled={!file.editable}
                    onChange={() => toggleBulkFile(file.key)}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-fg-1">
                    {file.key}
                  </span>
                  <span className="shrink-0 text-fg-3">
                    {file.exists ? formatAssetSize(file.size) : "不存在（会新建）"}
                  </span>
                </label>
              ))}
            </div>
            <textarea
              value={bulkContent}
              onChange={(event) => setBulkContent(event.target.value)}
              spellCheck={false}
              placeholder={
                bulkGroup?.id === "rules"
                  ? 'prefix_rule(pattern=["python"], decision="allow")'
                  : "把要整体写入的完整内容粘贴到这里…"
              }
              className="h-64 w-full resize-y rounded-control border border-border bg-app p-3 font-mono text-[12px] leading-relaxed text-fg-1 outline-none focus:border-border-strong"
            />
            <p className="text-caption text-fg-3">
              {bulkContent.length} 字符 · 已选 {bulkSelected.size} 个文件
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="neutral"
              size="compact"
              disabled={bulkSaving}
              onClick={() => setBulkGroup(null)}
            >
              取消
            </Button>
            <Button
              variant="solid"
              size="compact"
              disabled={bulkSaving}
              onClick={() => void bulkSave()}
            >
              {bulkSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              写入 {bulkSelected.size} 个文件
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
