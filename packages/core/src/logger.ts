import type { Logger } from './interfaces';

// Emitted once per segment (~1/s); hidden unless LOG_VERBOSE=true to avoid flooding logs/SD card.
const VERBOSE_EVENTS = new Set(['BUFFER_SEGMENT_CREATED', 'BUFFER_SEGMENT_DELETED']);

function write(level: 'info' | 'warn' | 'error', event: string, payload?: Record<string, unknown>): void {
  if (VERBOSE_EVENTS.has(event) && process.env.LOG_VERBOSE !== 'true') {
    return;
  }

  const line = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  });

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

export class ConsoleLogger implements Logger {
  info(event: string, payload?: Record<string, unknown>): void {
    write('info', event, payload);
  }

  warn(event: string, payload?: Record<string, unknown>): void {
    write('warn', event, payload);
  }

  error(event: string, payload?: Record<string, unknown>): void {
    write('error', event, payload);
  }
}
