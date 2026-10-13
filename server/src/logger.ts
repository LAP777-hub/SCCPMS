import { config } from './config.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[36m', // Cyan
  [LogLevel.INFO]: '\x1b[32m',  // Green
  [LogLevel.WARN]: '\x1b[33m',  // Yellow
  [LogLevel.ERROR]: '\x1b[31m', // Red
};

const RESET_COLOR = '\x1b[0m';

class Logger {
  private minLevel: LogLevel;
  private isProduction: boolean;

  constructor() {
    this.minLevel = config.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
    this.isProduction = config.NODE_ENV === 'production';
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level];
    const color = this.isProduction ? '' : LOG_LEVEL_COLORS[level];
    const reset = this.isProduction ? '' : RESET_COLOR;

    let formatted = `${timestamp} [${color}${levelName}${reset}] ${message}`;

    if (meta && Object.keys(meta).length > 0) {
      formatted += ` ${JSON.stringify(meta)}`;
    }

    return formatted;
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (level < this.minLevel) return;

    const formatted = this.formatMessage(level, message, meta);

    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, meta);
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorMeta = {
      ...meta,
      ...(error instanceof Error ? {
        error: error.message,
        stack: error.stack,
      } : { error }),
    };
    this.log(LogLevel.ERROR, message, errorMeta);
  }

  // Request logging helper
  logRequest(method: string, path: string, statusCode: number, duration: number, requestId?: string): void {
    const level = statusCode >= 500 ? LogLevel.ERROR : statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
    this.log(level, `${method} ${path} - ${statusCode} (${duration}ms)`, requestId ? { requestId } : undefined);
  }

  // Database operation logging
  logQuery(query: string, duration: number, error?: Error): void {
    if (error) {
      this.error('Database query failed', error, { query });
    } else {
      this.debug('Database query executed', { query, duration: `${duration}ms` });
    }
  }

  // Authentication logging
  logAuth(action: string, userId: string | undefined, success: boolean): void {
    const level = success ? LogLevel.INFO : LogLevel.WARN;
    this.log(level, `Auth: ${action}`, { userId, success });
  }

  // Audit logging
  logAudit(userId: string, action: string, entityType: string, entityId: string): void {
    this.info(`Audit: ${action}`, { userId, entityType, entityId });
  }
}

export const logger = new Logger();
