import { DomainError } from './domainError';

export interface ErrorSink {
  report(error: DomainError | Error, context?: Record<string, unknown>): void;
}

const REDACTED_KEYS_REGEX = /(password|token|auth|cookie|secret|api_?key|measurement|content|email|phone|(^|_)name$)/i;

export function sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context || typeof context !== 'object') {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (REDACTED_KEYS_REGEX.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeContext(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export class ConsoleErrorSink implements ErrorSink {
  report(error: DomainError | Error, context?: Record<string, unknown>): void {
    const cleanContext = sanitizeContext(context);
    const payload = {
      timestamp: new Date().toISOString(),
      name: error.name,
      message: error.message,
      code: error instanceof DomainError ? error.code : undefined,
      domain: error instanceof DomainError ? error.domain : undefined,
      retriable: error instanceof DomainError ? error.retriable : undefined,
      context: cleanContext,
      stack: error.stack,
    };
    console.error('[ErrorReporting]', JSON.stringify(payload));
  }
}

export class ErrorReportingService {
  private sinks: ErrorSink[] = [];

  constructor(defaultSink?: ErrorSink) {
    if (defaultSink) {
      this.sinks.push(defaultSink);
    } else {
      this.sinks.push(new ConsoleErrorSink());
    }
  }

  capture(error: DomainError | Error, context?: Record<string, unknown>): void {
    const cleanContext = sanitizeContext(context);
    for (const sink of this.sinks) {
      try {
        sink.report(error, cleanContext);
      } catch (sinkErr) {
        console.error('[ErrorReporting] Sink execution failed:', sinkErr);
      }
    }
  }

  addSink(sink: ErrorSink): void {
    this.sinks.push(sink);
  }

  clearSinks(): void {
    this.sinks = [];
  }
}

export const errorReporting = new ErrorReportingService();
