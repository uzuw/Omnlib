// Per-provider rate limiting: a token bucket + a fetch wrapper with 429 backoff.
// Keeps us inside provider quotas even when ETL fires many requests in a burst.

export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {
    this.tokens = capacity;
    this.last = Date.now();
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await new Promise((r) => setTimeout(r, Math.max(10, Math.round(250 / this.refillPerSec))));
    }
  }
}

/** Shared buckets (module-level singletons). */
export const buckets: Record<string, TokenBucket> = {
  anilist: new TokenBucket(30, 1.5), // ~90/min ceiling, stay well under
  kitsu: new TokenBucket(10, 2),
  tmdb: new TokenBucket(10, 2),
  googlebooks: new TokenBucket(5, 1),
  openlibrary: new TokenBucket(2, 0.8), // polite, ~1/s
};

export interface FetchOptions extends RequestInit {
  /** How many times to retry (429/5xx) before giving up. */
  retries?: number;
  /** Manual cooldown to apply on 429 (ms). */
  on429CooldownMs?: number;
  /** Overall deadline for a single call including retries. */
  timeoutMs?: number;
}

/**
 * fetch wrapped with a token-bucket + exponential backoff on 429/5xx.
 * Throws on final failure so callers can degrade gracefully.
 */
export async function fetchWithRetry(
  url: string,
  bucket: TokenBucket,
  opts: FetchOptions = {},
): Promise<Response> {
  const { retries = 3, headers, on429CooldownMs = 1500, timeoutMs = 12000, signal, ...rest } = opts;
  const deadline = Date.now() + timeoutMs;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`provider timeout after ${timeoutMs}ms`)), timeoutMs);
  const combined = signal ? AbortSignal.any([signal, ac.signal]) : ac.signal;
  let attempt = 0;
  try {
  for (;;) {
    await bucket.acquire();
    const res = await fetch(url, {
      ...rest,
      signal: combined,
      headers: { "user-agent": "Omnlib/0.1 (+local library)", ...headers },
    });
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      attempt += 1;
      if (attempt > retries) throw new Error(`rate-limited ${res.status} for ${url}`);
      const remaining = deadline - Date.now();
      const wait = Math.min(on429CooldownMs * 2 ** (attempt - 1), Math.max(remaining, 0));
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`provider http ${res.status} for ${url}`);
    return res;
  }
  } finally {
    clearTimeout(timer);
  }
}