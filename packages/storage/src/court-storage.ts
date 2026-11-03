import type { CourtCloud, ClipStorage, Logger } from '@football-clip-recorder/core';
import { isCourtCloudReady } from '@football-clip-recorder/core';
import { S3Storage } from './s3-storage';

export interface CourtUploadTarget {
  id: string;
  cloud: CourtCloud;
}

export function createCourtClipStorage(
  fallback: ClipStorage,
  courts: () => CourtUploadTarget[],
  maxRetainedBytes: number | undefined,
  logger: Logger,
): ClipStorage {
  const clients = new Map<string, ClipStorage>();

  const clientFor = (target: CourtUploadTarget): ClipStorage | undefined => {
    if (!isCourtCloudReady(target.cloud)) {
      return undefined;
    }
    const cacheKey = [
      target.id,
      target.cloud.endpoint,
      target.cloud.bucket,
      target.cloud.region,
      target.cloud.accessKeyId,
      target.cloud.secretAccessKey,
    ].join('\n');
    const cached = clients.get(cacheKey);
    if (cached) {
      return cached;
    }
    const created = new S3Storage({
      region: target.cloud.region || 'auto',
      bucket: target.cloud.bucket,
      endpoint: target.cloud.endpoint,
      accessKeyId: target.cloud.accessKeyId,
      secretAccessKey: target.cloud.secretAccessKey,
      maxRetainedBytes,
      logger,
    });
    clients.set(cacheKey, created);
    return created;
  };

  const storageForCourt = (courtId: string | undefined): ClipStorage => {
    if (!courtId) {
      return fallback;
    }
    const target = courts().find((court) => court.id === courtId);
    if (!target) {
      return fallback;
    }
    const dedicated = clientFor(target);
    if (!dedicated) {
      logger.info('COURT_CLOUD_FALLBACK', { courtId });
      return fallback;
    }
    return dedicated;
  };

  const storageForUrl = (uploadedUrl: string): ClipStorage => {
    const match = uploadedUrl.match(/^s3:\/\/([^/]+)\//);
    if (!match) {
      return fallback;
    }
    const bucket = match[1];
    const target = courts().find((court) => court.cloud.bucket === bucket && isCourtCloudReady(court.cloud));
    return target ? clientFor(target) ?? fallback : fallback;
  };

  return {
    async upload(filePath, metadata) {
      return storageForCourt(metadata.courtId).upload(filePath, metadata);
    },
    async delete(uploadedUrl) {
      return storageForUrl(uploadedUrl).delete(uploadedUrl);
    },
  };
}
