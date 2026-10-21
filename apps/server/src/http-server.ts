import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { readPreviewFrame, type CameraDeviceInfo, type LivePreviewCard } from '@football-clip-recorder/camera';
import type { ApplicationSnapshot, ApplicationStatus, ClipMetadata, Logger } from '@football-clip-recorder/core';
import type { EquipmentButton, EquipmentCamera, EquipmentConfig, EquipmentStore } from './equipment-store';

export interface ManagedRecorder {
  getSnapshot(): ApplicationSnapshot;
  onStatusChange(callback: (status: ApplicationStatus) => void): void;
  onClipsChange(callback: (clips: ClipMetadata[]) => void): void;
  deleteClip(clipId: string, options: { deleteLocal: boolean; deleteCloud: boolean }): Promise<void>;
  retryUpload(clipId: string): void;
}

export interface HttpServerOptions {
  application: ManagedRecorder;
  pressTrigger: () => void;
  previewImagePath: string;
  clipsRoot: string;
  webRoot: string;
  auth: {
    username: string;
    password: string;
    sessionTtlHours: number;
  };
  storage: {
    maxLocalBytes: number;
    maxCloudBytes: number;
  };
  preview: {
    width: number;
    intervalSeconds: number;
  };
  equipmentStore: EquipmentStore;
  detectCameras: () => Promise<CameraDeviceInfo[]>;
  onEquipmentConfigChanged?: (config: EquipmentConfig) => void;
  getLiveView: () => Promise<{ cards: LivePreviewCard[] }>;
  logger: Logger;
}

interface AuthSession {
  token: string;
  username: string;
  expiresAt: number;
}

type RecordingDeleteScope = 'local' | 'cloud' | 'both';

const SESSION_COOKIE = 'fcr_session';
const JSON_BODY_MAX_BYTES = 1 * 1024 * 1024;

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

function parseCookies(rawCookie: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!rawCookie) {
    return map;
  }
  for (const piece of rawCookie.split(';')) {
    const [rawName, ...rawValue] = piece.trim().split('=');
    if (!rawName) {
      continue;
    }
    map.set(rawName, decodeURIComponent(rawValue.join('=')));
  }
  return map;
}

async function readJsonBody<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;

  await new Promise<void>((resolve, reject) => {
    request.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > JSON_BODY_MAX_BYTES) {
        reject(new Error('Payload too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve());
    request.on('error', (error) => reject(error));
  });

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function parseDeleteScope(rawScope: unknown): RecordingDeleteScope {
  if (rawScope === 'local' || rawScope === 'cloud' || rawScope === 'both') {
    return rawScope;
  }
  throw new Error('Escopo inválido. Use local, cloud ou both.');
}

function sanitizeEquipmentConfig(input: unknown): EquipmentConfig {
  if (!input || typeof input !== 'object') {
    throw new Error('Configuração inválida.');
  }
  const candidate = input as Partial<EquipmentConfig>;
  const cameras: EquipmentCamera[] = Array.isArray(candidate.cameras)
    ? candidate.cameras
        .filter((camera) => camera && typeof camera.id === 'string')
        .map((camera) => ({
          ...camera,
          isActive: camera.isActive !== false,
        }))
    : [];
  const buttons: EquipmentButton[] = Array.isArray(candidate.buttons)
    ? candidate.buttons
        .filter((button) => button && typeof button.id === 'string')
        .map((button) => ({
          ...button,
          isActive: button.isActive !== false,
        }))
    : [];
  const bindings = Array.isArray(candidate.bindings)
    ? candidate.bindings.filter((binding) => binding && typeof binding.buttonId === 'string')
    : [];

  return { cameras, buttons, bindings };
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

function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 10_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export function createHttpServer(options: HttpServerOptions): http.Server {
  const { application, logger } = options;
  const eventClients = new Set<http.ServerResponse>();
  const sessions = new Map<string, AuthSession>();

  function createSessionCookie(username: string): string {
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + options.auth.sessionTtlHours * 60 * 60 * 1000;
    sessions.set(token, { token, username, expiresAt });
    return token;
  }

  function resolveSession(request: http.IncomingMessage): AuthSession | undefined {
    const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
    if (!token) {
      return undefined;
    }
    const session = sessions.get(token);
    if (!session) {
      return undefined;
    }
    if (session.expiresAt < Date.now()) {
      sessions.delete(token);
      return undefined;
    }
    return session;
  }

  function clearSession(request: http.IncomingMessage): void {
    const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
    if (token) {
      sessions.delete(token);
    }
  }

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
            storageStatus: clip?.storageStatus ?? 'pending',
            uploadedUrl: clip?.uploadedUrl,
          };
        }),
    );

    return files.sort((left, right) => right.modifiedAt - left.modifiedAt);
  }

  async function getPreviewFrame(): Promise<{ imageDataUrl?: string; updatedAt?: number }> {
    return readPreviewFrame(options.previewImagePath);
  }

  async function handleApi(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    pathname: string,
  ): Promise<void> {
    const method = request.method ?? 'GET';
    const session = resolveSession(request);

    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJsonBody<{ username?: string; password?: string }>(request);
      if (body.username !== options.auth.username || body.password !== options.auth.password) {
        sendError(response, 401, 'Usuário ou senha inválidos.');
        return;
      }

      const token = createSessionCookie(body.username);
      response.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`,
      );
      sendJson(response, 200, { authenticated: true, username: body.username });
      return;
    }

    if (method === 'GET' && pathname === '/api/auth/session') {
      sendJson(response, 200, {
        authenticated: Boolean(session),
        username: session?.username,
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      clearSession(request);
      response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (!session) {
      sendError(response, 401, 'Faça login para acessar esta API.');
      return;
    }

    if (method === 'GET' && pathname === '/api/config') {
      sendJson(response, 200, {
        storage: {
          maxLocalBytes: options.storage.maxLocalBytes,
          maxCloudBytes: options.storage.maxCloudBytes,
        },
        preview: options.preview,
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/snapshot') {
      sendJson(response, 200, application.getSnapshot());
      return;
    }

    if (method === 'GET' && pathname === '/api/preview-frame') {
      sendJson(response, 200, await getPreviewFrame());
      return;
    }

    if (method === 'GET' && pathname === '/api/live-view') {
      sendJson(response, 200, await options.getLiveView());
      return;
    }

    if (method === 'GET' && pathname === '/api/recordings') {
      sendJson(response, 200, await listRecordings());
      return;
    }

    if (method === 'DELETE' && pathname === '/api/recordings') {
      const body = await readJsonBody<{ ids?: string[]; scope?: RecordingDeleteScope }>(request);
      const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === 'string' && id) : [];
      if (ids.length === 0) {
        sendError(response, 400, 'Informe ao menos um id de gravação.');
        return;
      }
      const scope = parseDeleteScope(body.scope ?? 'local');
      const deleteLocal = scope === 'local' || scope === 'both';
      const deleteCloud = scope === 'cloud' || scope === 'both';
      const deletedIds: string[] = [];
      const errors: Array<{ id: string; error: string }> = [];

      for (const id of ids) {
        try {
          await application.deleteClip(id, { deleteLocal, deleteCloud });
          deletedIds.push(id);
        } catch (error) {
          errors.push({
            id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      sendJson(response, errors.length === 0 ? 200 : 207, { deletedIds, errors });
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

    if (method === 'GET' && pathname === '/api/equipment') {
      sendJson(response, 200, await options.equipmentStore.load());
      return;
    }

    if (method === 'PUT' && pathname === '/api/equipment') {
      const body = await readJsonBody<EquipmentConfig>(request);
      const nextConfig = sanitizeEquipmentConfig(body);
      await options.equipmentStore.save(nextConfig);
      options.onEquipmentConfigChanged?.(nextConfig);
      sendJson(response, 200, { ok: true, config: nextConfig });
      return;
    }

    if (method === 'GET' && pathname === '/api/equipment/discovery') {
      const cameras = await options.detectCameras();
      sendJson(response, 200, { cameras });
      return;
    }

    if (method === 'POST' && pathname === '/api/equipment/validate-gpio') {
      const body = await readJsonBody<{ pin?: number; chip?: string }>(request);
      if (typeof body.pin !== 'number') {
        sendError(response, 400, 'Pin inválido.');
        return;
      }

      if (process.platform !== 'linux') {
        sendJson(response, 200, {
          ok: false,
          message: 'Validação de GPIO disponível apenas no Linux.',
        });
        return;
      }

      try {
        const { stdout } = await runCommand('pinctrl', ['get', String(body.pin)]);
        sendJson(response, 200, {
          ok: true,
          message: stdout.trim(),
        });
      } catch (error) {
        sendJson(response, 200, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
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
    clearInterval(sessionCleanupTimer);
    for (const client of eventClients) {
      client.end();
    }
    eventClients.clear();
  });

  const heartbeat = setInterval(() => {
    for (const client of eventClients) {
      client.write(': ping\n\n');
    }
  }, 15_000);

  const sessionCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expiresAt < now) {
        sessions.delete(token);
      }
    }
  }, 60_000);
  sessionCleanupTimer.unref();

  return server;
}
