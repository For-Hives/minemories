import { randomUUID } from 'node:crypto';
import { apiContract } from '@minemories/api-contract';
import { implement, ORPCError, onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as z from 'zod';
import { auth } from './auth';
import { database } from './database';
import {
  addMemory,
  createPairingCode,
  exchangePairingCode,
  getDeviceFromToken,
  listMemories,
} from './pairing';
import { removeMemory, storeMemory } from './storage';

const port = Number(process.env.API_PORT ?? 3001);
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const MAX_MEMORY_BYTES = 100 * 1024 * 1024;

interface ApiContext {
  userId: string | null;
}

const os = implement(apiContract).$context<ApiContext>();
const router = os.router({
  pairing: {
    create: os.pairing.create.handler(({ context }) => {
      if (!context.userId) throw new ORPCError('UNAUTHORIZED');
      return createPairingCode(context.userId);
    }),
  },
  memories: {
    list: os.memories.list.handler(({ context }) => {
      if (!context.userId) throw new ORPCError('UNAUTHORIZED');
      return listMemories(context.userId);
    }),
  },
});

const rpcHandler = new RPCHandler(router, {
  interceptors: [onError((error) => console.error('[oRPC]', error))],
});
const app = new Hono();

app.use(
  '*',
  cors({
    origin: webOrigin,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Memory-Name'],
  }),
);

app.get('/healthz', (context) => context.json({ status: 'ok' as const }));
app.all('/api/auth/*', (context) => auth.handler(context.req.raw));

app.use('/rpc/*', async (context, next) => {
  const session = await auth.api.getSession({ headers: context.req.raw.headers });
  const { matched, response } = await rpcHandler.handle(context.req.raw, {
    prefix: '/rpc',
    context: { userId: session?.user.id ?? null },
  });
  if (matched) return context.newResponse(response.body, response);
  return next();
});

const exchangeWindows = new Map<string, { startedAt: number; requests: number }>();
app.use('/api/mod/pair', async (context, next) => {
  const forwardedFor = context.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  const address = context.req.header('cf-connecting-ip') ?? forwardedFor ?? 'local';
  const now = Date.now();
  const window = exchangeWindows.get(address);
  if (!window || now - window.startedAt >= 60_000) {
    exchangeWindows.set(address, { startedAt: now, requests: 1 });
  } else if (window.requests >= 8) {
    return context.json({ error: 'too_many_attempts' }, 429, { 'Retry-After': '60' });
  } else {
    window.requests += 1;
  }

  return next();
});

app.post('/api/mod/pair', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = z
    .object({
      code: z.string().regex(/^\d{6}$/),
      name: z.string().trim().min(1).max(80).optional(),
    })
    .safeParse(body);
  if (!parsed.success) return context.json({ error: 'invalid_pairing_code' }, 400);

  const paired = exchangePairingCode(parsed.data.code, parsed.data.name ?? 'Minecraft client');
  if (!paired) return context.json({ error: 'pairing_code_invalid_or_expired' }, 401);
  return context.json(paired);
});

app.get('/api/mod/status', async (context) => {
  const authorization = context.req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return context.json({ error: 'unauthorized' }, 401);
  const device = getDeviceFromToken(token);
  if (!device) return context.json({ error: 'unauthorized' }, 401);
  return context.json({ paired: true, device: { id: device.id, name: device.name } });
});

app.post('/api/mod/memories', async (context) => {
  const authorization = context.req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const device = token ? getDeviceFromToken(token) : null;
  if (!device) return context.json({ error: 'unauthorized' }, 401);

  const declaredSize = Number(context.req.header('content-length') ?? 0);
  if (declaredSize > MAX_MEMORY_BYTES) return context.json({ error: 'memory_too_large' }, 413);
  const contentType = context.req.header('content-type')?.split(';')[0];
  if (contentType !== 'model/gltf-binary' && contentType !== 'application/octet-stream') {
    return context.json({ error: 'unsupported_media_type' }, 415);
  }

  const contents = Buffer.from(await context.req.arrayBuffer());
  if (contents.byteLength === 0 || contents.byteLength > MAX_MEMORY_BYTES) {
    return context.json(
      { error: 'invalid_memory_size' },
      contents.byteLength > MAX_MEMORY_BYTES ? 413 : 400,
    );
  }

  const id = randomUUID();
  const objectKey = `${device.userId}/${id}.glb`;
  const rawName = context.req.header('x-memory-name') ?? 'Souvenir Minecraft';
  const name =
    rawName
      .replace(/\p{Cc}/gu, '')
      .trim()
      .slice(0, 80) || 'Souvenir Minecraft';

  try {
    await storeMemory(objectKey, contents);
    addMemory({
      id,
      userId: device.userId,
      deviceId: device.id,
      name,
      objectKey,
      size: contents.byteLength,
    });
  } catch (error) {
    await removeMemory(objectKey).catch(() => undefined);
    console.error('[memory-upload] failed to save memory', error);
    return context.json({ error: 'memory_storage_unavailable' }, 503);
  }

  return context.json({ id, name, size: contents.byteLength }, 201);
});

const server = Bun.serve({ port, fetch: app.fetch });
console.info(`Minemories API ready at ${server.url}`);

process.on('SIGINT', () => {
  server.stop();
  database.close();
});
process.on('SIGTERM', () => {
  server.stop();
  database.close();
});
