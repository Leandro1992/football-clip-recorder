import fs from 'node:fs';
import path from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { ClipMetadata, ClipStorage, UploadResult } from '@football-clip-recorder/core';

export interface S3StorageOptions {
  region: string;
  bucket: string;
  prefix?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class S3Storage implements ClipStorage {
  private readonly client: S3Client;

  constructor(private readonly options: S3StorageOptions) {
    this.client = new S3Client({
      region: options.region,
      maxAttempts: 10,
      ...(options.accessKeyId && options.secretAccessKey
        ? { credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } }
        : {}),
      ...(options.endpoint ? { endpoint: options.endpoint, forcePathStyle: true } : {}),
    });
  }

  async upload(filePath: string, metadata: ClipMetadata): Promise<UploadResult> {
    const fileStream = fs.createReadStream(filePath);
    const key = this.options.prefix
      ? path.posix.join(this.options.prefix, path.basename(filePath))
      : path.basename(filePath);

    // Multipart: each 5 MB part is retried on its own, so a slow or flaky link does not restart the whole clip.
    await new Upload({
      client: this.client,
      queueSize: 1,
      partSize: 5 * 1024 * 1024,
      params: {
        Bucket: this.options.bucket,
        Key: key,
        Body: fileStream,
        ContentType: 'video/mp4',
        Metadata: {
          clipId: metadata.id,
          cameraId: metadata.cameraId,
          timestamp: metadata.timestamp,
        },
      },
    }).done();

    return {
      provider: 's3',
      url: `s3://${this.options.bucket}/${key}`,
    };
  }
}
