type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const threshold: Level = import.meta.env.DEV ? 'debug' : 'info'

function log(level: Level, message: string, ...args: unknown[]) {
  if (LEVELS[level] < LEVELS[threshold]) return
  const method = level === 'debug' ? 'log' : level
  console[method](`[${new Date().toISOString()}] ${message}`, ...args)
}

export const logger = {
  debug: (message: string, ...args: unknown[]) =>
    log('debug', message, ...args),
  info: (message: string, ...args: unknown[]) => log('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
  error: (message: string, ...args: unknown[]) =>
    log('error', message, ...args),
}
