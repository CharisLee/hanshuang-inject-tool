/**
 * 打包版入口：不依赖 Vite，直接起一个本地 HTTP 服务。
 *
 * - 静态文件来自同目录的 dist/
 * - 后端复用各 Vite 插件里已经写好的中间件（提示词库、人物卡、Seep、Codex 注入代理）
 * - 同时监听 127.0.0.1 和 ::1，localhost 两种解析都能访问
 *
 * 打包方式见 vite.server.config.ts；产物 release/寒霜注入工具/server.mjs。
 */
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import fsp from "node:fs/promises";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { injectApiPlugin } from "./injectApiPlugin";
import { promptLibraryPlugin } from "./promptLibraryPlugin";
import { codexAssetsPlugin } from "./codexAssetsPlugin";
import { promptCardsPlugin } from "./promptCardsPlugin";
import { seepPlugin } from "./seepPlugin";
import { cardProxyPlugin } from "./cardProxyPlugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(__dirname, "dist"));
const PORT = Number(process.env.PORT || 5190);

type Next = () => void;
type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: Next,
) => void;

const middlewares: Middleware[] = [];

// 给各插件的 configurePreviewServer 一个最小 server 形状。
const fakeHttpServer = { on() {} };
const fakePreviewServer = {
  middlewares: {
    use(handler: Middleware) {
      middlewares.push(handler);
    },
  },
  httpServer: fakeHttpServer,
};

const plugins = [
  injectApiPlugin(),
  promptLibraryPlugin(),
  codexAssetsPlugin(),
  promptCardsPlugin(),
  seepPlugin(),
  cardProxyPlugin(),
];

for (const plugin of plugins) {
  const configure = (
    plugin as unknown as {
      configurePreviewServer?: (server: typeof fakePreviewServer) => void;
    }
  ).configurePreviewServer;
  if (typeof configure === "function") configure(fakePreviewServer);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

async function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) throw new Error("not a file");
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  res.setHeader(
    "Cache-Control",
    filePath.includes(`${path.sep}assets${path.sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  );
  if (req.method === "HEAD") {
    res.setHeader("Content-Length", stat.size);
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/") || url.pathname === "/v1" || url.pathname.startsWith("/v1/")) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const distRoot = path.resolve(DIST_DIR);
  const resolved = path.resolve(distRoot, "." + pathname);
  if (resolved !== distRoot && !resolved.startsWith(distRoot + path.sep)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    await sendFile(req, res, resolved);
    return;
  } catch {
    // 没有扩展名的路径回落到 SPA 入口
    if (!path.extname(pathname)) {
      try {
        await sendFile(req, res, path.join(distRoot, "index.html"));
        return;
      } catch {
        // fall through
      }
    }
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("404 Not Found");
}

function dispatch(req: IncomingMessage, res: ServerResponse) {
  let index = 0;
  const next: Next = () => {
    const middleware = middlewares[index++];
    if (!middleware) {
      void serveStatic(req, res);
      return;
    }
    try {
      middleware(req, res, next);
    } catch (error) {
      console.error("[standalone] middleware error:", error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal server error" });
      } else {
        res.destroy();
      }
    }
  };
  next();
}

const handler = (req: IncomingMessage, res: ServerResponse) => dispatch(req, res);
const servers: http.Server[] = [];
let announced = false;

function listen(host: string) {
  const server = http.createServer(handler);
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`端口 ${PORT} 已被占用，请先关闭占用它的程序。`);
    } else {
      console.error(`监听 ${host} 失败：`, error.message);
    }
    process.exitCode = 1;
  });
  server.listen(PORT, host, () => {
    if (announced) return;
    announced = true;
    console.log("");
    console.log(`  寒霜注入工具已启动：http://localhost:${PORT}`);
    console.log("  关闭这个窗口即可停止服务。");
    console.log("");
  });
  servers.push(server);
}

listen("127.0.0.1");
listen("::1");

function shutdown() {
  // 让 Seep 插件把 Python MCP 子进程带走，避免关掉窗口后还留在后台
  for (const plugin of plugins) {
    try {
      (
        plugin as unknown as { closeBundle?: () => void }
      ).closeBundle?.();
    } catch {
      // ignore
    }
  }
  for (const server of servers) server.close();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("SIGHUP", shutdown);
process.once("SIGBREAK", shutdown);
