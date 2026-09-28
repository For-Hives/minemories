import { Client } from 'minio';

const endpoint = new URL(process.env.MINIO_ENDPOINT ?? 'http://127.0.0.1:9000');
const bucket = process.env.MINIO_BUCKET ?? 'minemories';
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
  await ensureBucket();
  await client.putObject(bucket, objectKey, contents, contents.byteLength, {
    'Content-Type': 'model/gltf-binary',
  });
}

export async function removeMemory(objectKey: string) {
  await client.removeObject(bucket, objectKey);
}
