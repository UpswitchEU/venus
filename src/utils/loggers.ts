/**
 * Logger utilities for development and debugging
 */

export const logger = {
  debug: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG]', ...args)
    }
  },
  info: (...args: any[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[INFO]', ...args)
    }
  },
  warn: (...args: any[]) => {
    console.warn('[WARN]', ...args)
  },
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args)
  },
}

export default logger
