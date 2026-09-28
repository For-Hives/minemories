import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Client } from 'minio';

const endpoint = new URL(process.env.MINIO_ENDPOINT ?? 'http://127.0.0.1:9000');
const bucket = process.env.MINIO_BUCKET ?? 'minemories';
const filesystemRoot = resolve(process.env.LOCAL_OBJECTS_PATH ?? './data/objects');
const storageDriver = process.env.STORAGE_DRIVER ?? 'minio';
if (storageDriver !== 'minio' && storageDriver !== 'filesystem') {
  throw new Error('STORAGE_DRIVER must be either "minio" or "filesystem".');
}
const client = new Client({
  endPoint: endpoint.hostname,
  port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
  useSSL: endpoint.protocol === 'https:',
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'minemories_dev',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'minemories_local_only',
});

let bucketReady: Promise<void> | undefined;

async function ensureBucket() {
  bucketReady ??= (async () => {
    if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket, 'us-east-1');
  })().catch((error: unknown) => {
    bucketReady = undefined;
    throw error;
  });
  await bucketReady;
}

export async function storeMemory(objectKey: string, contents: Buffer) {
  if (storageDriver === 'filesystem') {
    const path = resolve(filesystemRoot, objectKey);
    if (!path.startsWith(`${filesystemRoot}/`)) throw new Error('Invalid object key.');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, { flag: 'wx' });
    return;
  }

  await ensureBucket();
  await client.putObject(bucket, objectKey, contents, contents.byteLength, {
    'Content-Type': 'model/gltf-binary',
  });
}

export async function removeMemory(objectKey: string) {
  if (storageDriver === 'filesystem') {
    const path = resolve(filesystemRoot, objectKey);
    if (!path.startsWith(`${filesystemRoot}/`)) throw new Error('Invalid object key.');
    await rm(path, { force: true });
    return;
  }

  await client.removeObject(bucket, objectKey);
}

export async function readMemory(objectKey: string) {
  if (storageDriver === 'filesystem') {
    const path = resolve(filesystemRoot, objectKey);
    if (!path.startsWith(`${filesystemRoot}/`)) throw new Error('Invalid object key.');
    return readFile(path);
  }

  const stream = await client.getObject(bucket, objectKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
