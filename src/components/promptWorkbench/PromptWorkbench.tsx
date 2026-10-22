import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import type { AppId } from "@/lib/api";
import {
  formatLibrarySize,
  formatLibraryTime,
  promptLibraryApi,
  type LibraryPrompt,
  type PromptLibraryOverview,
} from "@/lib/promptLibraryApi";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTabs } from "@/components/ui/page-tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import RoleCardStrip from "@/components/inject/RoleCardStrip";
import CodexAssetsPanel from "./CodexAssetsPanel";

const ADD_EVENT = "prompt-workbench:add";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface PromptFormState {
  name: string;
  description: string;
  content: string;
}

const EMPTY_FORM: PromptFormState = { name: "", description: "", content: "" };

/** 粗略估算 token：CJK 按 1 字 ≈ 1 token，其余按 4 字符 ≈ 1 token。 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[㐀-鿿぀-ヿ가-힯]/g) ?? []).length;
  return cjk + Math.ceil((text.length - cjk) / 4);
}

function PromptCard({
  prompt,
  current,
  busy,
  onActivate,
  onDeactivate,
  onEdit,
  onDelete,
}: {
  prompt: LibraryPrompt;
  current: boolean;
  busy: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={cn(
        "rounded-card border bg-surface",
        current ? "border-success/50" : "border-border",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-body font-semibold text-fg-1">
              {prompt.name}
            </h3>
            {current ? (
              <span className="inline-flex h-5 items-center rounded-full bg-success-soft px-2 text-xs font-medium text-success-text">
                使用中
              </span>
            ) : null}
          </div>
          {prompt.description ? (
            <p className="mt-0.5 text-caption text-fg-2">{prompt.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {current ? (
            <Button variant="neutral" size="compact" disabled={busy} onClick={onDeactivate}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              停用
            </Button>
          ) : (
            <Button variant="solid" size="compact" disabled={busy} onClick={onActivate}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              切换到此提示词
            </Button>
          )}
          <Button
            variant="quiet"
            size="icon-compact"
            aria-label={`编辑 ${prompt.name}`}
            disabled={busy}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="quiet"
            size="icon-compact"
            aria-label={`删除 ${prompt.name}`}
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>
      <div className="border-t border-border px-4 py-3">
        <pre className="line-clamp-3 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-fg-2">
          {prompt.content}
        </pre>
        <div className="mt-2 text-caption text-fg-3">
          {prompt.content.length} 字符 · 更新于{" "}
          {formatLibraryTime(prompt.updatedAt)}
        </div>
      </div>
    </article>
  );
}

export default function PromptWorkbench({
  app,
  onOpenInject,
}: {
  app: AppId;
  /** 打开「提示词注入 → 网关注入」完整管理页 */
  onOpenInject?: () => void;
}) {
  const [overview, setOverview] = useState<PromptLibraryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"library" | "assets">("library");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryPrompt | null>(null);
  const [form, setForm] = useState<PromptFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [applyAfterSave, setApplyAfterSave] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await promptLibraryApi.overview(app));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [app]);

  useEffect(() => {
    setSearch("");
    setOverview(null);
    void load();
  }, [load]);

  const openAdd = useCallback(() => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setApplyAfterSave(true);
    setDialogOpen(true);
  }, []);

  useEffect(() => {
    const handler = () => openAdd();
    window.addEventListener(ADD_EVENT, handler);
    return () => window.removeEventListener(ADD_EVENT, handler);
  }, [openAdd]);

  const filtered = useMemo(() => {
    const list = overview?.prompts ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (prompt) =>
        prompt.name.toLowerCase().includes(query) ||
        prompt.description.toLowerCase().includes(query) ||
        prompt.content.toLowerCase().includes(query),
    );
  }, [overview?.prompts, search]);

  const run = async (key: string, action: () => Promise<PromptLibraryOverview>) => {
    setBusy(key);
    try {
      setOverview(await action());
    } catch (actionError) {
      toast.error("操作失败", { description: errorMessage(actionError) });
    } finally {
      setBusy(null);
    }
  };

  const activate = (prompt: LibraryPrompt) =>
    run(`activate:${prompt.id}`, async () => {
      const next = await promptLibraryApi.activate(app, prompt.id);
      toast.success(`已切换到「${prompt.name}」`, {
        description: `已写入 ${next.displayPath}，重启或新会话后生效。`,
        closeButton: true,
      });
      return next;
    });

  const deactivate = () =>
    run("deactivate", async () => {
      const next = await promptLibraryApi.deactivate(app);
      toast.success("已停用", {
        description: "已还原到提示词库第一次切换之前的状态。",
        closeButton: true,
      });
      return next;
    });

  const importCurrent = () =>
    run("import", async () => {
      const next = await promptLibraryApi.importCurrent(app);
      toast.success("已把当前文件导入提示词库", { closeButton: true });
      return next;
    });

  const remove = async (prompt: LibraryPrompt) => {
    if (!window.confirm(`删除「${prompt.name}」？\n只从提示词库里删除，不会动已经写入的文件。`)) {
      return;
    }
    await run(`delete:${prompt.id}`, async () => {
      const next = await promptLibraryApi.remove(app, prompt.id);
      toast.success(`已删除「${prompt.name}」`, { closeButton: true });
      return next;
    });
  };

  const openEdit = (prompt: LibraryPrompt) => {
    setEditing(prompt);
    setForm({
      name: prompt.name,
      description: prompt.description,
      content: prompt.content,
    });
    setFormError(null);
    // 正在生效的那条，保存后默认继续写回目标文件；其他卡默认只改库。
    setApplyAfterSave(overview?.currentId === prompt.id);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.content.trim()) {
      setFormError("提示词内容不能为空，先写点内容再保存。");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const result = await promptLibraryApi.save(app, {
        id: editing?.id,
        name: form.name.trim() || "未命名提示词",
        description: form.description.trim(),
        content: form.content,
      });

      if (applyAfterSave) {
        try {
          const next = await promptLibraryApi.activate(app, result.id);
          setOverview(next);
          setDialogOpen(false);
          toast.success(editing ? "已保存并重新写入" : "已保存并启用", {
            description: `已写入 ${next.displayPath}，新会话生效。`,
            closeButton: true,
          });
          return;
        } catch (activateError) {
          // 提示词已经保存成功，只是启用失败：别把刚写的内容丢掉。
          setOverview(result.overview);
          setFormError(
            `提示词已保存，但启用失败：${errorMessage(activateError)}`,
          );
          return;
        }
      }

      setOverview(result.overview);
      setDialogOpen(false);
      toast.success(editing ? "提示词已保存" : "提示词已添加", {
        closeButton: true,
      });
    } catch (saveError) {
      setFormError(errorMessage(saveError));
      toast.error("保存失败", { description: errorMessage(saveError) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-6 pt-3">
        <RoleCardStrip onManage={onOpenInject} />
      </div>
      {app === "codex" ? (
        <div className="shrink-0 px-6 pt-2">
          <PageTabs
            aria-label="Codex 提示词管理"
            idPrefix="codex-prompts"
            value={tab}
            onValueChange={(value) => setTab(value as "library" | "assets")}
            items={[
              { value: "library", label: "提示词" },
              { value: "assets", label: "全局资产" },
            ]}
          />
        </div>
      ) : null}
      <div
        id="main-content"
        className="min-h-0 flex-1 overflow-y-auto scroll-stable overflow-x-hidden px-6 pb-12 pt-4"
      >
        <div className="space-y-4">
          {app === "codex" && tab === "assets" ? (
            <CodexAssetsPanel />
          ) : (
            <>
        {error ? (
          <div className="flex items-start gap-3 rounded-card border border-danger/40 bg-danger-soft p-4 text-body">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-text" />
            <div className="min-w-0">
              <p className="font-medium text-danger-text">读不到提示词库</p>
              <p className="mt-1 break-all text-caption text-danger-text/80">
                {error}
              </p>
              <p className="mt-1 text-caption text-danger-text/80">
                本地后端只在 <code className="font-mono">pnpm dev</code> /{" "}
                <code className="font-mono">pnpm preview</code> 下可用。
              </p>
            </div>
          </div>
        ) : null}

        {overview ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
                <span className="text-fg-3">目标文件</span>
                <code className="font-mono text-fg-1">
                  {overview.displayPath}
                </code>
                <span className="text-caption text-fg-3">
                  {overview.exists
                    ? formatLibrarySize(overview.size)
                    : "文件不存在"}
                </span>
              </div>
              <p className="mt-1 text-caption text-fg-3">
                当前使用：
                {overview.currentName ?? "没有通过提示词库切换过"}
              </p>
            </div>
            <Button
              variant="neutral"
              size="compact"
              disabled={Boolean(busy) || !overview.exists}
              onClick={() => void importCurrent()}
            >
              <FileUp className="h-3.5 w-3.5" />
              导入当前文件
            </Button>
          </section>
        ) : null}

        {overview && overview.prompts.length > 0 ? (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索提示词"
                className="h-8 w-full rounded-control border border-border bg-surface pl-8 pr-3 text-body text-fg-1 outline-none transition-colors placeholder:text-fg-3 focus:border-border-strong"
              />
            </div>
            <Button variant="solid" size="compact" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" />
              添加提示词
            </Button>
          </div>
        ) : null}

        {loading && !overview ? (
          <div className="py-16 text-center text-body text-fg-2">
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
            正在读提示词库…
          </div>
        ) : null}

        {overview && overview.prompts.length === 0 && !loading ? (
          <section className="rounded-card border border-dashed border-border-strong px-6 py-14 text-center">
            <p className="text-body font-medium text-fg-1">还没有提示词</p>
            <p className="mt-1 text-caption text-fg-3">
              添加一条，然后点「切换到此提示词」写入{" "}
              {overview.displayPath}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="solid" size="compact" onClick={openAdd}>
                <Plus className="h-3.5 w-3.5" />
                添加提示词
              </Button>
              <Button
                variant="neutral"
                size="compact"
                disabled={!overview.exists}
                onClick={() => void importCurrent()}
              >
                <FileUp className="h-3.5 w-3.5" />
                从当前文件导入
              </Button>
            </div>
          </section>
        ) : null}

        {filtered.map((prompt) => (
          <PromptCard
            key={prompt.id}
            prompt={prompt}
            current={overview?.currentId === prompt.id}
            busy={Boolean(busy)}
            onActivate={() => void activate(prompt)}
            onDeactivate={() => void deactivate()}
            onEdit={() => openEdit(prompt)}
            onDelete={() => void remove(prompt)}
          />
        ))}

        {overview && overview.prompts.length > 0 && filtered.length === 0 ? (
          <p className="py-8 text-center text-caption text-fg-3">
            没有匹配「{search}」的提示词
          </p>
        ) : null}
            </>
          )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setDialogOpen(false);
        }}
      >
        <DialogContent
          className="max-w-3xl overflow-hidden p-0"
          onKeyDown={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              event.key === "Enter" &&
              !saving
            ) {
              event.preventDefault();
              void save();
            }
          }}
        >
          <DialogHeader className="border-b border-border px-6 pb-4 pt-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-action-soft text-action-text">
                <BookOpen className="h-5 w-5" strokeWidth={1.6} />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle>
                  {editing ? "编辑提示词" : "添加提示词"}
                </DialogTitle>
                <DialogDescription className="mt-1 leading-relaxed">
                  保存到提示词库；启用后写入{" "}
                  <code className="break-all rounded bg-subtle px-1 py-0.5 font-mono text-[11px] text-fg-2">
                    {overview?.displayPath ?? "目标文件"}
                  </code>
                  ，新会话生效。
                </DialogDescription>
              </div>
              {overview?.appName ? (
                <span className="hidden shrink-0 rounded-full bg-subtle px-2 py-1 text-caption text-fg-2 sm:inline">
                  {overview.appName}
                </span>
              ) : null}
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prompt-name">名称</Label>
                <Input
                  id="prompt-name"
                  autoFocus
                  value={form.name}
                  placeholder="例如：日常开发规则"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
                <p className="text-caption text-fg-3">
                  留空会保存为「未命名提示词」
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prompt-description">
                  描述{" "}
                  <span className="font-normal text-fg-3">（可选）</span>
                </Label>
                <Input
                  id="prompt-description"
                  value={form.description}
                  placeholder="这条提示词是做什么的"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
                <p className="text-caption text-fg-3">列表里用来快速辨认</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <Label htmlFor="prompt-content">
                    提示词内容
                    <span className="ms-1 text-danger-text" aria-hidden="true">
                      *
                    </span>
                  </Label>
                  <p className="mt-0.5 text-caption text-fg-3">
                    会原样写入目标文件，支持 Markdown。
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-caption tabular-nums text-fg-3">
                  <span>{form.content.length.toLocaleString("zh-CN")} 字符</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    约 {estimateTokens(form.content).toLocaleString("zh-CN")}{" "}
                    token
                  </span>
                </div>
              </div>
              <Textarea
                id="prompt-content"
                value={form.content}
                spellCheck={false}
                placeholder="要注入的提示词全文…"
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    content: event.target.value,
                  }));
                  if (formError) setFormError(null);
                }}
                className="h-64 min-h-40 resize-y font-mono text-[12px] leading-relaxed"
              />
              {formError ? (
                <p className="text-caption text-danger-text">{formError}</p>
              ) : null}
            </div>

            <label className="flex items-start justify-between gap-4 rounded-control border border-border bg-app px-3.5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-body font-medium text-fg-1">
                  <Zap className="h-3.5 w-3.5 text-action-text" />
                  保存后立即启用
                </div>
                <p className="mt-0.5 text-caption leading-relaxed text-fg-2">
                  会把内容写入{" "}
                  <code className="break-all font-mono text-[11px]">
                    {overview?.displayPath ?? "目标文件"}
                  </code>
                  ，并停用当前生效的提示词。
                </p>
              </div>
              <Switch
                checked={applyAfterSave}
                onCheckedChange={setApplyAfterSave}
                aria-label="保存后立即启用"
              />
            </label>
          </div>

          <DialogFooter className="items-center gap-3 border-t border-border px-6 pb-5 pt-4">
            <span className="me-auto hidden text-caption text-fg-3 sm:inline">
              ⌘/Ctrl + Enter 保存
            </span>
            <Button
              variant="neutral"
              size="compact"
              disabled={saving}
              onClick={() => setDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="solid"
              size="compact"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : applyAfterSave ? (
                <Zap className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {saving
                ? "保存中…"
                : applyAfterSave
                  ? "保存并启用"
                  : editing
                    ? "保存修改"
                    : "保存提示词"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
