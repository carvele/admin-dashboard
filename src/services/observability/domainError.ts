export interface DomainErrorParams {
  code: string;
  message: string;
  domain: string;
  retriable?: boolean;
  context?: Record<string, unknown>;
  cause?: unknown;
}

export class DomainError extends Error {
  readonly code: string;
  readonly domain: string;
  readonly retriable: boolean;
  readonly context?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(params: DomainErrorParams) {
    super(params.message);
    this.name = 'DomainError';
    this.code = params.code;
    this.domain = params.domain;
    this.retriable = params.retriable ?? false;
    this.context = params.context;
    if (params.cause !== undefined) {
      this.cause = params.cause;
    }
    Object.setPrototypeOf(this, DomainError.prototype);
  }
}

export type DomainResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DomainError };

export const domainOk = <T>(data: T): DomainResult<T> => ({ ok: true, data });
export const domainFail = <T = never>(error: DomainError): DomainResult<T> => ({ ok: false, error });
