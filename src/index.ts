import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { join } from "node:path";
import {
  writeFile,
  readFile,
  mkdir,
  readdir,
  stat,
  rmdir,
  unlink,
} from "node:fs/promises";

type RouteHandler = (p: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  args: string[];
}) => void;

const createRoutes: (dir: string) => Record<string, RouteHandler> = (
  rootDir
) => ({
  async onReadFile({ args, res }) {
    const [binId = "", fileId = ""] = args;
    const filePath = join(rootDir, binId, fileId);
    const metaPath = filePath + ".meta";

    if (!(binId && fileId && existsSync(filePath))) {
      return notFound(res);
    }

    if (existsSync(metaPath)) {
      const metaContent = await readFile(metaPath, "utf-8");
      const meta = JSON.parse(metaContent);

      Object.entries(meta).forEach(([key, value]) =>
        res.setHeader(key, String(value))
      );
    }

    const stats = await stat(filePath);
    res.setHeader("content-length", stats.size);
    res.setHeader("last-modified", new Date(stats.mtime).toString());
    createReadStream(join(rootDir, binId, fileId)).pipe(res);
  },

  async onCreateFile({ args, req, res }) {
    const [binId = ""] = args;
    const binPath = join(rootDir, binId);

    if (!(binId && existsSync(binPath))) {
      return notFound(res);
    }

    try {
      const payload = await readStream(req);
      const fileId = randomUUID();
      const meta = payload.toString("utf-8");

      if (meta) {
        await writeFile(
          join(binPath, fileId + ".meta"),
          JSON.stringify(JSON.parse(meta))
        );
      }

      await writeFile(join(binPath, fileId), "");

      res.setHeader(
        "location",
        String(new URL(`/f/${binId}/${fileId}`, getProxyHost(req)))
      );
      res.end(fileId);
    } catch (error) {
      console.log(error);
      res.writeHead(500).end();
    }
  },

  onWriteFile({ args, req, res }) {
    const [binId = "", fileId = ""] = args;
    const filePath = join(rootDir, binId, fileId);

    if (!(binId && fileId && existsSync(filePath))) {
      return notFound(res);
    }

    const writer = createWriteStream(filePath);

    writer.on("close", () => {
      res.end(
        JSON.stringify({
          id: fileId,
          bin: binId,
          url: String(new URL(`/f/${binId}/${fileId}`, getProxyHost(req))),
        })
      );
    });

    req.pipe(writer);
  },

  async onReadBin({ args, res }) {
    const [binId = ""] = args;
    const binPath = join(rootDir, binId);

    if (!(binId && existsSync(binPath))) {
      return notFound(res);
    }

    tryCatch(res, async () => {
      const allFiles = await readdir(binPath);
      const files = allFiles.filter((f) => !f.endsWith(".meta"));
      res.end(JSON.stringify(files));
    });
  },

  onCreateBin({ req, res }) {
    tryCatch(res, () => {
      const binId = randomUUID();
      ensureDir(join(rootDir, binId));
      res.setHeader(
        "location",
        String(new URL("/bin/" + binId, getProxyHost(req)))
      );
      res.end(binId);
    });
  },

  async onDeleteFile({ res, args }) {
    const [binId = "", file = ""] = args;
    const filePath = join(rootDir, binId, file);
    const metaPath = join(rootDir, binId, file + ".meta");

    if (!(binId && file && existsSync(filePath))) {
      return notFound(res);
    }

    tryCatch(res, async () => {
      await unlink(filePath);
      await unlink(metaPath);
      res.end("OK");
    });
  },

  async onDeleteBin({ res, args }) {
    const [binId = ""] = args;
    const binPath = join(rootDir, binId);

    if (!(binId && existsSync(binPath))) {
      return notFound(res);
    }

    tryCatch(res, async () => {
      await rmdir(binPath, { recursive: true });
      res.end("OK");
    });
  },

  async onApiSpec({ req, res }) {
    const host = getProxyHost(req);
    const spec = await readFile("../api.yaml", "utf-8");
    res.end(spec.replace("__API_HOST__", host));
  },

  async onEsModule({ req, res }) {
    const host = getProxyHost(req);
    const file = await readFile("../filebin.mjs", "utf-8");
    res.end(file.replace("__API_HOST__", host));
  },
});

function notFound(res) {
  res.writeHead(404).end("Not found");
}

async function tryCatch(res, fn) {
  try {
    await fn();
  } catch (error) {
    onError(res, error);
  }
}

function onError(res, error) {
  console.log(error);
  res.writeHead(500).end();
}

function getProxyHost(req) {
  return new URL(
    req.headers["x-forwarded-proto"] +
      "//" +
      req.headers["x-forwarded-for"] +
      "/api"
  ).toString();
}

export type Options = { port?: Number; rootDir?: string };

export function start(options: Options = {}) {
  const rootDir = process.env.ROOT_DIR || options.rootDir;

  if (!rootDir) {
    throw new Error("Cannot start without ROOT_DIR in environment.");
  }

  const routes = createRoutes(rootDir);

  createServer((req, res) => {
    const _end = res.end;

    res.end = (...args) => {
      console.log(
        "[%s] %d %s %s",
        new Date().toISOString(),
        res.statusCode,
        req.method,
        req.url
      );
      return _end.apply(res, args);
    };

    const url = new URL(req.url, "http://localhost");
    const [action, ...args] = url.pathname.slice(1).split("/");
    const p = { req, res, args, url };
    const route = `${req.method} ${action}`.trim();

    switch (route) {
      case "GET":
        return routes.onApiSpec(p);

      case "GET index.mjs":
        return routes.onEsModule(p);

      case "GET f":
        return routes.onReadFile(p);

      case "POST f":
        return routes.onCreateFile(p);

      case "DELETE f":
        return routes.onDeleteFile(p);

      case "PUT f":
        return routes.onWriteFile(p);

      case "GET bin":
        return routes.onReadBin(p);

      case "POST bin":
        return routes.onCreateBin(p);

      case "DELETE bin":
        return routes.onDeleteBin(p);

      default:
        res.writeHead(404).end("Not found");
    }
  }).listen(Number(options.port || process.env.PORT));
}

function readStream(stream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts = [];
    stream.on("data", (c) => parts.push(c));
    stream.on("end", () => resolve(Buffer.concat(parts) as Buffer));
    stream.on("error", reject);
  });
}

function ensureDir(path) {
  if (existsSync(path)) return;
  return mkdir(path, { recursive: true });
}

export default start;
