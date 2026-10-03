import type { AppConfig } from '@football-clip-recorder/config';
import type { ClipStorage, Logger } from '@football-clip-recorder/core';
import { MockStorage } from './mock-storage';
import { S3Storage } from './s3-storage';

export function createClipStorage(config: AppConfig, logger: Logger): ClipStorage {
  if (config.storage.provider === 's3') {
    if (!config.storage.awsRegion || !config.storage.awsS3Bucket) {
      throw new Error('AWS_REGION and AWS_S3_BUCKET are required when STORAGE_PROVIDER=s3');
    }

    return new S3Storage({
      region: config.storage.awsRegion,
      bucket: config.storage.awsS3Bucket,
    });
  }

  return new MockStorage({
    rootDirectory: config.paths.mockS3Root,
    logger,
  });
}
