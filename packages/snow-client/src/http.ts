import type { z } from 'zod';
import {
  SnowAuthError,
  SnowBadRequestError,
  SnowError,
  SnowForbiddenError,
  SnowHibernatingError,
  SnowInstanceNotFoundError,
  SnowInvalidResponseError,
  SnowNotFoundError,
  SnowOAuthError,
  SnowRateLimitError,
  SnowServerError,
  SnowTimeoutError,
  SnowUnreachableError,
} from './errors';
import { looksLikeHibernation } from './hibernation';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface TokenProvider {
  /** Returns a valid access token, refreshing first if it is about to expire. */
  getAccessToken(): Promise<string>;
  /** Forces a refresh after the instance rejected the current token. */
  refreshAccessToken(): Promise<string>;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface HttpOptions {
  baseUrl: string;
  tokens?: TokenProvider;
  fetch?: FetchLike;
  timeoutMs?: number;
  retry?: Partial<RetryPolicy>;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface RequestSpec<S extends z.ZodType> {
  method?: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  /** application/x-www-form-urlencoded body (OAuth token endpoint). */
  form?: Record<string, string>;
  schema: S;
  /** Send the bearer token (default true). */
  auth?: boolean;
  /**
   * Safe to repeat after a timeout or dropped connection. Non-idempotent requests are only
   * retried when the instance explicitly rejected them (429).
   */
  idempotent?: boolean;
}

const DEFAULT_RETRY: RetryPolicy = { maxRetries: 3, baseDelayMs: 300, maxDelayMs: 5_000 };
const MAX_RETRY_AFTER_MS = 30_000;

export class SnowHttp {
  readonly baseUrl: string;
  private readonly tokens?: TokenProvider;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly retry: RetryPolicy;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: HttpOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.tokens = options.tokens;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.retry = { ...DEFAULT_RETRY, ...options.retry };
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
  }

  async request<S extends z.ZodType>(spec: RequestSpec<S>): Promise<z.infer<S>> {
    const idempotent = spec.idempotent ?? (spec.method ?? 'GET') === 'GET';
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.send(spec);
      } catch (error) {
        if (error instanceof SnowAuthError && !refreshed && spec.auth !== false && this.tokens) {
          refreshed = true;
          await this.tokens.refreshAccessToken();
          attempt--; // a token refresh is not a retry
          continue;
        }
        if (!this.shouldRetry(error, attempt, idempotent)) throw error;
        await this.sleep(this.delayFor(error as SnowError, attempt));
      }
    }
  }

  private shouldRetry(error: unknown, attempt: number, idempotent: boolean): boolean {
    if (!(error instanceof SnowError) || !error.retriable) return false;
    if (attempt >= this.retry.maxRetries) return false;
    return idempotent || error instanceof SnowRateLimitError;
  }

  private delayFor(error: SnowError, attempt: number): number {
    if (error instanceof SnowRateLimitError && error.retryAfterMs !== undefined) {
      return Math.min(error.retryAfterMs, MAX_RETRY_AFTER_MS);
    }
    const exponential = Math.min(this.retry.maxDelayMs, this.retry.baseDelayMs * 2 ** attempt);
    return Math.round(exponential * (0.5 + this.random() * 0.5)); // jitter
  }

  private async send<S extends z.ZodType>(spec: RequestSpec<S>): Promise<z.infer<S>> {
    const url = this.buildUrl(spec.path, spec.query);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (spec.auth !== false && this.tokens) {
      headers.Authorization = `Bearer ${await this.tokens.getAccessToken()}`;
    }
    let body: string | undefined;
    if (spec.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(spec.form).toString();
    }

    const response = await this.fetchWithTimeout(url, {
      method: spec.method ?? 'GET',
      headers,
      body,
      redirect: 'manual',
    });
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();

    if (
      looksLikeHibernation({
        status: response.status,
        location: response.headers.get('location'),
        contentType,
        body: text,
      })
    ) {
      throw new SnowHibernatingError({ status: response.status });
    }
    if (response.status >= 300 && response.status < 400) {
      throw new SnowInvalidResponseError(
        `Unexpected redirect (${response.status}) to ${response.headers.get('location') ?? 'an unknown location'}.`,
        { status: response.status },
      );
    }

    const json = parseJson(text, contentType);
    if (!response.ok) throw errorForStatus(response, json, text);
    if (json === undefined) {
      throw new SnowInvalidResponseError(
        `Expected JSON from ${spec.path} but got ${contentType || 'no content type'}.`,
        {
          status: response.status,
        },
      );
    }

    const parsed = spec.schema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new SnowInvalidResponseError(`Unexpected response shape from ${spec.path}.`, {
        detail: issues.join('; '),
      });
    }
    return parsed.data;
  }

  private buildUrl(path: string, query: RequestSpec<z.ZodType>['query']): string {
    const url = `${this.baseUrl}${path}`;
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      throw networkError(error, url, this.timeoutMs);
    }
  }
}

function parseJson(text: string, contentType: string): unknown {
  if (!text) return undefined;
  if (!contentType.includes('json') && !/^\s*[[{]/.test(text)) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** ServiceNow error bodies look like {"error": {"message": "...", "detail": "..."}, "status": "failure"}. */
function serviceNowErrorMessage(json: unknown): { message?: string; detail?: string } {
  if (!json || typeof json !== 'object') return {};
  const error = (json as { error?: unknown }).error;
  if (error && typeof error === 'object') {
    const { message, detail } = error as { message?: unknown; detail?: unknown };
    return {
      message: typeof message === 'string' ? message : undefined,
      detail: typeof detail === 'string' ? detail : undefined,
    };
  }
  // CI/CD API errors use {"result": {"error": "...", "status_message": "..."}}.
  const result = (json as { result?: { error?: unknown; status_message?: unknown } }).result;
  if (result && typeof result === 'object') {
    const message =
      typeof result.error === 'string' && result.error ? result.error : result.status_message;
    return { message: typeof message === 'string' ? message : undefined };
  }
  return {};
}

function errorForStatus(response: Response, json: unknown, text: string): SnowError {
  const oauth = oauthErrorBody(json);
  if (oauth) return new SnowOAuthError(oauth.error, oauth.description, response.status);
  const { message, detail } = serviceNowErrorMessage(json);
  const status = response.status;
  const fallback = message ?? (text.slice(0, 200) || response.statusText || `HTTP ${status}`);
  switch (status) {
    case 400:
      return new SnowBadRequestError(fallback, { detail });
    case 401:
      return new SnowAuthError(message ?? undefined, { detail });
    case 403:
      return new SnowForbiddenError(fallback, { detail });
    case 404:
      return new SnowNotFoundError(fallback, { detail });
    case 429:
      return new SnowRateLimitError(retryAfterMs(response.headers.get('retry-after')));
    default:
      return status >= 500
        ? new SnowServerError(status, fallback, detail)
        : new SnowInvalidResponseError(fallback, { status, detail });
  }
}

/** OAuth token endpoint errors (RFC 6749 §5.2): {"error": "invalid_grant", "error_description": "..."}. */
function oauthErrorBody(json: unknown): { error: string; description?: string } | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const { error, error_description } = json as { error?: unknown; error_description?: unknown };
  if (typeof error !== 'string') return undefined;
  return {
    error,
    description: typeof error_description === 'string' ? error_description : undefined,
  };
}

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function networkError(error: unknown, url: string, timeoutMs: number): SnowError {
  if (error instanceof SnowError) return error;
  const name = (error as { name?: string })?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return new SnowTimeoutError(timeoutMs);
  const code =
    (error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
  const host = safeHost(url);
  if (code === 'ENOTFOUND') return new SnowInstanceNotFoundError(host, error);
  return new SnowUnreachableError(
    `Could not connect to ${host}${code ? ` (${code})` : ''}.`,
    error,
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
