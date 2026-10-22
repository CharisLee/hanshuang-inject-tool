import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
  RotateCcw,
  Syringe,
} from "lucide-react";
import { AppPageHeader } from "@/components/shell/AppPageHeader";
import { AppGlyph, APP_DISPLAY_NAME } from "@/components/shell/AppGlyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HelpTip } from "@/components/ui/help-tip";
import { toast } from "@/lib/toast";
import type { AppId } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  formatBytes,
  formatTime,
  injectApi,
  type InjectBackup,
  type InjectOverview,
  type InjectTarget,
} from "@/lib/injectApi";

type Drafts = Record<string, string>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 页头里的应用选择器：图标 + 名字 + 下拉。 */
function AppPicker({
  app,
  apps,
  disabled,
  onAppChange,
}: {
  app: AppId;
  apps: AppId[];
  disabled?: boolean;
  onAppChange: (app: AppId) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="quiet"
          size="compact"
          disabled={disabled}
          className="gap-1.5"
        >
          <AppGlyph app={app} size={16} />
          {APP_DISPLAY_NAME[app]}
          <ChevronDown className="h-3.5 w-3.5 text-fg-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[190px] rounded-panel border border-border bg-surface p-1 shadow-v7-md"
      >
        {apps.map((item) => (
          <DropdownMenuItem
            key={item}
            onSelect={() => onAppChange(item)}
            className="min-h-8 gap-2 rounded-control px-2.5 py-1.5 text-body text-fg-1 focus:bg-subtle"
          >
            <AppGlyph app={item} size={16} />
            <span className="flex-1">{APP_DISPLAY_NAME[item]}</span>
            {item === app ? (
              <Check className="h-3.5 w-3.5 text-success-text" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusBadge({ target }: { target: InjectTarget }) {
  const style = target.active
    ? "bg-success-soft text-success-text"
    : target.injected
      ? "bg-warning-soft text-warning-text"
      : target.exists
        ? "bg-subtle text-fg-2"
        : "bg-subtle text-fg-3";
  const label = target.active
    ? "已生效"
    : target.injected
      ? "已注入"
      : target.exists
        ? "文件存在"
        : "未注入";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
        style,
      )}
    >
      {label}
    </span>
  );
}

interface TargetCardProps {
  target: InjectTarget;
  draft: string | undefined;
  configValue: string | null;
  busy: string | null;
  onDraftChange: (value: string) => void;
  onApply: (mode: "replace" | "append") => void;
  onDisable: () => void;
}

function TargetCard({
  target,
  draft,
  configValue,
  busy,
  onDraftChange,
  onApply,
  onDisable,
}: TargetCardProps) {
  const value = draft ?? target.content;
  const changed = draft !== undefined && draft !== target.content;
  const applying =
    busy === `${target.id}:replace` || busy === `${target.id}:append`;
  const disabling = busy === `${target.id}:disable`;
  // 要改配置文件的目标（Codex 的系统提示替换）没有「追加」的说法
  const isConfigTarget = target.configPath !== null;

  return (
    <section className="rounded-card border border-border bg-surface">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-body font-semibold text-fg-1">{target.name}</h2>
            <StatusBadge target={target} />
            {target.installedAt ? (
              <span className="text-caption text-fg-3">
                本工具注入于 {formatTime(target.installedAt)}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-3">
            <code className="font-mono">{target.displayPath}</code>
            <span>{target.exists ? formatBytes(target.size) : "文件不存在"}</span>
            {target.mtime ? <span>改于 {formatTime(target.mtime)}</span> : null}
          </div>
        </div>
      </header>

      <div className="space-y-3 p-4">
        <p className="text-caption text-fg-2">{target.description}</p>

        {isConfigTarget ? (
          <div className="rounded-control border border-border bg-subtle px-3 py-2 text-caption text-fg-2">
            <span className="text-fg-3">config.toml 当前：</span>
            <code className="font-mono">
              model_instructions_file ={" "}
              {configValue ? `"${configValue}"` : "（未设置）"}
            </code>
          </div>
        ) : null}

        <textarea
          value={value}
          onChange={(event) => onDraftChange(event.target.value)}
          spellCheck={false}
          placeholder="把要注入的提示词粘贴到这里…"
          className="h-52 w-full resize-y rounded-control border border-border bg-app p-3 font-mono text-[12px] leading-relaxed text-fg-1 outline-none transition-colors focus:border-border-strong"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-caption text-fg-3">
            {value.length} 字符
            {changed ? " · 有未保存改动" : ""}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {target.injected ? (
              <Button
                variant="neutral"
                size="compact"
                disabled={Boolean(busy)}
                onClick={onDisable}
              >
                {disabling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                停用并还原
              </Button>
            ) : null}
            {!isConfigTarget ? (
              <Button
                variant="neutral"
                size="compact"
                disabled={Boolean(busy) || !value.trim()}
                onClick={() => onApply("append")}
              >
                追加到末尾
              </Button>
            ) : null}
            <Button
              variant="solid"
              size="compact"
              disabled={Boolean(busy) || !value.trim()}
              onClick={() => onApply("replace")}
            >
              {applying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Syringe className="h-3.5 w-3.5" />
              )}
              注入并覆盖
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function FileInjectPanel({
  appId,
  apps,
  onAppChange,
  headerSlot,
}: {
  appId: AppId;
  apps: AppId[];
  onAppChange: (app: AppId) => void;
  headerSlot?: ReactNode;
}) {
  const [overview, setOverview] = useState<InjectOverview | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await injectApi.overview(appId));
    } catch (loadError) {
      setOverview(null);
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [appId]);

  // 换应用时草稿不跟着走，否则会把 A 的内容写进 B
  useEffect(() => {
    setDrafts({});
    void load();
  }, [load]);

  const setDraft = (id: string, value: string) => {
    setDrafts((current) => ({ ...current, [id]: value }));
  };

  const clearDraft = (id: string) => {
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const apply = async (target: InjectTarget, mode: "replace" | "append") => {
    const content = drafts[target.id] ?? target.content;
    if (!content.trim()) {
      toast.error("提示词是空的", { description: "先写点内容再注入。" });
      return;
    }
    setBusy(`${target.id}:${mode}`);
    try {
      const next = await injectApi.apply(appId, target.id, content, mode);
      setOverview(next);
      clearDraft(target.id);
      toast.success(
        mode === "append"
          ? `已追加到 ${target.displayPath}`
          : `已注入到 ${target.displayPath}`,
        {
          description: "写入前已自动备份；重启客户端后生效。",
          closeButton: true,
        },
      );
    } catch (applyError) {
      toast.error("注入失败", { description: errorMessage(applyError) });
    } finally {
      setBusy(null);
    }
  };

  const disable = async (target: InjectTarget) => {
    if (
      !window.confirm(
        `停用并还原 ${target.name}？\n会恢复到本工具第一次注入之前的状态（${target.displayPath}）。`,
      )
    ) {
      return;
    }
    setBusy(`${target.id}:disable`);
    try {
      const next = await injectApi.disable(appId, target.id);
      setOverview(next);
      clearDraft(target.id);
      toast.success(`已还原 ${target.displayPath}`, {
        description: "重启客户端后生效。",
        closeButton: true,
      });
    } catch (disableError) {
      toast.error("还原失败", { description: errorMessage(disableError) });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (backup: InjectBackup) => {
    if (
      !window.confirm(
        `还原 ${backup.targetName} 的这个备份？\n${backup.originalPath}\n${formatTime(backup.createdAt)}`,
      )
    ) {
      return;
    }
    setBusy(`restore:${backup.id}`);
    try {
      const result = await injectApi.restore(appId, backup.id);
      setOverview(result.overview);
      setDrafts({});
      toast.success("已还原备份", {
        description: backup.originalPath,
        closeButton: true,
      });
    } catch (restoreError) {
      toast.error("还原失败", { description: errorMessage(restoreError) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppPageHeader
        icon={<Syringe className="h-5 w-5" strokeWidth={1.5} />}
        title="提示词注入"
        titleExtra={
          <>
            {headerSlot}
            <AppPicker
              app={appId}
              apps={apps}
              disabled={Boolean(busy)}
              onAppChange={onAppChange}
            />
            <HelpTip title="本机文件">
              把提示词写进这个客户端自己的全局指令文件。每次写入前都会备份，可以
              随时停用或从备份还原。
            </HelpTip>
          </>
        }
        actions={
          <Button
            variant="neutral"
            size="compact"
            disabled={loading || Boolean(busy)}
            onClick={() => void load()}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            刷新
          </Button>
        }
      />

      <div
        id="main-content"
        className="min-h-0 flex-1 overflow-y-auto scroll-stable"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 pb-12 pt-4">
          {error ? (
            <div className="flex items-start gap-3 rounded-card border border-danger/40 bg-danger-soft p-4 text-body">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-text" />
              <div className="min-w-0">
                <p className="font-medium text-danger-text">
                  读不到 {APP_DISPLAY_NAME[appId]} 的配置目录
                </p>
                <p className="mt-1 break-all text-caption text-danger-text/80">
                  {error}
                </p>
                <p className="mt-1 text-caption text-danger-text/80">
                  本地注入后端只在 <code className="font-mono">pnpm dev</code> /{" "}
                  <code className="font-mono">pnpm preview</code> 下可用，纯静态打开
                  dist 不会运行。
                </p>
              </div>
            </div>
          ) : null}

          {overview ? (
            <section className="rounded-card border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body">
                <span className="flex items-center gap-2">
                  <span className="text-fg-3">配置目录</span>
                  <code className="font-mono text-fg-1">
                    {overview.homeDirDisplay}
                  </code>
                </span>
                {overview.configValueDisplay !== null ||
                overview.targets.some((item) => item.configPath) ? (
                  <span className="flex items-center gap-2">
                    <span className="text-fg-3">系统提示</span>
                    <code className="font-mono text-fg-1">
                      {overview.configValueDisplay ?? "未设置"}
                    </code>
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-caption text-fg-3">
                这里只写提示词文件，不会改沙箱、审批策略、rules 或 hooks。所有写入
                都会先备份到{" "}
                <code className="font-mono">
                  ~/.cc-switch/backups/inject/{overview.app}
                </code>
                ；注入后对新会话生效。
              </p>
            </section>
          ) : null}

          {loading && !overview ? (
            <div className="py-16 text-center text-body text-fg-2">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
              正在读 {APP_DISPLAY_NAME[appId]} 的配置目录…
            </div>
          ) : null}

          {overview?.targets.map((target) => (
            <TargetCard
              key={target.id}
              target={target}
              draft={drafts[target.id]}
              configValue={overview.configValue}
              busy={busy}
              onDraftChange={(value) => setDraft(target.id, value)}
              onApply={(mode) => void apply(target, mode)}
              onDisable={() => void disable(target)}
            />
          ))}

          {overview ? (
            <section className="rounded-card border border-border bg-surface">
              <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-body font-semibold text-fg-1">备份历史</h2>
                <span className="text-caption text-fg-3">
                  最近 {overview.backups.length} 条
                </span>
              </header>
              {overview.backups.length === 0 ? (
                <p className="px-4 py-6 text-caption text-fg-3">
                  还没有备份。第一次注入时会自动创建。
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {overview.backups.map((backup) => (
                    <li
                      key={backup.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-body"
                    >
                      <span className="shrink-0 text-fg-2">
                        {formatTime(backup.createdAt)}
                      </span>
                      <Badge
                        variant="outline"
                        className="h-5 shrink-0 px-1.5 text-badge"
                      >
                        {backup.targetName}
                      </Badge>
                      <code className="min-w-0 flex-1 truncate font-mono text-caption text-fg-3">
                        {backup.originalPath}
                      </code>
                      <span className="shrink-0 text-caption text-fg-3">
                        {backup.originalExisted
                          ? formatBytes(backup.size)
                          : "原本不存在"}
                      </span>
                      <Button
                        variant="quiet"
                        size="compact"
                        disabled={Boolean(busy)}
                        onClick={() => void restore(backup)}
                      >
                        {busy === `restore:${backup.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        还原
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
