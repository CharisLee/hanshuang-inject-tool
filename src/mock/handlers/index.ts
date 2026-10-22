import type { MockHandler } from "../backend";
import { coreHandlers } from "./core";
import { extensionHandlers } from "./extensions";
import { providerHandlers } from "./providers";
import { sessionHandlers } from "./sessions";
import { usageHandlers } from "./usage";

/** 所有页面的假数据处理函数，按命令名合并 */
export const handlers: Record<string, MockHandler> = {
  ...coreHandlers,
  ...providerHandlers,
  ...extensionHandlers,
  ...sessionHandlers,
  ...usageHandlers,
};
