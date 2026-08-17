import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi} from 'vitest';
import {http, HttpResponse} from 'msw';
import { setupServer } from 'msw/node'
import handler from "../api/index.mjs";

const ASSET_HOSTS = new Set([
  "raw.githubusercontent.com", "objects.githubusercontent.com",
  "gist.githubusercontent.com", "user-images.githubusercontent.com",
  "github.com",
]);

const assetHandlers = Array.from(ASSET_HOSTS).map(host => {
    return http.get(`https://${host}/*`, () => {
        return new HttpResponse(Buffer.from('eyes-once.svg'), {
            headers: { 'Content-Type': 'image/svg+xml' },
        });
    });
});


//1. NETWORK MOCKING
// Intercept all outgoing fetch calls
const server = setupServer(
    ...assetHandlers,

    http.get('https://*.upstash.io/getdel/*', () => {
        return HttpResponse.json({result: null})
    }),

    http.get('https://*.uptash.io/set/*', () => {
        return HttpResponse.json({result: 'OK'});
    })
);

// Start intercepting request before all the tests
beforeAll(() => server.listen( {onUnhandledRequest: 'error' } ));

// Stop intercepting after all the tests
afterAll(() => server.close());

describe('Edge Handler Edge Cases', () => {
    beforeEach(() => {
        // Take over the system clock to test the 12-second cache expiration
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

        // Reset MSW handlers to the default above in case a test overwrote them
        server.resetHandlers();
    });

    afterEach(() => {
        // Restore the system clock after each test
        vi.useRealTimers();
    });


    it('Throw error when missing back parameter', async () => {
        const req = new Request('http://localhost/play?still=https://github.com/a.png&play=https://github.com/b.png');
        
        const res = await handler(req);
        
        expect(res.status).toBe(400);

        const text = await res.text();
        expect(text).toContain("Missing required parameter: 'back'");
    })    

    it('redirect /play requests', async () => {
        const req = new Request('http://localhost/play?still=https://github.com/a.png&play=https://github.com/b.png&back=https://github.com/qvd808');
        
        const res = await handler(req);
        
        expect(res.status).toBe(302);
        // Asserts that we fallback to the default back URL if no referrer is present
        expect(res.headers.get('Location')).toBe('https://github.com/qvd808');
    })    


    it('Falls back to back parameter when mode=auto and the Referer path is stripped to root (Brave browser)', async () => {
        const req = new Request('http://localhost/play?mode=auto&still=https://github.com/a.png&play=https://github.com/b.png&back=https://github.com/qvd808/fallback-repo', {
            headers: { 
                // Brave strips cross-site referers down to just the origin root
                'Referer': 'https://github.com/' 
            }
        });

        const res = await handler(req);
        
        expect(res.status).toBe(302);
        // It must ignore the root path and fall back to the explicit 'back' URL
        expect(res.headers.get('Location')).toBe('https://github.com/qvd808/fallback-repo');

    })    

    it('successfully uses mode=auto and redirects to the full Referer path when available', async () => {
        const req = new Request('http://localhost/play?mode=auto&still=https://github.com/a.png&play=https://github.com/b.png&back=https://github.com/qvd808', {
            headers: { 
                // Standard browser sending a full path (e.g., viewing the repo page)
                'Referer': 'https://github.com/fallback/qvd808' 
            }
        });
        
        const res = await handler(req);
        
        expect(res.status).toBe(302);
        // It should override the fallback 'back' and return the user right back inside the repo
        expect(res.headers.get('Location')).toBe('https://github.com/fallback/qvd808');
        expect(res.headers.get('Vary')).toBe('Referer');
    });


    it('falls back to back parameter when mode=auto but Referer header is completely missing', async () => {
        const req = new Request('http://localhost/play?mode=auto&still=https://github.com/a.png&play=https://github.com/b.png&back=https://github.com/qvd808/fallback-repo', {
            // No Referer header provided at all
        });
        
        const res = await handler(req);
        
        expect(res.status).toBe(302);
        // Without any referer data, it gracefully defaults to the 'back' parameter
        expect(res.headers.get('Location')).toBe('https://github.com/qvd808/fallback-repo');
    });
})