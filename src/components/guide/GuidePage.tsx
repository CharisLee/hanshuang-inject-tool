import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  MessageCircle,
  Send,
  Sparkles,
  Wrench,
} from "lucide-react";
import { AppPageHeader } from "@/components/shell/AppPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  openExternalLink,
  QQ_GROUP_URL,
  TELEGRAM_GROUP_URL,
} from "@/lib/communityLinks";
import type { GlobalPage } from "@/lib/navigation";

interface GuidePageProps {
  onOpenPage: (page: GlobalPage) => void;
  onOpenWorkbench: () => void;
}

const PAGE_GUIDE: Array<{ name: string; description: string }> = [
  {
    name: "每个应用（左侧 Agent）",
    description:
      "提示词工作台：添加、编辑、切换、停用提示词；页面顶部的「人物卡」一键开关。",
  },
  {
    name: "提示词注入",
    description:
      "「本机文件」把提示词写进各客户端自己的全局指令文件；「网关注入」编辑人物卡并预览，Codex 可在该页一键接入真实注入代理。",
  },
  {
    name: "Seep 工具",
    description:
      "直接调用 Seep 的 23 个逆向工具，或把 seep MCP 一键接入 Claude Code / Codex 等客户端。",
  },
  {
    name: "MCP",
    description: "管理各客户端的 MCP 服务器，按应用矩阵启用或停用。",
  },
  {
    name: "Skills",
    description: "查看已安装技能、发现新技能，并同步到各客户端。",
  },
  {
    name: "应用",
    description: "安装和升级 Claude Code、Codex 等命令行 Agent。",
  },
  {
    name: "设置",
    description: "通用偏好、外观、版本信息；目前只保留「通用」和「关于」。",
  },
];

const FAQS: Array<{ question: string; answer: string }> = [
  {
    question: "添加或切换提示词后，为什么没有生效？",
    answer:
      "提示词写进的是客户端的全局指令文件，通常要新开一次会话才生效；部分客户端需要重启。确认列表里显示「使用中」，并检查卡片上方的目标文件路径是否是你期望的那个。",
  },
  {
    question: "人物卡怎么真正生效？",
    answer:
      "Codex 已经可以真实注入：到「提示词注入 → 网关注入 → Codex 注入代理」点「接入 Codex」，之后 Codex 的 /v1/responses 请求会先经过本工具，按当前卡改写 instructions。需要保持 pnpm dev 运行；点「恢复原地址」可以随时撤销。其他客户端后续接入。",
  },
  {
    question: "Seep 工具连不上或提示 Python 错误？",
    answer:
      "确认 Seep 目录下存在 Tool/mcp/seep_mcp_server.py，并且本机 Python 3.10+ 已安装 mcp 库：pip install \"mcp>=1.20,<1.29\"。回到页面点「重新连接」或「运行体检」，展开 Python 错误输出可以看到具体原因。",
  },
  {
    question: "工具调用很慢或超时？",
    answer:
      "APK 反编译、字符串扫描等任务可能需要几十秒到几分钟；桥接接口的单次调用上限是 10 分钟。先跑一次「运行体检」确认 Radare2 / JADX / Apktool 都就绪，再把目标文件路径填完整。",
  },
  {
    question: "写入配置前会备份吗？",
    answer:
      "会。提示词切换备份在 ~/.cc-switch/backups/prompt-library/；Seep MCP 配置备份在 ~/.cc-switch/backups/seep-mcp/；人物卡数据在 ~/.cc-switch/prompt-cards.json。MCP 页面的写入如果失败，不会覆盖原文件。",
  },
  {
    question: "Seep MCP 可以接入哪些客户端？",
    answer:
      "Claude Code、Codex、Gemini CLI、Grok Build、OpenCode、Pi、MiniMax Code。Hermes 使用 YAML 配置，当前版本暂不自动写入，可以在「Seep 工具 → 接入 MCP」里复制手动配置片段。",
  },
];

function QuickStep({
  index,
  title,
  description,
  action,
  onClick,
}: {
  index: number;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-panel border border-border bg-app p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-action text-xs font-semibold text-action-fg">
          {index}
        </span>
        <h3 className="text-body font-semibold text-fg-1">{title}</h3>
      </div>
      <p className="mt-2 flex-1 text-caption leading-relaxed text-fg-2">
        {description}
      </p>
      <Button
        variant="quiet"
        size="compact"
        className="mt-3 justify-start px-0 text-action-text"
        onClick={onClick}
      >
        {action}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function GuidePage({
  onOpenPage,
  onOpenWorkbench,
}: GuidePageProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppPageHeader
        icon={<BookOpen className="h-5 w-5" strokeWidth={1.5} />}
        title="使用教程"
        titleExtra={
          <Badge variant="outline" className="h-5 px-1.5 text-badge">
            1 分钟上手
          </Badge>
        }
      />

      <div
        id="main-content"
        className="min-h-0 flex-1 overflow-y-auto scroll-stable"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 pb-12 pt-4">
          <section className="rounded-card border border-border bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-title font-semibold text-fg-1">
                  先看这三步
                </h2>
                <p className="mt-1 max-w-2xl text-body leading-relaxed text-fg-2">
                  寒霜注入工具把提示词注入、网关注入和 Seep 逆向工具放在一个界面里。
                  先选应用加提示词，再决定是否开人物卡；需要逆向时再去 Seep 工具。
                </p>
              </div>
              <Sparkles className="h-5 w-5 shrink-0 text-action-text" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <QuickStep
                index={1}
                title="给应用加提示词"
                description="左侧点一个 Agent，在「添加提示词」里选模板或自己写；勾选「保存后立即启用」会直接写入该应用的全局指令文件。"
                action="打开提示词工作台"
                onClick={onOpenWorkbench}
              />
              <QuickStep
                index={2}
                title="一键开人物卡"
                description="每个应用主页面顶部都有「人物卡」开关。点一下即对所有经过注入代理的连接生效，换应用不用重开；Codex 可在注入页一键接入。"
                action="查看人物卡管理"
                onClick={() => onOpenPage("inject")}
              />
              <QuickStep
                index={3}
                title="调用 Seep 逆向工具"
                description="左侧「Seep 工具」里设置 Seep 目录，直接调用 23 个工具；也可以在「接入 MCP」把 seep 写进各客户端。"
                action="打开 Seep 工具"
                onClick={() => onOpenPage("seep")}
              />
            </div>
          </section>

          <section className="rounded-card border border-border bg-surface">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <CircleHelp className="h-4 w-4 text-fg-2" />
              <h2 className="text-body font-semibold text-fg-1">页面地图</h2>
            </header>
            <ul className="divide-y divide-border">
              {PAGE_GUIDE.map((item) => (
                <li
                  key={item.name}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <span className="shrink-0 text-body font-medium text-fg-1 sm:w-44">
                    {item.name}
                  </span>
                  <span className="text-caption leading-relaxed text-fg-2">
                    {item.description}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-card border border-border bg-surface">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Wrench className="h-4 w-4 text-fg-2" />
              <h2 className="text-body font-semibold text-fg-1">常见问题</h2>
            </header>
            <div className="divide-y divide-border">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group px-4 py-3">
                  <summary className="cursor-pointer list-none text-body font-medium text-fg-1 marker:content-none">
                    <span className="flex items-center gap-2">
                      <span className="text-fg-3 transition-transform group-open:rotate-90">
                        ›
                      </span>
                      {faq.question}
                    </span>
                  </summary>
                  <p className="mt-2 ps-5 text-caption leading-relaxed text-fg-2">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>

          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-body font-semibold text-fg-1">加入交流群</h2>
            <p className="mt-1 text-caption text-fg-2">
              遇到问题、想反馈功能或看别人的用法，可以加群交流。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="neutral"
                size="compact"
                onClick={() => openExternalLink(TELEGRAM_GROUP_URL)}
              >
                <Send className="h-3.5 w-3.5" />
                加入 TG 群
              </Button>
              <Button
                variant="neutral"
                size="compact"
                onClick={() => openExternalLink(QQ_GROUP_URL)}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                加入 QQ 群
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
