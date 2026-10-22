import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  Plug,
  Plus,
  RotateCcw,
  Syringe,
  Trash2,
} from "lucide-react";
import { AppPageHeader } from "@/components/shell/AppPageHeader";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  cardProxyApi,
  type CardProxyStatus,
} from "@/lib/cardProxyApi";
import {
  promptCardsApi,
  systemSlotOf,
  type CardDraft,
  type CardMode,
  type PromptCard,
  type PromptCardsOverview,
} from "@/lib/promptCardsApi";

/**
 * 后端支持 fill / prepend / append / override 四种模式（给将来的 Rust 实现留着），
 * 界面只给两种：另外两种在 Claude Code 下要么永不生效，要么破坏缓存断点。
 */
const MODES: Array<{ value: CardMode; label: string; note: string }> = [
  {
    value: "append",
    label: "追加",
    note: "放在客户端自带的 system 后面。推荐——不会动 Claude Code 的缓存断点。",
  },
  {
    value: "override",
    label: "替换",
    note: "扇掉客户端自带的 system，只留这张卡。会废掉 Claude Code 的工具说明，一般别用。",
  },
];

const EMPTY_DRAFT: CardDraft = {
  name: "",
  system: "",
  firstMes: "",
  mode: "append",
  enabled: true,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 旧数据可能是 fill / prepend，界面上一律当「追加」显示。 */
function uiMode(mode: CardMode): CardMode {
  return mode === "override" ? "override" : "append";
}

function draftOf(card: PromptCard): CardDraft {
  return {
    id: card.id,
    name: card.name,
    system: card.system,
    firstMes: card.firstMes,
    mode: uiMode(card.mode),
    enabled: true,
  };
}

function ProxyInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-fg-3">{label}</div>
      <div className="break-all font-mono text-[11px] text-fg-1">{value}</div>
    </div>
  );
}

export default function PromptCardPanel({
  headerSlot,
}: {
  headerSlot?: ReactNode;
}) {
  const [overview, setOverview] = useState<PromptCardsOverview | null>(null);
  const [draft, setDraft] = useState<CardDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proxy, setProxy] = useState<CardProxyStatus | null>(null);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [proxyBusy, setProxyBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await promptCardsApi.overview());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadProxy = useCallback(async () => {
    try {
      setProxy(await cardProxyApi.status());
      setProxyError(null);
    } catch (loadError) {
      setProxyError(errorMessage(loadError));
    }
  }, []);

  useEffect(() => {
    void loadProxy();
  }, [loadProxy, overview?.currentId]);

  const setCodexProxy = async (action: "enable" | "restore") => {
    setProxyBusy(true);
    try {
      const next = await cardProxyApi.setCodex(action);
      setProxy(next);
      setProxyError(null);
      toast.success(
        action === "enable" ? "Codex 已接入注入代理" : "已恢复 Codex 原地址",
        {
          description:
            action === "enable"
              ? "新开 Codex 会话后，请求会按当前人物卡注入。"
              : "Codex 会重新直连原来的上游。",
          closeButton: true,
        },
      );
    } catch (activateError) {
      toast.error("操作失败", {
        description: errorMessage(activateError),
      });
    } finally {
      setProxyBusy(false);
    }
  };

  const currentCard = useMemo(
    () => overview?.cards.find((card) => card.id === overview.currentId) ?? null,
    [overview],
  );

  /** 预览只看 Claude Code 走的那条协议，其余两条算法一样。 */
  const preview = useMemo(
    () => overview?.previews.find((item) => item.protocol === "anthropic") ?? null,
    [overview],
  );

  const run = async <T,>(key: string, task: () => Promise<T>): Promise<T | null> => {
    setBusy(key);
    try {
      return await task();
    } catch (taskError) {
      toast.error("操作失败", { description: errorMessage(taskError) });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft?.system.trim()) {
      toast.error("卡的正文是空的", { description: "先写点内容再保存。" });
      return;
    }
    const next = await run("save", () => promptCardsApi.save(draft));
    if (!next) return;
    setOverview(next);
    setDraft(null);
    toast.success("已保存");
  };

  const remove = async (card: PromptCard) => {
    if (!window.confirm(`删除「${card.name}」？`)) return;
    const next = await run(`delete:${card.id}`, () =>
      promptCardsApi.remove(card.id),
    );
    if (!next) return;
    setOverview(next);
    if (draft?.id === card.id) setDraft(null);
  };

  const select = async (id: string | null) => {
    const next = await run("select", () => promptCardsApi.select(id));
    if (next) setOverview(next);
  };

  const activeMode = draft ? uiMode(draft.mode) : "append";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppPageHeader
        icon={<Syringe className="h-5 w-5" strokeWidth={1.5} />}
        title="提示词注入"
        titleExtra={
          <>
            {headerSlot}
            <HelpTip title="网关注入">
              Codex 已可通过下方注入代理真实生效：转发时把卡的内容加进
              instructions，不改任何配置文件。其他客户端待接入。
            </HelpTip>
          </>
        }
      />

      <div
        id="main-content"
        className="min-h-0 flex-1 overflow-y-auto scroll-stable"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 pb-12 pt-4">
          {error ? (
            <div className="flex items-start gap-3 rounded-card border border-danger/40 bg-danger-soft p-4 text-body">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-text" />
              <div className="min-w-0">
                <p className="font-medium text-danger-text">连不上本地后端</p>
                <p className="mt-1 break-all text-caption text-danger-text/80">
                  {error}
                </p>
              </div>
            </div>
          ) : null}

          <Notice tone="neutral" title="Codex 已可真实注入">
            卡存在 <code className="font-mono">~/.cc-switch/prompt-cards.json</code>
            。在下面把 Codex 接入后，Codex 的{" "}
            <code className="font-mono">/v1/responses</code>{" "}
            请求会先经过本工具，按当前卡改写 instructions；其他客户端待接入。
          </Notice>

          {/* ── Codex 注入代理 ── */}
          <section className="rounded-card border border-border bg-surface">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-start gap-2">
                <Plug className="mt-0.5 h-4 w-4 shrink-0 text-action-text" />
                <div>
                  <h2 className="text-body font-semibold text-fg-1">
                    Codex 注入代理
                  </h2>
                  <p className="mt-0.5 text-caption text-fg-2">
                    把 Codex 的 base_url 接到这里，请求先按当前人物卡改写，再转发给原来的上游。
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
                  proxy?.codex.usingProxy
                    ? "bg-success-soft text-success-text"
                    : "bg-subtle text-fg-2",
                )}
              >
                {proxy ? (proxy.codex.usingProxy ? "已接入" : "未接入") : "检查中"}
              </span>
            </header>

            <div className="space-y-3 p-4">
              {proxyError ? (
                <Notice tone="warning" title="注入代理不可用">
                  {proxyError}
                </Notice>
              ) : null}

              {proxy ? (
                <>
                  <div className="grid gap-2 text-caption sm:grid-cols-2">
                    <ProxyInfo
                      label="Codex 配置"
                      value={proxy.codex.configPath}
                    />
                    <ProxyInfo
                      label="当前 base_url"
                      value={proxy.codex.baseUrl ?? "—"}
                    />
                    <ProxyInfo label="注入代理" value={proxy.proxyBaseUrl} />
                    <ProxyInfo label="上游" value={proxy.upstream} />
                  </div>

                  {proxy.codex.error ? (
                    <p className="break-all text-caption text-danger-text">
                      {proxy.codex.error}
                    </p>
                  ) : null}

                  {proxy.lastInjection ? (
                    <details className="rounded-control border border-border bg-app px-3 py-2">
                      <summary className="cursor-pointer text-caption text-fg-2">
                        最近注入：{proxy.lastInjection.cardName} ·{" "}
                        {proxy.lastInjection.protocol} ·{" "}
                        {proxy.lastInjection.instructionsLength.toLocaleString(
                          "zh-CN",
                        )}{" "}
                        字符 ·{" "}
                        {proxy.lastInjection.containsCard
                          ? "已找到卡标记"
                          : "未找到卡标记"}{" "}
                        ·{" "}
                        {new Date(proxy.lastInjection.at).toLocaleString(
                          "zh-CN",
                          { hour12: false },
                        )}
                      </summary>
                      <div className="mt-2 text-caption text-fg-3">
                        instructions 末尾：
                      </div>
                      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-fg-2">
                        {proxy.lastInjection.instructionsTail}
                      </pre>
                    </details>
                  ) : (
                    <p className="text-caption text-fg-3">
                      还没有注入记录。接入后运行一次 Codex 会话就能在这里看到。
                    </p>
                  )}

                  {!proxy.card ? (
                    <p className="text-caption text-warning-text">
                      当前没有选中的卡，代理只会转发、不会注入。
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-caption text-fg-3">
                      保持 pnpm dev 运行；停掉后 Codex 会连不上，可随时恢复原地址。
                    </p>
                    <div className="flex gap-2">
                      {proxy.codex.usingProxy ? (
                        <Button
                          variant="neutral"
                          size="compact"
                          disabled={proxyBusy}
                          onClick={() => void setCodexProxy("restore")}
                        >
                          {proxyBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          恢复原地址
                        </Button>
                      ) : (
                        <Button
                          variant="solid"
                          size="compact"
                          disabled={proxyBusy || Boolean(proxy.codex.error)}
                          onClick={() => void setCodexProxy("enable")}
                        >
                          {proxyBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plug className="h-3.5 w-3.5" />
                          )}
                          接入 Codex
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              ) : !proxyError ? (
                <div className="flex items-center gap-2 py-2 text-caption text-fg-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在读取注入代理状态…
                </div>
              ) : null}
            </div>
          </section>

          {/* ── 卡列表 ── */}
          <section className="rounded-card border border-border bg-surface">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-body font-semibold text-fg-1">
                人物卡
                <span className="ms-2 font-normal text-caption text-fg-3">
                  选中的那张才会注入
                </span>
              </h2>
              <Button
                variant="neutral"
                size="compact"
                disabled={Boolean(busy)}
                onClick={() => setDraft({ ...EMPTY_DRAFT })}
              >
                <Plus className="h-3.5 w-3.5" />
                新建
              </Button>
            </header>

            {loading && !overview ? (
              <div className="py-10 text-center text-body text-fg-2">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : overview?.cards.length === 0 ? (
              <p className="px-4 py-8 text-center text-caption text-fg-3">
                还没有卡。
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {overview?.cards.map((card) => {
                  const current = card.id === overview.currentId;
                  return (
                    <li
                      key={card.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5",
                        draft?.id === card.id && "bg-subtle",
                      )}
                    >
                      <button
                        type="button"
                        aria-label={current ? "正在用这张" : "改用这张"}
                        aria-pressed={current}
                        disabled={Boolean(busy)}
                        onClick={() => void select(current ? null : card.id)}
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                          current
                            ? "border-transparent bg-success-soft text-success-text"
                            : "border-border text-transparent hover:border-border-strong",
                        )}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDraft(draftOf(card))}
                        className="min-w-0 flex-1 text-start"
                      >
                        <span className="text-body text-fg-1">{card.name}</span>
                        <span className="ms-2 text-caption text-fg-3">
                          {uiMode(card.mode) === "override" ? "替换" : "追加"} ·
                          约 {card.tokenEstimate} token
                        </span>
                      </button>

                      <Button
                        variant="quiet"
                        size="compact"
                        disabled={Boolean(busy)}
                        onClick={() => void remove(card)}
                        aria-label="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── 编辑 ── */}
          {draft ? (
            <section className="rounded-card border border-border bg-surface">
              <header className="border-b border-border px-4 py-3">
                <h2 className="text-body font-semibold text-fg-1">
                  {draft.id ? "编辑卡" : "新建卡"}
                </h2>
              </header>

              <div className="space-y-4 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="card-name">名字</Label>
                  <Input
                    id="card-name"
                    value={draft.name}
                    placeholder="例如：代码审查员"
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>放在哪</Label>
                  <SegmentedControl
                    aria-label="注入模式"
                    size="sm"
                    value={activeMode}
                    onValueChange={(mode) => setDraft({ ...draft, mode })}
                    items={MODES.map((item) => ({
                      value: item.value,
                      label: item.label,
                    }))}
                  />
                  <p className="text-caption text-fg-2">
                    {MODES.find((item) => item.value === activeMode)?.note}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="card-system">正文</Label>
                  <Textarea
                    id="card-system"
                    value={draft.system}
                    spellCheck={false}
                    placeholder="这张卡要让模型遵守的设定…"
                    onChange={(event) =>
                      setDraft({ ...draft, system: event.target.value })
                    }
                    className="h-44 resize-y font-mono text-[12px] leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="neutral"
                    size="compact"
                    disabled={Boolean(busy)}
                    onClick={() => setDraft(null)}
                  >
                    取消
                  </Button>
                  <Button
                    variant="solid"
                    size="compact"
                    disabled={Boolean(busy) || !draft.system.trim()}
                    onClick={() => void save()}
                  >
                    {busy === "save" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    保存
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          {/* ── 预览 ── */}
          {preview ? (
            <section className="rounded-card border border-border bg-surface">
              <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-body font-semibold text-fg-1">
                  注入后的 system
                </h2>
                <span className="text-caption text-fg-3">
                  {currentCard ? "样本：Claude Code 的一次请求" : "没选卡，不注入"}
                </span>
              </header>
              <div className="p-4">
                {preview.skipped ? (
                  <Notice tone="warning" title="这张卡不会生效">
                    {preview.skipped}
                  </Notice>
                ) : (
                  <pre className="max-h-64 overflow-auto rounded-control border border-border bg-app p-3 font-mono text-[11px] leading-relaxed text-fg-1">
                    {systemSlotOf(preview.after, "anthropic") || "（空）"}
                  </pre>
                )}
                {preview.injected ? (
                  <p className="mt-2 text-caption text-fg-3">
                    分隔线上面是 Claude Code 自己的 system，下面是你的卡。
                    <code className="ms-1 font-mono">cache_control</code>{" "}
                    还在上面那段，缓存不受影响。
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
