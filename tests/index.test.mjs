import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi} from 'vitest';
import {http, HttpResponse} from 'msw';
import { setupServer } from 'msw/node'
import handler from "./api/index.mjs"


//1. NETWORK MOCKING
// Intercept all outgoing fetch calls
const server = setupServer(
    http.get('https://raw.githubusercontent.com/*', () => {
        return new HttpResponse(Buffer.from('eyes-once.svg'), {
            headers: { 'Content-Type': 'image/svg+xml' },
        });
    }),

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


    it('redirects /play requests and save state', async () => {
        const req = new Request('http://localhost/play?still=https://github.com/a.png&play=https://github.com/b.png');
        
        const res = await handler(req);
        
        expect(res.status).toBe(400);

        const text = await res.text();
        expect(text).toContain("Missing required parameter: 'back'");
    })    
})