import { useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { AppId } from "@/lib/api";
import FileInjectPanel from "./FileInjectPanel";
import PromptCardPanel from "./PromptCardPanel";

/**
 * 提示词注入统一页。两种生效方式共用一个侧栏入口，在页头切换：
 *
 * - 本机文件：把提示词写进客户端自己的全局指令文件，按应用分开，只对该应用生效。
 * - 网关注入：转发时改请求的 system 槽，对所有客户端生效（还没接到代理）。
 */
export type InjectView = "files" | "gateway";

/** 支持文件注入的应用，和 server/injectApiPlugin.ts 的 APPS 对应。 */
const INJECT_APP_IDS: AppId[] = [
  "claude",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
  "pi",
  "mcode",
  "dsh",
];

export default function UnifiedInjectPanel({
  initialView = "gateway",
}: {
  /** 从主界面人物卡「管理」进来时直接落在网关注入 */
  initialView?: InjectView;
}) {
  const [view, setView] = useState<InjectView>(initialView);
  const [appId, setAppId] = useState<AppId>("claude");

  const tabs = (
    <SegmentedControl
      aria-label="注入方式"
      size="sm"
      value={view}
      onValueChange={setView}
      items={[
        { value: "gateway", label: "网关注入" },
        { value: "files", label: "本机文件" },
      ]}
    />
  );

  return view === "files" ? (
    <FileInjectPanel
      appId={appId}
      apps={INJECT_APP_IDS}
      onAppChange={setAppId}
      headerSlot={tabs}
    />
  ) : (
    <PromptCardPanel headerSlot={tabs} />
  );
}
