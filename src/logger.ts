import { LogLevel } from './types';

/**
 * Logger instance for the extension
 */
class Logger {
  private level: LogLevel = 'none';

  private readonly levels: Record<LogLevel, number> = {
    none: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
  };

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Check if a log level is enabled
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] <= this.levels[this.level];
  }

  /**
   * Log an error message
   */
  error(...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error('[prisma-emitter:error]', ...args);
    }
  }

  /**
   * Log a warning message
   */
  warn(...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn('[prisma-emitter:warn]', ...args);
    }
  }

  /**
   * Log an info message
   */
  info(...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log('[prisma-emitter:info]', ...args);
    }
  }

  /**
   * Log a debug message
   */
  debug(...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log('[prisma-emitter:debug]', ...args);
    }
  }
}

// Export singleton instance
export const logger = new Logger();
