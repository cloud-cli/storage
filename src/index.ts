import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import {
  writeFile,
  readFile,
  mkdir,
  readdir,
  stat,
  rmdir,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";

type RouteHandler = (p: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  args: string[];
}) => void;

const createRoutes: (dir: string) => Record<string, RouteHandler> = (rootDir) => ({
  onIndex({ res }) {
    res.end("OK");
  },

  async onReadFile({ args, res }) {
    const [bin = "", hash = ""] = args;
    const filePath = join(rootDir, bin, hash);
    const metaPath = filePath + ".meta";

    if (!(bin && hash && existsSync(filePath))) {
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

    createReadStream(join(rootDir, bin, hash)).pipe(res);
  },

  async onCreateFile({ args, req, res }) {
    const [bin = ""] = args;
    const binPath = join(rootDir, bin);

    if (!(bin && existsSync(binPath))) {
      return notFound(res);
    }

    try {
      const payload = await readStream(req);
      const hash = randomUUID();
      const meta = payload.toString("utf-8");

      if (meta) {
        await writeFile(
          join(binPath, hash + ".meta"),
          JSON.stringify(JSON.parse(meta))
        );
      }

      await writeFile(join(binPath, hash), "");

      res.end("OK");
    } catch (error) {
      console.log(error);
      res.writeHead(500).end();
    }
  },

  onWriteFile({ args, req, res }) {
    const [bin = "", hash = ""] = args;
    const filePath = join(rootDir, bin, hash);

    if (!(bin && hash && existsSync(filePath))) {
      return notFound(res);
    }

    req.pipe(createWriteStream(filePath)).on("close", () => res.end("OK"));
  },

  async onReadBin({ args, res }) {
    const [bin = ""] = args;
    const binPath = join(rootDir, bin);

    if (!(bin && existsSync(binPath))) {
      return notFound(res);
    }

    tryCatch(res, async () => {
      const allFiles = await readdir(binPath);
      const files = allFiles.filter((f) => !f.endsWith(".meta"));
      res.end(JSON.stringify(files));
    });
  },

  onCreateBin({ res }) {
    tryCatch(res, () => {
      const id = randomUUID();
      ensureDir(join(rootDir, id));
      res.end(id);
    });
  },

  async onDeleteFile({ res, args }) {
    const [bin = "", file = ""] = args;
    const filePath = join(rootDir, bin, file);
    const metaPath = join(rootDir, bin, file + ".meta");

    if (!(bin && file && existsSync(filePath))) {
      return notFound(res);
    }

    tryCatch(res, async () => {
      await unlink(filePath);
      await unlink(metaPath);
      res.end("OK");
    });
  },

  async onDeleteBin({ res, args }) {
    const [bin = ""] = args;
    const binPath = join(rootDir, bin);

    if (!(bin && existsSync(binPath))) {
      return notFound(res);
    }

    tryCatch(res, async () => {
      await rmdir(binPath, { recursive: true });
      res.end("OK");
    });
  },

  async onApiSpec({ req, res }) {
    const host = new URL(
      req.headers["x-forwarded-proto"] +
        "//" +
        req.headers["x-forwarded-for"] +
        "/api"
    );

    const spec = await readFile("../api.yaml", "utf-8");
    res.end(spec.replace("__API_HOST__", String(host)));
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

export type Options = { port?: Number, rootDir?: string };

export function start(options: Options = {}) {
  const rootDir = process.env.ROOT_DIR || options.rootDir;

  if (!rootDir) {
    throw new Error("Cannot start without ROOT_DIR in environment.");
  }

  const routes = createRoutes(rootDir);

  createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const [action, ...args] = url.pathname.slice(1).split("/");
    const p = { req, res, args, url };
    const route = `${req.method} ${action}`.trim();

    switch (route) {
      case "GET":
        return routes.onIndex(p);

      case "GET api":
        return routes.onApiSpec(p);

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
