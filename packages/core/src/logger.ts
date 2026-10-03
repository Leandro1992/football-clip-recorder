import type { Logger } from './interfaces';

function write(level: 'info' | 'warn' | 'error', event: string, payload?: Record<string, unknown>): void {
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
