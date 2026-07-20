export type ApiSuccess<T> = {
  success: true;
  data: T;
  requestId: string;
};

export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type TokenProvider = () => Promise<string | null>;

export type ApiClientOptions = {
  baseUrl: string;
  getAuthToken?: TokenProvider;
  getAppCheckToken?: TokenProvider;
  timeoutMs?: number;
};

export type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  idempotencyKey?: string;
  requestId?: string;
  timeoutMs?: number;
};

const pendingGets = new Map<string, Promise<unknown>>();

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

export class MaratonouApiClient {
  private readonly baseUrl: string;
  private readonly getAuthToken?: TokenProvider;
  private readonly getAppCheckToken?: TokenProvider;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getAuthToken = options.getAuthToken;
    this.getAppCheckToken = options.getAppCheckToken;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const key = `${method}:${path}`;
    if (method === 'GET' && pendingGets.has(key)) return pendingGets.get(key) as Promise<T>;
    const operation = this.execute<T>(path, { ...options, method });
    if (method === 'GET') pendingGets.set(key, operation);
    try {
      return await operation;
    } finally {
      if (method === 'GET') pendingGets.delete(key);
    }
  }

  private async execute<T>(path: string, options: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
    try {
      const [authToken, appCheckToken] = await Promise.all([
        this.getAuthToken?.() ?? null,
        this.getAppCheckToken?.() ?? null,
      ]);
      const headers = new Headers(options.headers);
      headers.set('Accept', 'application/json');
      headers.set('X-Request-Id', options.requestId || randomId());
      if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
      if (appCheckToken) headers.set('X-Firebase-AppCheck', appCheckToken);
      if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
      let body: BodyInit | undefined;
      if (options.body !== undefined) {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(options.body);
      }
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        body,
        // Cloudflare Access authenticates the API subdomain with its own
        // HttpOnly cookie. Firebase authority still travels in the bearer
        // token and the backend also enforces a strict Origin allowlist.
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as ApiSuccess<T> | ApiFailure | null;
      if (!response.ok || !payload || payload.success !== true) {
        const failure = payload && payload.success === false ? payload : null;
        if ([401, 403].includes(response.status) && typeof globalThis.dispatchEvent === 'function') {
          globalThis.dispatchEvent(new CustomEvent('maratonou:admin-authorization-lost', {
            detail: { status: response.status, code: failure?.error.code || 'UNAUTHORIZED' },
          }));
        }
        throw new ApiError(
          response.status,
          failure?.error.code || 'INVALID_RESPONSE',
          failure?.error.message || 'A API retornou uma resposta inválida.',
          failure?.requestId,
          failure?.error.details,
        );
      }
      return payload.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError(408, 'REQUEST_TIMEOUT', 'A solicitação demorou mais do que o esperado.');
      }
      throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar à API administrativa.');
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
}
