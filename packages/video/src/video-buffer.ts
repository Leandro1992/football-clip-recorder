import fs from 'node:fs/promises';
import type { BufferedVideoSegment, Logger, VideoBufferPort } from '@football-clip-recorder/core';

interface PendingWaiter {
  resolve: () => void;
  targetTimeMs: number;
}

export interface VideoBufferOptions {
  bufferDurationSeconds: number;
  logger: Logger;
}

export class VideoBuffer implements VideoBufferPort {
  private readonly segments: BufferedVideoSegment[] = [];
  private readonly waiters: PendingWaiter[] = [];

  constructor(private readonly options: VideoBufferOptions) {}

  async addSegment(segment: BufferedVideoSegment): Promise<void> {
    this.segments.push(segment);
    this.segments.sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());

    this.options.logger.info('BUFFER_SEGMENT_CREATED', {
      segmentId: segment.id,
      filePath: segment.filePath,
      startedAt: segment.startedAt.toISOString(),
      endedAt: segment.endedAt.toISOString(),
    });

    await this.prune();
    this.resolveWaiters();
  }

  getSegmentsForInterval(start: Date, end: Date): BufferedVideoSegment[] {
    const startMs = start.getTime();
    const endMs = end.getTime();

    return this.segments
      .filter(
        (segment) =>
          segment.endedAt.getTime() > startMs && segment.startedAt.getTime() < endMs,
      )
      .map((segment) => ({ ...segment }));
  }

  getAvailableDurationSeconds(): number {
    if (this.segments.length === 0) {
      return 0;
    }

    const first = this.segments[0];
    const last = this.segments[this.segments.length - 1];
    return Math.max(0, (last.endedAt.getTime() - first.startedAt.getTime()) / 1000);
  }

  async waitForTime(targetTime: Date): Promise<void> {
    const targetTimeMs = targetTime.getTime();
    const newestSegment = this.segments[this.segments.length - 1];
    if (newestSegment && newestSegment.endedAt.getTime() >= targetTimeMs) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.waiters.push({ resolve, targetTimeMs });
    });
  }

  async clear(): Promise<void> {
    const files = this.segments.map((segment) => segment.filePath);
    this.segments.length = 0;
    this.waiters.splice(0, this.waiters.length).forEach((waiter) => waiter.resolve());

    await Promise.all(
      files.map(async (filePath) => {
        await fs.rm(filePath, { force: true });
      }),
    );
  }

  private async prune(): Promise<void> {
    const newestSegment = this.segments[this.segments.length - 1];
    if (!newestSegment) {
      return;
    }

    const cutoffTimeMs =
      newestSegment.endedAt.getTime() - this.options.bufferDurationSeconds * 1000;

    while (this.segments.length > 0 && this.segments[0].endedAt.getTime() <= cutoffTimeMs) {
      const removedSegment = this.segments.shift();
      if (!removedSegment) {
        continue;
      }

      await fs.rm(removedSegment.filePath, { force: true });
      this.options.logger.info('BUFFER_SEGMENT_DELETED', {
        segmentId: removedSegment.id,
        filePath: removedSegment.filePath,
      });
    }
  }

  private resolveWaiters(): void {
    const newestSegment = this.segments[this.segments.length - 1];
    if (!newestSegment) {
      return;
    }

    const newestTimeMs = newestSegment.endedAt.getTime();
    const readyWaiters = this.waiters.filter((waiter) => waiter.targetTimeMs <= newestTimeMs);
    const pendingWaiters = this.waiters.filter((waiter) => waiter.targetTimeMs > newestTimeMs);

    this.waiters.splice(0, this.waiters.length, ...pendingWaiters);
    readyWaiters.forEach((waiter) => waiter.resolve());
  }
}
