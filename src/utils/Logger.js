/**
 * Simple Logger utility to standardize application logging.
 * Can be extended to send logs to a remote service or
 * toggle certain log levels based on environment.
 */

const isProd = process.env.NODE_ENV === 'production';

export const Logger = {
  info: (message, ...data) => {
    if (!isProd) {
      console.log(`[INFO] ${message}`, ...data);
    }
  },

  warn: (message, ...data) => {
    console.warn(`[WARN] ${message}`, ...data);
  },

  error: (message, error) => {
    console.error(`[ERROR] ${message}`, error);
    // In a real app, you might send this to Sentry or similar here
  },

  debug: (message, ...data) => {
    if (!isProd) {
      console.debug(`[DEBUG] ${message}`, ...data);
    }
  },
};
