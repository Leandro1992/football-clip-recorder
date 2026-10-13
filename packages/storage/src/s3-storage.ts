import fs from 'node:fs';
import path from 'node:path';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { ClipMetadata, ClipStorage, Logger, UploadResult } from '@football-clip-recorder/core';

export interface S3StorageOptions {
  region: string;
  bucket: string;
  prefix?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  maxRetainedBytes?: number;
  logger?: Logger;
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

    if (this.options.maxRetainedBytes) {
      await this.enforceRemoteBudget(this.options.maxRetainedBytes);
    }

    return {
      provider: 's3',
      url: `s3://${this.options.bucket}/${key}`,
    };
  }

  async delete(uploadedUrl: string): Promise<void> {
    const key = this.parseKeyFromUrl(uploadedUrl);
    if (!key) {
      return;
    }

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
      }),
    );
  }

  private parseKeyFromUrl(uploadedUrl: string): string | undefined {
    const expectedPrefix = `s3://${this.options.bucket}/`;
    if (!uploadedUrl.startsWith(expectedPrefix)) {
      return undefined;
    }
    return uploadedUrl.slice(expectedPrefix.length);
  }

  private async enforceRemoteBudget(maxBytes: number): Promise<void> {
    const objects: { key: string; size: number; modifiedAt: number }[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.options.bucket,
          Prefix: this.options.prefix ? `${this.options.prefix.replace(/\/+$/, '')}/` : undefined,
          ContinuationToken: continuationToken,
        }),
      );

      for (const object of response.Contents ?? []) {
        if (!object.Key || object.Size === undefined) {
          continue;
        }
        objects.push({
          key: object.Key,
          size: object.Size,
          modifiedAt: object.LastModified?.getTime() ?? 0,
        });
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    let totalBytes = objects.reduce((sum, object) => sum + object.size, 0);
    if (totalBytes <= maxBytes) {
      return;
    }

    const oldestFirst = [...objects].sort((left, right) => left.modifiedAt - right.modifiedAt);
    let remainingCount = oldestFirst.length;
    for (const object of oldestFirst) {
      if (totalBytes <= maxBytes || remainingCount <= 1) {
        break;
      }
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.options.bucket,
          Key: object.key,
        }),
      );
      remainingCount -= 1;
      totalBytes -= object.size;
      this.options.logger?.info('CLOUD_CLIP_EVICTED', {
        key: object.key,
        sizeBytes: object.size,
      });
    }
  }
}
