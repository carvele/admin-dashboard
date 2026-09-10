import {
  DomainError,
  domainOk,
  domainFail,
  sanitizeContext,
  ErrorReportingService,
  ErrorSink,
  TelemetryService,
  TelemetrySink,
} from './index';

describe('Observability Foundation (Admin Dashboard)', () => {
  describe('DomainError', () => {
    it('creates an instance with code, domain, and context', () => {
      const cause = new Error('Underlying DB timeout');
      const err = new DomainError({
        code: 'ERR_TIMEOUT',
        message: 'Query timed out',
        domain: 'analytics',
        retriable: true,
        context: { operation: 'getReservationsRange' },
        cause,
      });

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(DomainError);
      expect(err.name).toBe('DomainError');
      expect(err.code).toBe('ERR_TIMEOUT');
      expect(err.domain).toBe('analytics');
      expect(err.retriable).toBe(true);
      expect(err.context).toEqual({ operation: 'getReservationsRange' });
      expect(err.cause).toBe(cause);
    });

    it('defaults retriable to false', () => {
      const err = new DomainError({
        code: 'ERR_VALIDATION',
        message: 'Invalid payload',
        domain: 'settings',
      });
      expect(err.retriable).toBe(false);
      expect(err.context).toBeUndefined();
    });
  });

  describe('DomainResult helpers', () => {
    it('domainOk constructs a success result', () => {
      const res = domainOk({ id: 'res-123' });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).toEqual({ id: 'res-123' });
      }
    });

    it('domainFail constructs a failure result', () => {
      const err = new DomainError({
        code: 'ERR_FAIL',
        message: 'Failed operation',
        domain: 'inventory',
      });
      const res = domainFail(err);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe(err);
      }
    });
  });

  describe('Sanitization Policy (sanitizeContext)', () => {
    it('redacts sensitive fields and preserves safe fields', () => {
      const rawContext = {
        domain: 'auth',
        operation: 'login',
        userId: 'user-001',
        password: 'my-super-secret-password',
        token: 'eyJhGciOi...',
        access_token: 'secret-token',
        refresh_token: 'refresh-token',
        authorization: 'Bearer 12345',
        cookie: 'session_id=abc',
        secret: 'api-secret-key',
        apiKey: 'key-xyz',
        email: 'user@example.com',
        phone: '+1234567890',
        measurements: { bust: 34, waist: 28 },
        message_content: 'Confidential text',
        status: 'active',
        retriable: false,
        requestId: 'req-456',
      };

      const sanitized = sanitizeContext(rawContext);

      expect(sanitized).toEqual({
        domain: 'auth',
        operation: 'login',
        userId: 'user-001',
        password: '[REDACTED]',
        token: '[REDACTED]',
        access_token: '[REDACTED]',
        refresh_token: '[REDACTED]',
        authorization: '[REDACTED]',
        cookie: '[REDACTED]',
        secret: '[REDACTED]',
        apiKey: '[REDACTED]',
        email: '[REDACTED]',
        phone: '[REDACTED]',
        measurements: '[REDACTED]',
        message_content: '[REDACTED]',
        status: 'active',
        retriable: false,
        requestId: 'req-456',
      });
    });

    it('recursively sanitizes nested objects', () => {
      const nested = {
        operation: 'update_user',
        meta: {
          requestId: 'req-1',
          auth_token: 'token-abc',
        },
      };

      const sanitized = sanitizeContext(nested);
      expect(sanitized).toEqual({
        operation: 'update_user',
        meta: {
          requestId: 'req-1',
          auth_token: '[REDACTED]',
        },
      });
    });

    it('returns undefined for empty or invalid context', () => {
      expect(sanitizeContext(undefined)).toBeUndefined();
      expect(sanitizeContext(null as unknown as Record<string, unknown>)).toBeUndefined();
    });
  });

  describe('ErrorReportingService', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('captures errors and logs via default ConsoleErrorSink', () => {
      const service = new ErrorReportingService();
      const err = new DomainError({
        code: 'ERR_NOT_FOUND',
        message: 'Item not found',
        domain: 'settings',
      });

      service.capture(err, { operation: 'fetchSettings', password: 'plain' });

      expect(consoleSpy).toHaveBeenCalled();
      const loggedJson = JSON.parse(consoleSpy.mock.calls[0][1]);
      expect(loggedJson.code).toBe('ERR_NOT_FOUND');
      expect(loggedJson.domain).toBe('settings');
      expect(loggedJson.context.password).toBe('[REDACTED]');
      expect(loggedJson.context.operation).toBe('fetchSettings');
    });

    it('dispatches to custom registered sinks and isolates sink failures', () => {
      const customSink: ErrorSink = {
        report: jest.fn(),
      };
      const failingSink: ErrorSink = {
        report: jest.fn().mockImplementation(() => {
          throw new Error('Sink network error');
        }),
      };

      const service = new ErrorReportingService();
      service.clearSinks();
      service.addSink(failingSink);
      service.addSink(customSink);

      const err = new Error('Generic error');
      expect(() => {
        service.capture(err, { domain: 'test' });
      }).not.toThrow();

      expect(failingSink.report).toHaveBeenCalled();
      expect(customSink.report).toHaveBeenCalledWith(err, { domain: 'test' });
    });
  });

  describe('TelemetryService', () => {
    let consoleInfoSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleInfoSpy.mockRestore();
    });

    it('records events via default ConsoleTelemetrySink with sanitized payload', () => {
      const service = new TelemetryService();
      service.record('settings_updated', { userId: 'admin-1', token: 'bearer-secret' });

      expect(consoleInfoInfoSpyOrSimilar(consoleInfoSpy)).toBe(true);
      const loggedJson = JSON.parse(consoleInfoSpy.mock.calls[0][1]);
      expect(loggedJson.event).toBe('settings_updated');
      expect(loggedJson.payload.userId).toBe('admin-1');
      expect(loggedJson.payload.token).toBe('[REDACTED]');
    });

    function consoleInfoInfoSpyOrSimilar(spy: jest.SpyInstance) {
      return spy.mock.calls.length > 0;
    }

    it('dispatches to custom registered telemetry sinks and isolates failures', () => {
      const customSink: TelemetrySink = {
        record: jest.fn(),
      };
      const failingSink: TelemetrySink = {
        record: jest.fn().mockImplementation(() => {
          throw new Error('Telemetry sink fail');
        }),
      };

      const service = new TelemetryService();
      service.clearSinks();
      service.addSink(failingSink);
      service.addSink(customSink);

      expect(() => {
        service.record('test_event', { domain: 'analytics' });
      }).not.toThrow();

      expect(failingSink.record).toHaveBeenCalled();
      expect(customSink.record).toHaveBeenCalledWith('test_event', { domain: 'analytics' });
    });
  });
});
