import { mkdtemp, readdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFileStore, S3FileStore, type FileStore } from './file-store.js';

/** Just enough of S3's path-style API to check what the driver sends. */
function fakeS3() {
  const objects = new Map<string, Buffer>();
  const requests: string[] = [];
  const server: Server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    const key = decodeURIComponent((req.url ?? '').split('?')[0]!);
    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        objects.set(key, Buffer.concat(chunks));
        res.writeHead(200, { etag: '"x"' }).end();
      });
    } else if (req.method === 'GET') {
      const body = objects.get(key);
      if (!body) res.writeHead(404).end('<Error><Code>NoSuchKey</Code></Error>');
      else res.writeHead(200, { 'content-length': body.length }).end(body);
    } else if (req.method === 'DELETE') {
      objects.delete(key);
      res.writeHead(204).end();
    } else res.writeHead(405).end();
  });
  return { server, objects, requests };
}

async function roundTrip(store: FileStore) {
  const body = Buffer.from([0, 1, 2, 250, 251, 252]);
  await store.put('tenants/t1/documents/d1', body);
  expect(Buffer.compare(await store.get('tenants/t1/documents/d1'), body)).toBe(0);
  await store.delete('tenants/t1/documents/d1');
  await expect(store.get('tenants/t1/documents/d1')).rejects.toThrow();
}

describe('file stores', () => {
  it('keeps files in a local directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gp-store-'));
    await roundTrip(new LocalFileStore(dir));
    expect(await readdir(join(dir, 'tenants/t1/documents'))).toEqual([]);
  });

  it('refuses keys that could leave the store', async () => {
    const store = new LocalFileStore(tmpdir());
    await expect(store.put('../etc/passwd', Buffer.from('x'))).rejects.toThrow(
      /Invalid storage key/,
    );
    await expect(store.get('/absolute')).rejects.toThrow(/Invalid storage key/);
  });

  it('talks path-style S3 to MinIO and other compatible stores', async () => {
    const s3 = fakeS3();
    await new Promise<void>((resolve) => s3.server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = s3.server.address() as AddressInfo;
      await roundTrip(
        new S3FileStore({
          bucket: 'documents',
          region: 'ap-south-1',
          endpoint: `http://127.0.0.1:${port}`,
          accessKeyId: 'minio',
          secretAccessKey: 'minio-secret',
          forcePathStyle: true,
        }),
      );
      expect(s3.requests.map((r) => r.split('?')[0])).toEqual([
        'PUT /documents/tenants/t1/documents/d1',
        'GET /documents/tenants/t1/documents/d1',
        'DELETE /documents/tenants/t1/documents/d1',
        'GET /documents/tenants/t1/documents/d1',
      ]);
    } finally {
      s3.server.close();
    }
  });
});
