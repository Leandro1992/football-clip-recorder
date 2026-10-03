import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import type { ApplicationStatus, ClipMetadata, ClipRecorderApplication, Logger } from '@football-clip-recorder/core';

export interface HttpServerOptions {
  application: ClipRecorderApplication;
  pressTrigger: () => void;
  previewImagePath: string;
  clipsRoot: string;
  webRoot: string;
  logger: Logger;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.mp4': 'video/mp4',
};

function sendJson(response: http.ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

function sendError(response: http.ServerResponse, statusCode: number, message: string): void {
  sendJson(response, statusCode, { error: message });
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function serveFile(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  filePath: string,
  options: { cache?: string; download?: boolean } = {},
): Promise<void> {
  let stats: fs.Stats;
  try {
    stats = await fsPromises.stat(filePath);
    if (!stats.isFile()) {
      throw new Error('not a file');
    }
  } catch {
    sendError(response, 404, 'Not found');
    return;
  }

  const headers: http.OutgoingHttpHeaders = {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': options.cache ?? 'no-cache',
  };
  if (options.download) {
    headers['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
  }

  // Range requests are required for seeking in <video> elements.
  const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stats.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stats.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stats.size - 1);

    if (start > end || start >= stats.size) {
      response.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
      response.end();
      return;
    }

    response.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${stats.size}`,
      'Content-Length': end - start + 1,
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    fs.createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, { ...headers, 'Content-Length': stats.size });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  fs.createReadStream(filePath).pipe(response);
}

export function createHttpServer(options: HttpServerOptions): http.Server {
  const { application, logger } = options;
  const eventClients = new Set<http.ServerResponse>();

  function broadcast(event: 'status' | 'clips', payload: ApplicationStatus | ClipMetadata[]): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of eventClients) {
      client.write(message);
    }
  }

  application.onStatusChange((status) => broadcast('status', status));
  application.onClipsChange((clips) => broadcast('clips', clips));

  async function listRecordings(): Promise<unknown[]> {
    const entries = await fsPromises.readdir(options.clipsRoot, { withFileTypes: true });
    const clips = application.getSnapshot().clips;

    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp4'))
        .map(async (entry) => {
          const stats = await fsPromises.stat(path.join(options.clipsRoot, entry.name));
          const clip = clips.find((item) => path.basename(item.filePath) === entry.name);

          return {
            id: clip?.id ?? entry.name,
            name: entry.name,
            path: `/api/recordings/${encodeURIComponent(entry.name)}`,
            sizeBytes: stats.size,
            modifiedAt: stats.mtimeMs,
            isUploaded: clip?.storageStatus === 'uploaded',
          };
        }),
    );

    return files.sort((left, right) => right.modifiedAt - left.modifiedAt);
  }

  async function getPreviewFrame(): Promise<{ imageDataUrl?: string; updatedAt?: number }> {
    try {
      const [file, stats] = await Promise.all([
        fsPromises.readFile(options.previewImagePath),
        fsPromises.stat(options.previewImagePath),
      ]);
      return {
        imageDataUrl: `data:image/jpeg;base64,${file.toString('base64')}`,
        updatedAt: stats.mtimeMs,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  async function handleApi(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    pathname: string,
  ): Promise<void> {
    const method = request.method ?? 'GET';

    if (method === 'GET' && pathname === '/api/snapshot') {
      sendJson(response, 200, application.getSnapshot());
      return;
    }

    if (method === 'GET' && pathname === '/api/preview-frame') {
      sendJson(response, 200, await getPreviewFrame());
      return;
    }

    if (method === 'GET' && pathname === '/api/recordings') {
      sendJson(response, 200, await listRecordings());
      return;
    }

    if ((method === 'GET' || method === 'HEAD') && pathname.startsWith('/api/recordings/')) {
      const name = decodeURIComponent(pathname.slice('/api/recordings/'.length));
      const filePath = path.join(options.clipsRoot, name);
      if (
        name !== path.basename(name) ||
        !name.toLowerCase().endsWith('.mp4') ||
        !isInside(options.clipsRoot, filePath)
      ) {
        sendError(response, 400, 'Invalid recording name');
        return;
      }

      const download = new URL(request.url ?? '', 'http://localhost').searchParams.has('download');
      await serveFile(request, response, filePath, { download });
      return;
    }

    if (method === 'POST' && pathname === '/api/trigger') {
      options.pressTrigger();
      sendJson(response, 202, { ok: true });
      return;
    }

    const retryMatch = pathname.match(/^\/api\/clips\/([^/]+)\/retry$/);
    if (method === 'POST' && retryMatch) {
      application.retryUpload(decodeURIComponent(retryMatch[1]));
      sendJson(response, 202, { ok: true });
      return;
    }

    if (method === 'GET' && pathname === '/api/events') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const snapshot = application.getSnapshot();
      response.write(`event: status\ndata: ${JSON.stringify(snapshot.status)}\n\n`);
      response.write(`event: clips\ndata: ${JSON.stringify(snapshot.clips)}\n\n`);
      eventClients.add(response);
      request.on('close', () => eventClients.delete(response));
      return;
    }

    sendError(response, 404, 'Not found');
  }

  async function handleStatic(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    pathname: string,
  ): Promise<void> {
    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const candidate = path.join(options.webRoot, relative);

    if (isInside(options.webRoot, candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const immutable = relative.startsWith('/assets/');
      await serveFile(request, response, candidate, {
        cache: immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      return;
    }

    const indexPath = path.join(options.webRoot, 'index.html');
    if (!fs.existsSync(indexPath)) {
      sendError(
        response,
        503,
        'Web UI not built. Run "npm run build" (or set WEB_ROOT to the built renderer directory).',
      );
      return;
    }

    await serveFile(request, response, indexPath);
  }

  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

    const handler = pathname.startsWith('/api/')
      ? handleApi(request, response, pathname)
      : request.method === 'GET' || request.method === 'HEAD'
        ? handleStatic(request, response, pathname)
        : Promise.resolve(sendError(response, 405, 'Method not allowed'));

    handler.catch((error: unknown) => {
      logger.error('HTTP_REQUEST_FAILED', {
        url: request.url,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!response.headersSent) {
        sendError(response, 500, 'Internal server error');
      } else {
        response.end();
      }
    });
  });

  server.on('close', () => {
    clearInterval(heartbeat);
    for (const client of eventClients) {
      client.end();
    }
    eventClients.clear();
  });

  // SSE connections stay open; keep them alive through Wi-Fi/proxy idle timeouts.
  const heartbeat = setInterval(() => {
    for (const client of eventClients) {
      client.write(': ping\n\n');
    }
  }, 15_000);

  return server;
}
