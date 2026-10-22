/**
 * 会话页的假数据：会话列表 + 一段带执行步骤的对话记录（按 Channel 分段推送，和真后端一样）。
 */
import type { Channel } from "@tauri-apps/api/core";
import type { MockHandler } from "../backend";
import type { SessionMessage, SessionMeta, TranscriptChunk, TurnIndex } from "@/types";

const now = Date.now();
const minutesAgo = (m: number) => now - m * 60_000;

const session = (providerId: string, sessionId: string, title: string, summary: string, projectDir: string, activeMinutesAgo: number, durationMinutes: number): SessionMeta => ({
  providerId,
  sessionId,
  title,
  summary,
  projectDir,
  createdAt: minutesAgo(activeMinutesAgo + durationMinutes),
  lastActiveAt: minutesAgo(activeMinutesAgo),
  sourcePath: `/Users/demo/.${providerId}/projects/${sessionId}.jsonl`,
  resumeCommand: providerId === "codex" ? `codex resume ${sessionId}` : `claude --resume ${sessionId}`,
});

let sessions: SessionMeta[] = [
  session("claude", "a1f3c2d4", "给登录页加上记住密码和验证码", "加了记住密码、图形验证码，补了单元测试", "~/Code/web-console", 12, 95),
  session("codex", "b7e9d012", "订单列表分页很慢，帮我查一下原因", "加了联合索引，列表接口从 2.3s 降到 120ms", "~/Code/order-service", 48, 40),
  session("claude", "c4a8e6f1", "把用户表的手机号字段迁移成加密存储", "写了迁移脚本和回滚脚本，灰度方案待确认", "~/Code/user-center", 180, 70),
  session("gemini", "d2b5f7a3", "解释一下这个正则为什么会超时", "回溯太多，改成占有型量词后正常", "~/Code/log-parser", 320, 15),
  session("opencode", "e9c1b4d8", "写一个导出 Excel 的接口", "用流式写入，10 万行内存稳定在 80MB", "~/Code/report-api", 1440, 55),
  session("claude", "f6d2a9c3", "升级 React 18 到 19，看看要改哪些地方", "列出了 14 处需要改的地方，已改完 9 处", "~/Code/web-console", 2900, 120),
  session("codex", "a8b3e5f2", "CI 里测试偶尔失败，帮我定位", "时间相关的断言没固定时钟，已修复", "~/Code/order-service", 4300, 35),
  session("grokbuild", "c3e7a1b9", "给 README 补上部署说明", "补了 Docker 和 PM2 两种部署方式", "~/Code/report-api", 8600, 20),
];

// ── 对话记录：两轮提问，第一轮带执行步骤（含一次失败） ──────────────────────────

const ts = (m: number) => minutesAgo(m);

function buildTranscript(meta: SessionMeta): SessionMessage[] {
  const model = meta.providerId === "codex" ? "gpt-5.6" : "claude-fable-5-1";
  const question = meta.title ?? "帮我看一下这个问题";
  return [
    { role: "user", id: "m1", turnId: "t1", ts: ts(130), content: `${question}。改之前先看一下现在的代码是怎么写的。` },
    {
      role: "assistant", id: "m2", turnId: "t1", ts: ts(129),
      meta: { model, inputTokens: 18200, outputTokens: 2400, cacheReadTokens: 152000, costUsd: 0.184, durationMs: 412_000 },
      blocks: [
        { type: "thinking", text: "先找到相关的页面和接口，看看现在的实现，再决定怎么改。", summary: "先读代码再动手", durationMs: 3200 },
        { type: "tool_call", id: "c1", rawName: "Bash", kind: "shell", title: "Bash", detail: "rg -n \"login\" src --type ts", inputPreview: "{\"command\":\"rg -n \\\"login\\\" src --type ts\"}", inputTotalLen: 42 },
        { type: "tool_result", callId: "c1", status: "success", preview: "src/pages/Login.tsx:12:export function LoginPage() {\nsrc/api/auth.ts:8:export async function login(form: LoginForm) {\nsrc/api/auth.ts:31:export async function logout() {", totalLen: 160, lineCount: 3, truncated: false, exitCode: 0, durationMs: 180 },
        { type: "tool_call", id: "c2", rawName: "Read", kind: "read", title: "Read", detail: "src/pages/Login.tsx", inputPreview: "{\"file_path\":\"src/pages/Login.tsx\"}", inputTotalLen: 34 },
        { type: "tool_result", callId: "c2", status: "success", preview: "import { useState } from \"react\";\nimport { login } from \"@/api/auth\";\n\nexport function LoginPage() {\n  const [form, setForm] = useState({ username: \"\", password: \"\" });\n  ...", totalLen: 2140, lineCount: 86, truncated: true, durationMs: 20 },
        { type: "tool_call", id: "c3", rawName: "Bash", kind: "shell", title: "Bash", detail: "pnpm test src/pages/Login.test.tsx", inputPreview: "{\"command\":\"pnpm test src/pages/Login.test.tsx\"}", inputTotalLen: 46 },
        { type: "tool_result", callId: "c3", status: "error", preview: "FAIL  src/pages/Login.test.tsx\n  ● 登录页 › 勾选记住密码后刷新页面仍保留用户名\n\n    expect(received).toBe(expected)\n    Expected: \"demo\"\n    Received: \"\"", totalLen: 640, lineCount: 18, truncated: true, exitCode: 1, durationMs: 2600 },
        { type: "tool_call", id: "c4", rawName: "Edit", kind: "edit", title: "Edit", detail: "src/pages/Login.tsx", inputPreview: "{\"file_path\":\"src/pages/Login.tsx\",\"old_string\":\"...\",\"new_string\":\"...\"}", inputTotalLen: 820, diff: { files: [{ path: "src/pages/Login.tsx", op: "update", added: 24, removed: 3 }], added: 24, removed: 3 } },
        { type: "tool_result", callId: "c4", status: "success", preview: "已修改 src/pages/Login.tsx", totalLen: 24, lineCount: 1, truncated: false, durationMs: 15 },
        { type: "tool_call", id: "c5", rawName: "Bash", kind: "shell", title: "Bash", detail: "pnpm test src/pages/Login.test.tsx", inputPreview: "{\"command\":\"pnpm test src/pages/Login.test.tsx\"}", inputTotalLen: 46 },
        { type: "tool_result", callId: "c5", status: "success", preview: "PASS  src/pages/Login.test.tsx\n  ✓ 勾选记住密码后刷新页面仍保留用户名 (38 ms)\n  ✓ 验证码错误时提示并刷新图片 (21 ms)\n\nTests: 6 passed, 6 total", totalLen: 210, lineCount: 6, truncated: false, exitCode: 0, durationMs: 3100 },
        { type: "text", text: "改好了，测试全部通过。\n\n**改了什么**\n- 登录页加了「记住密码」：只记用户名，密码不落地，下次打开自动填好。\n- 加了图形验证码：连续输错 3 次才出现，验证码错误时自动换一张。\n- 补了 2 个单元测试，覆盖上面两种情况。\n\n第一次跑测试失败，是因为刷新后没从本地存储读回用户名，已经修好。" },
      ],
    },
    { role: "user", id: "m3", turnId: "t2", ts: ts(40), content: "验证码图片在深色模式下看不清，调一下" },
    {
      role: "assistant", id: "m4", turnId: "t2", ts: ts(39),
      meta: { model, inputTokens: 6100, outputTokens: 640, cacheReadTokens: 171000, costUsd: 0.052, durationMs: 64_000 },
      blocks: [
        { type: "tool_call", id: "c6", rawName: "Edit", kind: "edit", title: "Edit", detail: "src/components/Captcha.tsx", inputPreview: "{\"file_path\":\"src/components/Captcha.tsx\"}", inputTotalLen: 320, diff: { files: [{ path: "src/components/Captcha.tsx", op: "update", added: 6, removed: 2 }], added: 6, removed: 2 } },
        { type: "tool_result", callId: "c6", status: "success", preview: "已修改 src/components/Captcha.tsx", totalLen: 30, lineCount: 1, truncated: false, durationMs: 12 },
        { type: "text", text: "深色模式下给验证码图片加了浅色底和细边框，现在两种模式都看得清。" },
      ],
    },
  ];
}

function turnsOf(messages: SessionMessage[]): TurnIndex[] {
  const turns: TurnIndex[] = [];
  messages.forEach((message, index) => {
    if (!message.turnId) return;
    let turn = turns.find((item) => item.turnId === message.turnId);
    if (!turn) {
      turn = { turnId: message.turnId, firstMessageIndex: index, lastMessageIndex: index, questionPreview: message.content ?? "", ts: message.ts, stepCount: 0, errorCount: 0, hasFinalReply: false, aborted: false };
      turns.push(turn);
    }
    turn.lastMessageIndex = index;
    for (const block of message.blocks ?? []) {
      if (block.type === "tool_call") turn.stepCount += 1;
      if (block.type === "tool_result" && block.status === "error") turn.errorCount += 1;
      if (block.type === "text") turn.hasFinalReply = true;
    }
  });
  return turns;
}

const findSession = (sourcePath: unknown) =>
  sessions.find((item) => item.sourcePath === sourcePath) ?? sessions[0];

export const sessionHandlers: Record<string, MockHandler> = {
  list_sessions: () => sessions,
  get_session_messages: (args) => buildTranscript(findSession(args.sourcePath)),
  stream_session_messages: (args) => {
    const channel = args.onChunk as Channel<TranscriptChunk>;
    const messages = buildTranscript(findSession(args.sourcePath));
    const send = (chunk: TranscriptChunk) => channel.onmessage(chunk);
    send({ type: "header", total: messages.length, turns: turnsOf(messages), cached: true, parseMs: 4 });
    send({ type: "messages", start: 0, messages });
    send({ type: "done", payloadBytes: 48_213 });
    return null;
  },
  get_session_block_content: () => ({ text: "（演示数据：完整内容没有保存）", totalLen: 18, truncated: false }),
  get_session_usage_summary: () => ({
    totalRequests: 10,
    totalCost: "0.2360",
    totalInputTokens: 24300,
    totalOutputTokens: 3040,
    totalCacheCreationTokens: 8200,
    totalCacheReadTokens: 323000,
    successRate: 100,
    realTotalTokens: 358540,
    cacheHitRate: 0.91,
  }),
  get_session_usage_last_sync: () => now - 20_000,
  delete_session: (args) => {
    sessions = sessions.filter((item) => item.sourcePath !== args.sourcePath);
    return true;
  },
  delete_sessions: (args) => {
    const items = (args.items as { sourcePath: string }[]) ?? [];
    sessions = sessions.filter((item) => !items.some((target) => target.sourcePath === item.sourcePath));
    return items.map((item) => ({ ...item, success: true }));
  },
};
