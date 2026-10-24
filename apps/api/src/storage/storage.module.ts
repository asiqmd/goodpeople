import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { LocalFileStore, S3FileStore, type FileStore } from './file-store.js';

export const FILE_STORE = Symbol('FILE_STORE');

export function createFileStore(config: AppConfig): FileStore {
  if (config.STORAGE_DRIVER === 's3') {
    return new S3FileStore({
      bucket: config.S3_BUCKET!,
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      accessKeyId: config.S3_ACCESS_KEY_ID!,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
    });
  }
  return new LocalFileStore(config.STORAGE_DIR);
}

@Global()
@Module({
  providers: [{ provide: FILE_STORE, inject: [APP_CONFIG], useFactory: createFileStore }],
  exports: [FILE_STORE],
})
export class StorageModule {}
