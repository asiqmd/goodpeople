import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Where file bytes live. Callers encrypt before `put`, so neither the disk nor the bucket
 * ever holds a readable document.
 */
export interface FileStore {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Keys are paths made by the API, like `tenants/<id>/documents/<id>`; never user input. */
const KEY = /^[a-z0-9][a-z0-9/_-]*$/;
function checkKey(key: string) {
  if (!KEY.test(key) || key.includes('..') || key.includes('//')) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

/** Files under a directory: for development and single-server installs. */
export class LocalFileStore implements FileStore {
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(directory);
  }

  private path(key: string) {
    checkKey(key);
    return join(this.root, key);
  }

  async put(key: string, body: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string) {
    return readFile(this.path(key));
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
}

export interface S3Options {
  bucket: string;
  region: string;
  /** For MinIO and other S3-compatible stores; omit for AWS. */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** AWS S3, MinIO or any S3-compatible store. */
export class S3FileStore implements FileStore {
  private readonly client: S3Client;

  constructor(private readonly options: S3Options) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      // Newer default checksums are not supported by every S3-compatible store.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async put(key: string, body: Buffer) {
    checkKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: body,
        // The bytes are ciphertext; the real type is kept in the database.
        ContentType: 'application/octet-stream',
      }),
    );
  }

  async get(key: string) {
    checkKey(key);
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async delete(key: string) {
    checkKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
  }
}
