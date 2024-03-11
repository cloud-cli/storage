import type { IncomingMessage } from 'node:http';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeFile, readFile, mkdir, readdir, stat, rm, unlink } from 'node:fs/promises';
import router from 'micro-router';
import * as yazl from 'yazl';
import * as yauzl from 'yauzl';

const rootDir = process.env.ROOT_DIR;
export type Options = { port?: Number };

async function onReadFile(_req, res, args) {
  const { binId = '', fileId = '' } = args;
  const filePath = join(rootDir, binId, fileId);
  const metaPath = filePath + '.meta';

  if (!(binId && fileId && existsSync(filePath))) {
    return notFound(res);
  }

  tryCatch(res, async () => {
    const meta = await readMeta(metaPath);
    const stats = await stat(filePath);

    Object.entries(meta).forEach(([key, value]) => res.setHeader(key == 'type' ? 'content-type' : key, String(value)));

    res.setHeader('content-length', stats.size);
    res.setHeader('last-modified', new Date(stats.mtime).toString());

    createReadStream(filePath).pipe(res);
  });
}

async function onReadMetadata(req, res, args) {
  const { binId = '', fileId = '' } = args;
  const filePath = join(rootDir, binId, fileId);
  const metaPath = filePath + '.meta';

  if (!(binId && fileId && existsSync(filePath))) {
    return notFound(res);
  }

  tryCatch(res, async () => {
    const meta = await readMeta(metaPath);
    const stats = await stat(filePath);
    const baseUrl = getProxyHost(req);

    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        ...meta,
        id: fileId,
        bin: binId,
        size: stats.size,
        name: meta.name || fileId,
        lastModified: new Date(stats.mtime).toISOString(),
        url: String(new URL(`/f/${binId}/${fileId}`, baseUrl)),
      }),
    );
  });
}

async function onWriteMetadata(req, res, args) {
  const { binId = '', fileId = '' } = args;
  const filePath = join(rootDir, binId, fileId);
  const metaPath = filePath + '.meta';

  if (!(binId && fileId && existsSync(filePath))) {
    return notFound(res);
  }

  tryCatch(res, async () => {
    const payload = await readStream(req);
    const meta = payload.toString('utf-8').trim();

    if (meta) {
      await writeFile(metaPath, JSON.stringify(JSON.parse(meta)));
      const url = String(new URL(`/f/${binId}/${fileId}`, getProxyHost(req)));
      res.writeHead(202).end(JSON.stringify({ url }));
      return;
    }

    res.writeHead(400).end();
  });
}

async function onCreateFile(req, res, args) {
  const { binId = '' } = args;
  const binPath = join(rootDir, binId);

  if (!(binId && existsSync(binPath))) {
    return notFound(res);
  }

  tryCatch(res, async () => {
    const payload = await readStream(req);
    const fileId = randomUUID();
    const meta = payload.toString('utf-8');

    if (meta) {
      await writeFile(join(binPath, fileId + '.meta'), JSON.stringify(JSON.parse(meta)));
    }

    await writeFile(join(binPath, fileId), '');

    res.setHeader('location', String(new URL(`/f/${binId}/${fileId}`, getProxyHost(req))));
    res.writeHead(201).end(`{"fileId": "${fileId}"}`);
  });
}

function onWriteFile(req, res, args) {
  const { binId = '', fileId = '' } = args;
  const filePath = join(rootDir, binId, fileId);

  if (!(binId && fileId && existsSync(filePath))) {
    return notFound(res);
  }

  const writer = createWriteStream(filePath);

  writer.on('close', () => {
    res.writeHead(202);
    res.end(
      JSON.stringify({
        id: fileId,
        bin: binId,
        url: String(new URL(`/f/${binId}/${fileId}`, getProxyHost(req))),
      }),
    );
  });

  req.pipe(writer);
}

async function onReadBin(_req, res, args) {
  const { binId = '' } = args;
  const binPath = join(rootDir, binId);

  if (!(binId && existsSync(binPath))) {
    return notFound(res);
  }

  tryCatch(res, async () => {
    const allFiles = await readdir(binPath);
    const files = allFiles.filter((f) => !f.endsWith('.meta'));
    res.end(JSON.stringify(files));
  });
}

function onCreateBin(req, res) {
  tryCatch(res, () => {
    const binId = randomUUID();
    ensureDir(join(rootDir, binId));
    res.setHeader('location', String(new URL('/bin/' + binId, getProxyHost(req))));
    res.writeHead(201).end(`{"binId": "${binId}"}`);
  });
}

async function onDeleteFile(_req, res, args) {
  const { binId = '', file = '' } = args;
  const filePath = join(rootDir, binId, file);
  const metaPath = join(rootDir, binId, file + '.meta');

  if (!(binId && file && existsSync(filePath))) {
    return notFound(res);
  }

  tryCatch(res, async () => {
    await unlink(filePath);

    if (existsSync(metaPath)) {
      await unlink(metaPath);
    }

    res.end('OK');
  });
}

async function onDeleteBin(_req, res, args) {
  const { binId = '' } = args;
  const binPath = join(rootDir, binId);

  if (!(binId && existsSync(binPath))) {
    return notFound(res);
  }

  tryCatch(res, async () => {
    await rm(binPath, { recursive: true });
    res.end('OK');
  });
}

async function onApiSpec(req, res) {
  const host = getProxyHost(req);
  const spec = await readFile('./api.yaml', 'utf-8');
  res.end(spec.replace('__API_HOST__', host));
}

async function onEsModule(req, res) {
  const host = getProxyHost(req);
  const file = await readFile('./filebin.mjs', 'utf-8');
  res.setHeader('content-type', 'text/javascript');
  res.end(file.replace('__API_HOST__', host));
}

async function onGetUI(_req, res) {
  res.setHeader('content-type', 'text/html');
  createReadStream('./index.html').pipe(res);
}

async function onUploadZip(req, res, args) {
  const { binId = '' } = args;
  const binPath = join(rootDir, binId);

  if (!(binId && existsSync(binPath))) {
    return notFound(res);
  }

  const uid = randomUUID();
  const tmpFile = join(binPath, uid);

  try {
    await new Promise((resolve, reject) => {
      req.on('end', () => {
        const zipOptions = {
          strictFileNames:true,
          lazyEntries: true,
          decodeStrings: true
        };

        yauzl.open(tmpFile, zipOptions, (err, zip) => {
          if (err) {
            return reject(err);
          }

          zip.on('error', (err) => reject(err));

          zip.once('end', () => {
            zip.close();
            resolve(true);
          });

          zip.on('entry', (entry) => {
            if (entry.fileName.endsWith('/')) {
              zip.readEntry();
              return;
            }

            zip.openReadStream(entry, async (err, readStream) => {
              if (err) {
                return reject(err);
              }

              readStream.on("end", () => zip.readEntry());

              const fileId = randomUUID();
              const meta = { name: entry.fileName };
              const stream = createWriteStream(join(binPath, fileId));

              await writeFile(join(binPath, fileId + '.meta'), JSON.stringify(meta));
              readStream.pipe(stream);
            });
          });

          zip.readEntry();
        });
      });

      req.pipe(createWriteStream(tmpFile));
    });

    res.writeHead(202).end(`{"binId": "${binId}"}`);
} catch (error) {
    console.log(error);
    res.writeHead(500).end();
  } finally {
    unlink(tmpFile);
  }
}

async function onDownloadZip(_req, res, args) {
  let { binId = '' } = args;
  binId = binId.replace('.zip', '');
  const binPath = join(rootDir, binId);

  if (!(binId && existsSync(binPath))) {
    return notFound(res);
  }

  tryCatch(res, async () => {
    const zip = new yazl.ZipFile();
    const allFiles = await readdir(binPath);
    const files = allFiles.filter((f) => !f.endsWith('.meta'));

    res.setHeader('content-type', 'application/x-zip');
    res.setHeader('Content-Disposition', `attachment; filename="archive-${binId.slice(0, 8)}.zip"`);
    zip.outputStream.pipe(res);

    for (const fileId of files) {
      const filePath = join(rootDir, binId, fileId);
      const metaPath = filePath + '.meta';
      const meta = await readMeta(metaPath);
      const buffer = await readFile(filePath);
      const fileName = meta.name || fileId;
      zip.addBuffer(buffer, fileName);
    }

    zip.end();
  });
}

function notFound(res) {
  res.writeHead(404).end('Not found');
}

async function tryCatch(res, fn) {
  try {
    await fn();
  } catch (error) {
    console.log(error);
    res.writeHead(500).end();
  }
}

function getProxyHost(req: IncomingMessage) {
  return new URL(
    `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-for'] || req.headers.host}`,
  ).toString();
}

function readStream(stream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts = [];
    stream.on('data', (c) => parts.push(c));
    stream.on('end', () => resolve(Buffer.concat(parts) as Buffer));
    stream.on('error', reject);
  });
}

function ensureDir(path) {
  if (existsSync(path)) return;
  return mkdir(path, { recursive: true });
}

async function readMeta(metaPath: string) {
  if (existsSync(metaPath)) {
    return JSON.parse(await readFile(metaPath, 'utf8'));
  }

  return {};
}

const match = router({
  'GET /': onGetUI,
  'GET /api': onApiSpec,
  'GET /index.mjs': onEsModule,
  'POST /bin': onCreateBin,
  'GET /bin/:binId': onReadBin,
  'DELETE /bin/:binId': onDeleteBin,

  'POST /f/:binId': onCreateFile,
  'GET /f/:binId/:fileId': onReadFile,
  'PUT /f/:binId/:fileId': onWriteFile,
  'DELETE /f/:binId/:fileId': onDeleteFile,

  'GET /meta/:binId/:fileId': onReadMetadata,
  'PUT /meta/:binId/:fileId': onWriteMetadata,
  'GET /zip/:binId': onDownloadZip,
  'POST /zip/:binId': onUploadZip,
});

export function start(options: Options = {}) {
  if (!rootDir) {
    throw new Error('Cannot start without ROOT_DIR in environment.');
  }

  createServer((req, res) => {
    const _end = res.end;

    res.end = (...args) => {
      console.log('[%s] %d %s %s', new Date().toISOString(), res.statusCode, req.method, req.url);
      return _end.apply(res, args);
    };

    match(req, res);
  }).listen(Number(options.port || process.env.PORT));
}

export default start;
