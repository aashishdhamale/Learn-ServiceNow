/** Every failure talking to a ServiceNow instance surfaces as one of these. */
export type SnowErrorCode =
  | 'INVALID_INSTANCE'
  | 'INSTANCE_NOT_FOUND'
  | 'HIBERNATING'
  | 'UNREACHABLE'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'INVALID_RESPONSE'
  | 'OAUTH_ERROR';

export interface SnowErrorOptions {
  status?: number;
  detail?: string;
  retriable?: boolean;
  cause?: unknown;
}

export class SnowError extends Error {
  readonly code: SnowErrorCode;
  readonly status?: number;
  /** Server-provided detail (ServiceNow's error.detail), if any. */
  readonly detail?: string;
  /** Whether repeating the same request might succeed. */
  readonly retriable: boolean;

  constructor(code: SnowErrorCode, message: string, options: SnowErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = options.status;
    this.detail = options.detail;
    this.retriable = options.retriable ?? false;
  }
}

export class SnowInvalidInstanceError extends SnowError {
  constructor(instance: string) {
    super('INVALID_INSTANCE', `"${instance}" is not a valid instance name.`);
  }
}

export class SnowInstanceNotFoundError extends SnowError {
  constructor(host: string, cause?: unknown) {
    super('INSTANCE_NOT_FOUND', `No ServiceNow instance answers at ${host}.`, { cause });
  }
}

export class SnowHibernatingError extends SnowError {
  constructor(options: SnowErrorOptions = {}) {
    super('HIBERNATING', 'The instance is hibernating.', options);
  }
}

export class SnowUnreachableError extends SnowError {
  constructor(message: string, cause?: unknown) {
    super('UNREACHABLE', message, { cause, retriable: true });
  }
}

export class SnowTimeoutError extends SnowError {
  constructor(timeoutMs: number) {
    super('TIMEOUT', `The instance did not respond within ${timeoutMs} ms.`, { retriable: true });
  }
}

export class SnowAuthError extends SnowError {
  constructor(message = 'Authentication with the instance failed or expired.', options: SnowErrorOptions = {}) {
    super('UNAUTHORIZED', message, { status: 401, ...options });
  }
}

export class SnowForbiddenError extends SnowError {
  constructor(message: string, options: SnowErrorOptions = {}) {
    super('FORBIDDEN', message, { status: 403, ...options });
  }
}

export class SnowNotFoundError extends SnowError {
  constructor(message: string, options: SnowErrorOptions = {}) {
    super('NOT_FOUND', message, { status: 404, ...options });
  }
}

export class SnowBadRequestError extends SnowError {
  constructor(message: string, options: SnowErrorOptions = {}) {
    super('BAD_REQUEST', message, { status: 400, ...options });
  }
}

export class SnowRateLimitError extends SnowError {
  readonly retryAfterMs?: number;

  constructor(retryAfterMs?: number) {
    super('RATE_LIMITED', 'The instance is rate limiting requests.', { status: 429, retriable: true });
    this.retryAfterMs = retryAfterMs;
  }
}

export class SnowServerError extends SnowError {
  constructor(status: number, message: string, detail?: string) {
    super('SERVER_ERROR', message, { status, detail, retriable: [502, 503, 504].includes(status) });
  }
}

export class SnowInvalidResponseError extends SnowError {
  constructor(message: string, options: SnowErrorOptions = {}) {
    super('INVALID_RESPONSE', message, options);
  }
}

/** Errors from the OAuth token endpoint (RFC 6749 error codes such as invalid_client). */
export class SnowOAuthError extends SnowError {
  readonly oauthError: string;

  constructor(oauthError: string, description?: string, status?: number) {
    super('OAUTH_ERROR', description ? `${oauthError}: ${description}` : oauthError, { status });
    this.oauthError = oauthError;
  }
}

export function isSnowError(error: unknown): error is SnowError {
  return error instanceof SnowError;
}

export interface LearnerFacingError {
  title: string;
  message: string;
  /** What the learner should do next. */
  action: string;
}

/** Turns any error into a short, actionable explanation for the learner. */
export function describeSnowError(error: unknown, instance?: string): LearnerFacingError {
  const host = instance ? `${instance}.service-now.com` : 'your instance';
  if (!isSnowError(error)) {
    return {
      title: 'Something went wrong',
      message: error instanceof Error ? error.message : String(error),
      action: 'Try again. If it keeps happening, check the server logs.',
    };
  }
  switch (error.code) {
    case 'INVALID_INSTANCE':
      return {
        title: 'Check the instance name',
        message: error.message,
        action: 'Enter just the instance name, e.g. "dev12345" for dev12345.service-now.com.',
      };
    case 'INSTANCE_NOT_FOUND':
      return {
        title: 'Instance not found',
        message: `Nothing answers at ${host}.`,
        action:
          'Check the instance name in Settings. If your PDI was reclaimed after a long period of inactivity, request a new one at developer.servicenow.com.',
      };
    case 'HIBERNATING':
      return {
        title: 'Your PDI is asleep',
        message: `${host} is hibernating.`,
        action: 'Wake it at developer.servicenow.com, wait until it says it is ready, then retry.',
      };
    case 'TIMEOUT':
      return {
        title: 'Your PDI is slow to respond',
        message: error.message,
        action: 'It may still be waking up. Wait a minute and retry.',
      };
    case 'UNREACHABLE':
      return {
        title: 'Could not reach your PDI',
        message: error.message,
        action: 'Check your network connection and that the instance is awake, then retry.',
      };
    case 'UNAUTHORIZED':
      return {
        title: 'Your PDI connection has expired',
        message: error.message,
        action: 'Reconnect your PDI on the Settings page.',
      };
    case 'OAUTH_ERROR':
      return {
        title: 'Your PDI rejected the OAuth request',
        message: error.message,
        action:
          'Check the client ID, client secret and redirect URL of the OAuth app in your PDI, then reconnect.',
      };
    case 'FORBIDDEN':
      return {
        title: 'Missing access in your PDI',
        message: error.message,
        action: 'Connect as a user with the admin role (the default PDI admin user works).',
      };
    case 'RATE_LIMITED':
      return {
        title: 'Your PDI is rate limiting requests',
        message: error.message,
        action: 'Wait a minute and retry.',
      };
    default:
      return {
        title: 'Unexpected response from your PDI',
        message: error.detail ? `${error.message} (${error.detail})` : error.message,
        action: 'Retry. If it persists, check that the instance is healthy in your browser.',
      };
  }
}
