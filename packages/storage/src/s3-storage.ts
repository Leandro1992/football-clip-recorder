import fs from 'node:fs';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ClipMetadata, ClipStorage, UploadResult } from '@football-clip-recorder/core';

export interface S3StorageOptions {
  region: string;
  bucket: string;
  prefix?: string;
}

export class S3Storage implements ClipStorage {
  private readonly client: S3Client;

  constructor(private readonly options: S3StorageOptions) {
    this.client = new S3Client({ region: options.region });
  }

  async upload(filePath: string, metadata: ClipMetadata): Promise<UploadResult> {
    const fileStream = fs.createReadStream(filePath);
    const key = this.options.prefix
      ? path.posix.join(this.options.prefix, path.basename(filePath))
      : path.basename(filePath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: fileStream,
        ContentType: 'video/mp4',
        Metadata: {
          clipId: metadata.id,
          cameraId: metadata.cameraId,
          timestamp: metadata.timestamp,
        },
      }),
    );

    return {
      provider: 's3',
      url: `s3://${this.options.bucket}/${key}`,
    };
  }
}
