import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const ASSET_HOSTS = new Set([
    "raw.githubusercontent.com",
    "objects.githubusercontent.com",
    "gist.githubusercontent.com",
    "user-images.githubusercontent.com",
    "github.com",
]);

// Flexible MSW handlers returning exact binary payloads
const assetHandlers = Array.from(ASSET_HOSTS).map(host => {
    return http.get(`https://${host}/*`, ({ request }) => {
        const url = new URL(request.url);

        if (url.pathname.endsWith('.webp')) {
            return new HttpResponse(Buffer.from('RIFF-WEBP-POSTER-BYTES'), {
                headers: { 'Content-Type': 'image/webp' },
            });
        }

        return new HttpResponse(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>eyes-once</text></svg>'), {
            headers: { 'Content-Type': 'image/svg+xml' },
        });
    });
});

/** @type {Map<string, string>} */
const redisMockStore = new Map();

const server = setupServer(
    ...assetHandlers,
    http.get('https://*.upstash.io/getdel/:key', ({ params }) => {
        /** @type {string} */
        const key = /** @type {string} */ (params.key);
        const val = redisMockStore.get(key) ?? null;
        redisMockStore.delete(key);
        return HttpResponse.json({ result: val });
    }),
    http.get('https://*.upstash.io/get/:key', ({ params }) => {
        /** @type {string} */
        const key = /** @type {string} */ (params.key);
        return HttpResponse.json({ result: redisMockStore.get(key) ?? null });
    }),
    http.get('https://*.upstash.io/set/:key/:val', ({ params }) => {
        /** @type {string} */
        const key = /** @type {string} */ (params.key);
        /** @type {string} */
        const val = /** @type {string} */ (params.val);
        redisMockStore.set(key, decodeURIComponent(val));
        return HttpResponse.json({ result: 'OK' });
    })
);

// Explicit cache retirement — declared here so every suite must opt-in consciously
const retire_memory = () => vi.resetModules();

/**
 * @param {string} [key]
 */
const retire_redis = (key) => {
    if (key) {
        redisMockStore.delete(key);
    } else {
        redisMockStore.clear();
    }
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

// ============================================================================
// 1. REQUEST FLOW & REDIRECTS
// ============================================================================
describe('Edge Handler — Request Flow & Redirects', () => {
    /** @type {any} */
    let handler;

    beforeEach(async () => {
        retire_memory();
        retire_redis();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
        server.resetHandlers();

        const mod = await import("../api/index.mjs");
        handler = mod.default;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('throws error when missing back parameter', async () => {
        const req = new Request('http://localhost/play?still=https://github.com/poster.webp&play=https://github.com/eyes-once.svg');
        const res = await handler(req);

        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toContain("Params back is required");
    });

    it ('Throws error when back parameter is not in allowed hosts', async () => {
        const req = new Request('http://localhost/play?still=https://github.com/poster.webp&play=https://github.com/eyes-once.svg&back=https://evil.com/qvd808');
        const res = await handler(req);

        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toContain("back parameters contains URL not from ALLOWED_HOSTS");
    });

    it ('Throws error when back parameter is not https', async () => {
        const req = new Request('http://localhost/play?still=https://github.com/poster.webp&play=https://github.com/eyes-once.svg&back=http://github.com/qvd808');
        const res = await handler(req);

        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toContain("Not an HTTPS request - REJECT");
    });

    it('serves the black canvas when still is on a disallowed host', async () => {
    const res = await handler(new Request('http://localhost/scene?still=https://evil.com/x.webp'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('fill="#000000"');
    });

    it('redirects /play requests', async () => {
        const req = new Request('http://localhost/play?still=https://github.com/poster.webp&play=https://github.com/eyes-once.svg&back=https://github.com/qvd808');
        const res = await handler(req);

        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('https://github.com/qvd808');
    });

    it('falls back to back parameter when mode=auto and the Referer path is stripped to root (Brave browser)', async () => {
        const req = new Request('http://localhost/play?mode=auto&still=https://github.com/poster.webp&play=https://github.com/eyes-once.svg&back=https://github.com/qvd808/fallback-repo', {
            headers: { 'Referer': 'https://github.com/' }
        });

        const res = await handler(req);
        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('https://github.com/qvd808/fallback-repo');
    });

    it('successfully uses mode=auto and redirects to the full Referer path when available', async () => {
        const req = new Request('http://localhost/play?mode=auto&still=https://github.com/poster.webp&play=https://github.com/eyes-once.svg&back=https://github.com/qvd808', {
            headers: { 'Referer': 'https://github.com/fallback/qvd808' }
        });

        const res = await handler(req);
        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('https://github.com/fallback/qvd808');
        expect(res.headers.get('Vary')).toBe('Referer');
    });

    it('falls back to back parameter when mode=auto but Referer header is completely missing', async () => {
        const req = new Request('http://localhost/play?mode=auto&still=https://github.com/poster.webp&play=https://github.com/eyes-once.svg&back=https://github.com/qvd808/fallback-repo');
        const res = await handler(req);

        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('https://github.com/qvd808/fallback-repo');
    });

    it('returns 200 with an empty body on HEAD requests for assets', async () => {
        const req = new Request('http://localhost/scene?still=https://github.com/poster.webp&back=https://github.com/qvd808', {
            method: 'HEAD'
        });

        const res = await handler(req);
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/webp');
        expect(await res.text()).toBe('');
    });

    it('returns 502 when fetching a remote asset fails', async () => {
        server.use(
            http.get('https://github.com/broken.webp', () => new HttpResponse(null, { status: 404 }))
        );

        const req = new Request('http://localhost/scene?still=https://github.com/broken.webp&back=https://github.com/qvd808');
        const res = await handler(req);

        expect(res.status).toBe(502);
        expect(await res.text()).toContain('Failed to fetch remote asset');
    });

    it('serves play asset immediately after /play request', async () => {
        const back = 'https://github.com/qvd808';
        const still = 'https://github.com/poster.webp';
        const play = 'https://github.com/eyes-once.svg';

        await handler(new Request(`http://localhost/play?back=${back}&still=${still}&play=${play}`));
        const res = await handler(new Request(`http://localhost/scene?back=${back}&still=${still}&play=${play}`));

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
        expect(await res.text()).toContain('eyes-once');
    });

    it('reverts to poster.webp after play state expires past 12s', async () => {
        const back = 'https://github.com/qvd808';
        const still = 'https://github.com/poster.webp';
        const play = 'https://github.com/eyes-once.svg';

        await handler(new Request(`http://localhost/play?back=${back}&still=${still}&play=${play}`));
        vi.advanceTimersByTime(13000);

        const res = await handler(new Request(`http://localhost/scene?back=${back}&still=${still}&play=${play}`));

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/webp');
        expect(await res.text()).toBe('RIFF-WEBP-POSTER-BYTES');
    });

    it('allows explicit cache retirement using retire_redis and retire_memory', async () => {
        const back = 'https://github.com/qvd808';
        const still = 'https://github.com/poster.webp';
        const play = 'https://github.com/eyes-once.svg';

        await handler(new Request(`http://localhost/play?back=${back}&still=${still}&play=${play}`));

        retire_redis();
        retire_memory();

        const mod = await import("../api/index.mjs");
        const freshHandler = mod.default;

        const res = await freshHandler(new Request(`http://localhost/scene?back=${back}&still=${still}&play=${play}`));

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/webp');
    });
});

// ============================================================================
// 2. FALLBACKS & MISSING ASSETS
// ============================================================================
describe('Edge Handler — Fallbacks & Missing Assets', () => {
    /** @type {any} */
    let handler;

    beforeEach(async () => {
        retire_memory();
        retire_redis();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
        server.resetHandlers();

        const mod = await import("../api/index.mjs");
        handler = mod.default;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('serves black canvas when both still and play are missing', async () => {
        const req = new Request('http://localhost/scene?back=https://github.com/qvd808');
        const res = await handler(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
        const body = await res.text();
        expect(body).toContain('fill="#000000"');
    });

    it('serves still image when play parameter is missing', async () => {
        const req = new Request('http://localhost/scene?still=https://github.com/poster.webp&back=https://github.com/qvd808');
        const res = await handler(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/webp');
        expect(await res.text()).toBe('RIFF-WEBP-POSTER-BYTES');
    });

    it('does not attempt animation when play parameter is missing', async () => {
        const req = new Request('http://localhost/scene?still=https://github.com/poster.webp&back=https://github.com/qvd808');
        const res = await handler(req);

        // Should serve still, not black canvas, and not crash on missing play
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/webp');
    });

    it('redirects on /play even when play asset is not configured', async () => {
        const req = new Request('http://localhost/play?still=https://github.com/poster.webp&back=https://github.com/qvd808');
        const res = await handler(req);

        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('https://github.com/qvd808');
    });
});

// ============================================================================
// 3. NETWORK CALL & CACHE INTERACTION
// ============================================================================
describe('Network Call & Cache Interaction', () => {
    /** @type {any} */
    let handler;
    /** @type {any} */
    let fetchRemoteAsset;

    beforeEach(async () => {
        retire_memory();
        retire_redis();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
        server.resetHandlers();

        const mod = await import("../api/index.mjs");
        handler = mod.default;
        const shared = await import("../api/_shared.mjs");
        fetchRemoteAsset = shared.fetchRemoteAsset;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('makes a network request on cold cache and suppresses it on warm cache', async () => {
        let calls = 0;
        const url = 'https://github.com/cold-warm.webp';

        server.use(
            http.get(url, () => {
                calls++;
                return new HttpResponse(Buffer.from('network-payload'), {
                    headers: { 'Content-Type': 'image/webp' },
                });
            })
        );

        // Cold: must hit the network
        const first = await fetchRemoteAsset(url);
        expect(calls).toBe(1);
        expect(Buffer.from(first.data).toString()).toBe('network-payload');

        // Warm: must NOT hit the network again
        const second = await fetchRemoteAsset(url);
        expect(calls).toBe(1);
        expect(Buffer.from(second.data).toString()).toBe('network-payload');
    });

    it('/play triggers a fire-and-forget network request to pre-warm the play asset', async () => {
        let calls = 0;
        const playUrl = 'https://github.com/pre-warm.svg';

        server.use(
            http.get(playUrl, () => {
                calls++;
                return new HttpResponse(Buffer.from('<svg>pre-warmed</svg>'), {
                    headers: { 'Content-Type': 'image/svg+xml' },
                });
            })
        );

        const req = new Request(`http://localhost/play?back=https://github.com/qvd808&still=https://github.com/poster.webp&play=${playUrl}`);
        const res = await handler(req);

        // User gets immediate redirect regardless of fetch outcome
        expect(res.status).toBe(302);

        // Let the unawaited fetchRemoteAsset promise settle
        await vi.runOnlyPendingTimersAsync();

        // The network call was still initiated inside fetchRemoteAsset
        expect(calls).toBe(1);
    });

    it('/play does not trigger pre-warm when play asset is missing', async () => {
        let posterCalls = 0;
        server.use(
            http.get('https://github.com/poster.webp', () => {
                posterCalls++;
                return new HttpResponse(Buffer.from('poster'), {
                    headers: { 'Content-Type': 'image/webp' },
                });
            })
        );

        const req = new Request('http://localhost/play?back=https://github.com/qvd808&still=https://github.com/poster.webp');
        const res = await handler(req);

        expect(res.status).toBe(302);
        expect(posterCalls).toBe(0);
    });

    it('/scene serves from cache without an extra network request after /play pre-warmed', async () => {
        let calls = 0;
        const playUrl = 'https://github.com/shared-cache.svg';

        server.use(
            http.get(playUrl, () => {
                calls++;
                return new HttpResponse(Buffer.from('<svg>cached</svg>'), {
                    headers: { 'Content-Type': 'image/svg+xml' },
                });
            })
        );

        // /play pre-warms the asset into the shared in-memory cache (fire-and-forget)
        await handler(new Request(`http://localhost/play?back=https://github.com/qvd808&still=https://github.com/poster.webp&play=${playUrl}`));

        // Let the unawaited pre-warm fetch settle before asserting
        await vi.runOnlyPendingTimersAsync();
        expect(calls).toBe(1);

        // /scene should serve the pre-warmed asset without a second network call
        const sceneReq = new Request(`http://localhost/scene?back=https://github.com/qvd808&still=https://github.com/poster.webp&play=${playUrl}`);
        const res = await handler(sceneReq);

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
        expect(calls).toBe(1); // exactly one network request total
    });
});

// ============================================================================
// 4. REMOTE ASSET CACHE — TTL BEHAVIOR
// ============================================================================
describe('Remote Asset Cache — TTL Behavior', () => {
    /** @type {any} */
    let fetchRemoteAsset;

    beforeEach(async () => {
        retire_memory();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
        server.resetHandlers();

        const shared = await import("../api/_shared.mjs");
        fetchRemoteAsset = shared.fetchRemoteAsset;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns cached data on second fetch within TTL', async () => {
        let calls = 0;
        const url = 'https://github.com/cache-test.webp';

        server.use(
            http.get(url, () => {
                calls++;
                return new HttpResponse(Buffer.from(`version-${calls}`), {
                    headers: { 'Content-Type': 'image/webp' },
                });
            })
        );

        const first = await fetchRemoteAsset(url);
        const second = await fetchRemoteAsset(url);

        expect(Buffer.from(first.data).toString()).toBe('version-1');
        expect(Buffer.from(second.data).toString()).toBe('version-1');
        expect(calls).toBe(1);
    });

    it('refetches when cache TTL expires', async () => {
        let calls = 0;
        const url = 'https://github.com/cache-expire.webp';

        server.use(
            http.get(url, () => {
                calls++;
                return new HttpResponse(Buffer.from(`version-${calls}`), {
                    headers: { 'Content-Type': 'image/webp' },
                });
            })
        );

        const first = await fetchRemoteAsset(url);
        expect(Buffer.from(first.data).toString()).toBe('version-1');

        vi.advanceTimersByTime(61000);

        const second = await fetchRemoteAsset(url);
        expect(Buffer.from(second.data).toString()).toBe('version-2');
        expect(calls).toBe(2);
    });
});

// ============================================================================
// 5. PLAY STATE — LOCAL MEMORY & REDIS SYNC
// ============================================================================
describe('Play State — Local Memory & Redis Sync', () => {
    /** @type {any} */
    let markPlaying;
    /** @type {any} */
    let isPlaying;
    /** @type {number} */
    let WINDOW_MS;

    beforeEach(async () => {
        retire_memory();
        retire_redis();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
        server.resetHandlers();

        // Default: no Redis so local-only tests are pure.
        // Tests that need Redis will set env, retire_memory, and re-import.
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;

        const shared = await import("../api/_shared.mjs");
        markPlaying = shared.markPlaying;
        isPlaying = shared.isPlaying;
        WINDOW_MS = shared.WINDOW_MS;
    });

    afterEach(() => {
        vi.useRealTimers();
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });

    it('markPlaying stores active state that isPlaying reads as true', async () => {
        await markPlaying('local-key');
        const active = await isPlaying('local-key');
        expect(active).toBe(true);
    });

    it('isPlaying returns false after WINDOW_MS expires', async () => {
        await markPlaying('expiring-key');
        vi.advanceTimersByTime(WINDOW_MS + 1);
        const active = await isPlaying('expiring-key');
        expect(active).toBe(false);
    });

    it('prefers local warm state and skips redis when local is still valid', async () => {
        // Set up Redis layer
        process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
        retire_memory();
        const shared = await import("../api/_shared.mjs");
        const localMarkPlaying = shared.markPlaying;
        const localIsPlaying = shared.isPlaying;

        await localMarkPlaying('prefers-local');
        // Manually delete from redis to prove local is authoritative
        retire_redis('prefers-local');
        const active = await localIsPlaying('prefers-local');
        expect(active).toBe(true);
    });

    it('falls back to redis when local warm entry has expired', async () => {
        // Set up Redis layer
        process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
        retire_memory();
        const shared = await import("../api/_shared.mjs");
        const localMarkPlaying = shared.markPlaying;
        const localIsPlaying = shared.isPlaying;
        const localWindowMs = shared.WINDOW_MS;

        await localMarkPlaying('redis-fallback');
        vi.advanceTimersByTime(localWindowMs + 1);

        // Local is now expired, but redis mock still holds the value
        const active = await localIsPlaying('redis-fallback');
        expect(active).toBe(true);
    });

    it('redis getdel removes the key after reading (one-shot distributed state)', async () => {
        // Set up Redis layer
        process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
        retire_memory();
        const shared = await import("../api/_shared.mjs");
        const localMarkPlaying = shared.markPlaying;
        const localIsPlaying = shared.isPlaying;
        const localWindowMs = shared.WINDOW_MS;

        await localMarkPlaying('one-shot');
        vi.advanceTimersByTime(localWindowMs + 1);

        // First read from redis should succeed and delete it
        const first = await localIsPlaying('one-shot');
        expect(first).toBe(true);

        // Second read should find nothing in either layer
        const second = await localIsPlaying('one-shot');
        expect(second).toBe(false);
    });
});
