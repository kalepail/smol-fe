/**
 * Simple logger utility that wraps console methods with context prefixes.
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.error('trade', 'Swap failed', error);
 *   logger.warn('storage', 'Failed to read key', key);
 *   logger.info('balance', 'Refreshing all balances...');
 */

type LogContext =
  | 'auth'
  | 'account'
  | 'audio'
  | 'balance'
  | 'leaderboard'
  | 'likes'
  | 'mint'
  | 'mixtape'
  | 'purchase'
  | 'smol'
  | 'storage'
  | 'trade';

function formatPrefix(context: LogContext): string {
  return `[${context}]`;
}

export const logger = {
  info(context: LogContext, ...args: unknown[]): void {
    console.log(formatPrefix(context), ...args);
  },

  warn(context: LogContext, ...args: unknown[]): void {
    console.warn(formatPrefix(context), ...args);
  },

  error(context: LogContext, ...args: unknown[]): void {
    console.error(formatPrefix(context), ...args);
  },
};
