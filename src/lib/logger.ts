import { invoke } from '@tauri-apps/api/core';
import type { LogLevel } from '../types';

/**
 * Forward a log entry to the Rust tracing logger.
 * All arguments must be strings/numbers only — never pass note content.
 */
export async function forwardLog(
  level: LogLevel,
  message: string,
  fields?: Record<string, string | number>,
): Promise<void> {
  try {
    await invoke('log_frontend_event', { level, message, fields: fields ?? {} });
  } catch {
    // If the IPC call fails, fall back to console only — never throw from a logger
    console.error('[ScaleNote] Failed to forward log to backend', { level, message });
  }
}

export const logger = {
  error: (msg: string, fields?: Record<string, string | number>) =>
    forwardLog('error', msg, fields),
  warn: (msg: string, fields?: Record<string, string | number>) =>
    forwardLog('warn', msg, fields),
  info: (msg: string, fields?: Record<string, string | number>) =>
    forwardLog('info', msg, fields),
  debug: (msg: string, fields?: Record<string, string | number>) =>
    forwardLog('debug', msg, fields),
};
