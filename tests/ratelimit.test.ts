import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenBucket, fetchWithRetry, buckets } from "../lib/etl/ratelimit";

describe("TokenBucket", () => {
  it("allows capacity requests immediately, then blocks until refill", async () => {
    const b = new TokenBucket(2, 100000); // huge refill
    await b.acquire();
    await b.acquire();
    // burst exhausted
    const blocked = new TokenBucket(1, 0.5); // 0.5/s
    await blocked.acquire();
    const t0 = Date.now();
    await blocked.acquire();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
  });
});

describe("fetchWithRetry", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("too many", { status: 429 }))
      .mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const bucket = buckets.anilist;
    const res = await fetchWithRetry("https://x.test/a", bucket, { on429CooldownMs: 1, retries: 2 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after retries exhausted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 429 })));
    await expect(
      fetchWithRetry("https://x.test/b", buckets.tmdb, { retries: 2, on429CooldownMs: 1 }),
    ).rejects.toThrow(/rate-limited/);
  });

  it("sends a user-agent header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchWithRetry("https://x.test/c", buckets.googlebooks);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["user-agent"]).toContain("Omnlib");
  });
});