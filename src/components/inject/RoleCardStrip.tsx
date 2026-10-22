import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Drama,
  Loader2,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  promptCardsApi,
  type CardMode,
  type PromptCard,
  type PromptCardsOverview,
} from "@/lib/promptCardsApi";

/**
 * 主界面上的「人物卡」开关。
 *
 * 以前要进「提示词注入 → 网关注入」才能开卡，用户找不到。这里把开关直接放到每个应用的
 * 主页面顶部：点一下开关就选中当前卡并生效；卡是全局的，换应用 / 换连接自动沿用。
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
    note: "覆盖客户端自带的 system，只留这张卡。会废掉工具说明，一般别用。",
  },
];

interface Draft {
  name: string;
  system: string;
  mode: CardMode;
}

const EMPTY_DRAFT: Draft = { name: "", system: "", mode: "append" };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function modeLabel(mode: CardMode): string {
  return mode === "override" ? "替换" : "追加";
}

export default function RoleCardStrip({
  onManage,
}: {
  /** 打开完整的「提示词注入 → 网关注入」页 */
  onManage?: () => void;
}) {
  const [overview, setOverview] = useState<PromptCardsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

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

  const cards = useMemo(() => overview?.cards ?? [], [overview?.cards]);
  const current = useMemo(
    () => cards.find((card) => card.id === overview?.currentId) ?? null,
    [cards, overview?.currentId],
  );
  const enabled = Boolean(current);

  const applyOverview = (next: PromptCardsOverview) => setOverview(next);

  const toggle = async (on: boolean) => {
    if (on && cards.length === 0) {
      setDraft(EMPTY_DRAFT);
      setDialogOpen(true);
      return;
    }
    const target = on ? (current?.id ?? cards[0]?.id ?? null) : null;
    if (on && !target) return;

    setBusy(true);
    try {
      const next = await promptCardsApi.select(target);
      applyOverview(next);
      const picked = next.cards.find((card) => card.id === next.currentId);
      toast.success(
        on ? `已开启「${picked?.name ?? "人物卡"}」` : "人物卡已关闭",
        {
          description: on
            ? "所有经过注入代理的连接都会自动注入，切换应用或连接不用再开。"
            : "之后的请求不再注入人物卡。",
          closeButton: true,
        },
      );
    } catch (toggleError) {
      toast.error("操作失败", { description: errorMessage(toggleError) });
    } finally {
      setBusy(false);
    }
  };

  const select = async (card: PromptCard) => {
    if (card.id === overview?.currentId) return;
    setBusy(true);
    try {
      const next = await promptCardsApi.select(card.id);
      applyOverview(next);
      toast.success(`已切换到「${card.name}」`, {
        description: "所有经过注入代理的连接都会自动使用这张卡。",
      });
    } catch (selectError) {
      toast.error("切换失败", { description: errorMessage(selectError) });
    } finally {
      setBusy(false);
    }
  };

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.system.trim()) {
      toast.error("卡的正文是空的", { description: "先写点内容再保存。" });
      return;
    }
    setSaving(true);
    try {
      const next = await promptCardsApi.save({
        name: draft.name.trim() || "未命名人物卡",
        system: draft.system,
        firstMes: "",
        mode: draft.mode,
        enabled: true,
      });
      applyOverview(next);
      setDialogOpen(false);
      toast.success("已保存并开启", {
        description: "所有经过注入代理的连接都会自动注入这张卡。",
        closeButton: true,
      });
    } catch (saveError) {
      toast.error("保存失败", { description: errorMessage(saveError) });
    } finally {
      setSaving(false);
    }
  };

  const activeDraftMode = draft.mode === "override" ? "override" : "append";

  return (
    <section
      className={cn(
        "rounded-card border bg-surface",
        enabled ? "border-success/40" : "border-border",
      )}
      aria-label="人物卡"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            enabled
              ? "bg-success-soft text-success-text"
              : "bg-action-soft text-action-text",
          )}
        >
          <Drama className="h-5 w-5" strokeWidth={1.6} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-body font-semibold text-fg-1">人物卡</h2>
            <span className="inline-flex h-5 items-center rounded-full bg-subtle px-2 text-xs font-medium text-fg-2">
              全局
            </span>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-fg-3" />
            ) : null}
          </div>
          <p className="mt-0.5 text-caption text-fg-2">
            {error
              ? "连不上本地后端，人物卡暂时不可用。"
              : enabled
                ? `已开启「${current?.name}」· ${modeLabel(current?.mode ?? "append")} · 约 ${current?.tokenEstimate ?? 0} token`
                : cards.length > 0
                  ? "点一下开关就生效。所有经过注入代理的连接自动注入，切换连接不用重开。"
                  : "还没有人物卡。新建一张，保存后自动开启。"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {cards.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="neutral"
                  size="compact"
                  disabled={busy || loading}
                  className="max-w-[190px] gap-1"
                >
                  <span className="truncate">
                    {current?.name ?? "选择人物卡"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[230px] rounded-panel border border-border bg-surface p-1 shadow-v7-md"
              >
                {cards.map((card) => (
                  <DropdownMenuItem
                    key={card.id}
                    onSelect={() => void select(card)}
                    className="min-h-8 gap-2 rounded-control px-2.5 py-1.5 text-body text-fg-1 focus:bg-subtle"
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        card.id === overview?.currentId
                          ? "text-success-text"
                          : "text-transparent",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{card.name}</span>
                    <span className="text-caption text-fg-3">
                      {modeLabel(card.mode)}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={openCreate}
                  className="min-h-8 gap-2 rounded-control px-2.5 py-1.5 text-body text-fg-1 focus:bg-subtle"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新建人物卡
                </DropdownMenuItem>
                {onManage ? (
                  <DropdownMenuItem
                    onSelect={onManage}
                    className="min-h-8 gap-2 rounded-control px-2.5 py-1.5 text-body text-fg-1 focus:bg-subtle"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    管理全部人物卡
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : !loading && !error ? (
            <Button
              variant="solid"
              size="compact"
              disabled={busy}
              onClick={openCreate}
            >
              <Plus className="h-3.5 w-3.5" />
              新建人物卡
            </Button>
          ) : null}

          <Switch
            checked={enabled}
            disabled={busy || loading || Boolean(error)}
            onCheckedChange={(value) => void toggle(value)}
            aria-label={enabled ? "关闭人物卡注入" : "开启人物卡注入"}
          />
        </div>
      </div>

      {enabled ? (
        <div className="flex flex-wrap items-center gap-x-1.5 border-t border-border px-4 py-2 text-caption text-fg-2">
          <span className="inline-flex items-center gap-1 font-medium text-success-text">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            已开启
          </span>
          <span>· 所有经过注入代理的连接自动注入</span>
          <span className="text-fg-3">· 换应用 / 换连接会自动沿用</span>
          {onManage ? (
            <Button
              variant="quiet"
              size="compact"
              className="ms-auto h-6 px-1.5 text-caption text-action-text"
              onClick={onManage}
            >
              管理
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建人物卡</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="role-card-name">名字</Label>
              <Input
                id="role-card-name"
                value={draft.name}
                placeholder="例如：代码审查员"
                onChange={(event) =>
                  setDraft((value) => ({ ...value, name: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>放在哪</Label>
              <SegmentedControl
                aria-label="注入模式"
                size="sm"
                value={activeDraftMode}
                onValueChange={(mode) =>
                  setDraft((value) => ({ ...value, mode }))
                }
                items={MODES.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
              />
              <p className="text-caption text-fg-2">
                {MODES.find((item) => item.value === activeDraftMode)?.note}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role-card-system">正文</Label>
              <Textarea
                id="role-card-system"
                value={draft.system}
                spellCheck={false}
                placeholder="这张卡要让模型遵守的设定…"
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    system: event.target.value,
                  }))
                }
                className="h-56 resize-y font-mono text-[12px] leading-relaxed"
              />
            </div>
          </div>
          <DialogFooter>
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
              disabled={saving || !draft.system.trim()}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              保存并开启
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
